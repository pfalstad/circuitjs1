/*
    Copyright (C) Paul Falstad and Iain Sharp

    This file is part of CircuitJS1.

    CircuitJS1 is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    CircuitJS1 is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with CircuitJS1.  If not, see <http://www.gnu.org/licenses/>.
*/

import { ChipElm, Pin } from "./ChipElm";
import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { VoltageSource } from "./VoltageSource";
import { StringTokenizer } from "./StringTokenizer";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { DEFAULT_GATE_DELAY_LH_S, DEFAULT_GATE_DELAY_HL_S } from "./GateElm";
import { customChipStart } from "./digital/chip_desc";
import type { ChipDesc } from "./digital/chip_desc";
import type { Chip } from "./digital/chip";
import type { DigitalSynthesis, DigitalTriStateDriver, DigitalTriStateReadback } from "./digital/DigitalGraphBuilder";

export class SRAMElm extends ChipElm implements DigitalTriStateDriver, DigitalTriStateReadback {
    static readonly FLAG_HEX_DISPLAY = 4;
    addressNodes: number = 0;
    dataNodes: number = 0;
    internalNodes: number = 0;
    addressBits: number = 0;
    dataBits: number = 0;
    map: Map<number, number>;
    initialMap: Map<number, number> | null = null; // saved initial contents for restore on reset
    loadedFileName: string | null = null; // remembers the last file loaded via "Load Contents From File"
    static readonly FLAG_RELOAD_ON_RESET = 2;
    static contentsOverride: string | null = null;
    static fileNameOverride: string | null = null;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.addressBits = this.dataBits = 4;
            this.map = new Map();
            this.setupPins();
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
            this.map = new Map();
            this.addressBits = parseInt(st!.nextToken());
            this.dataBits    = parseInt(st!.nextToken());
            this.setupPins();
            try {
                // load contents
                // format: addr val(addr) val(addr+1) val(addr+2) ... -1 addr val val ... -1 ... -2
                while (true) {
                    const a_str = st!.nextToken();
                    let a = parseInt(a_str);
                    if (a < 0)
                        break;
                    let v = parseInt(st!.nextToken());
                    this.map.set(a, v);
                    while (true) {
                        v = parseInt(st!.nextToken());
                        if (v < 0)
                            break;
                        this.map.set(++a, v);
                    }
                }
            } catch (e) {}
            if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0)
                this.initialMap = new Map(this.map);
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ab", this.addressBits);
        CircuitXMLSerializer.dumpAttr(elem, "db", this.dataBits);
    }
    dumpXmlState(doc: Document, elem: Element): void {
        super.dumpXmlState(doc, elem);
        if (this.map.size > 0)
            elem.appendChild(doc.createTextNode(this.contentsToString()));
    }
    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.addressBits = xml.parseIntAttr("ab", this.addressBits);
        this.dataBits = xml.parseIntAttr("db", this.dataBits);
        this.map = new Map();
        try {
            const s = xml.parseContents();
            if (s) this.parseContentsString(s);
        } catch (e) {}
        this.setupPins();
    }

    reset(): void {
        super.reset();
        if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0 && this.initialMap !== null)
            this.map = new Map(this.initialMap);
    }

    nonLinear(): boolean { return true; }
    allowBus(): boolean { return true; }
    getChipName(): string { return "Static RAM"; }
    setupPins(): void {
	if (this.addressBits === undefined)
	    this.addressBits = 0;
	if (this.dataBits === undefined)
	    this.dataBits = 0;
        this.sizeX = 2;
        const addrY = this.useBus() ? 1 : this.addressBits;
        const dataY = this.useBus() ? 1 : this.dataBits;
        this.sizeY = Math.max(addrY, dataY) + 1;
        this.bits = this.addressBits;
        this.pins = new Array(this.getPostCount());
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "WE");
        this.pins[0].lineOver = true;
        this.pins[1] = new Pin(this, 0, ChipElm.SIDE_E, "OE");
        this.pins[1].lineOver = true;
        this.addressNodes = 2;
        this.dataNodes = 2 + this.addressBits;
        this.internalNodes = 2 + this.addressBits + this.dataBits;
        this.makeBitPins(this.addressBits, this.sizeY - addrY, ChipElm.SIDE_W, this.addressNodes, "A", false, false, true);
        this.makeBitPins(this.dataBits, this.sizeY - dataY, ChipElm.SIDE_E, this.dataNodes, "D", true, false, true);
        this.allocNodes();
    }
    getPostCount(): number {
        return 2 + this.addressBits + this.dataBits;
    }
    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Address Bits", this.addressBits, 1, 1).setDimensionless();
        if (n === 1)
            return new EditInfo("# of Data Bits", this.dataBits, 1, 1).setDimensionless();
        if (n === 2) {
            const ei = new EditInfo("Contents", 0);
            ei.textArea = { value: SRAMElm.contentsOverride !== null ? SRAMElm.contentsOverride : this.contentsToString(), element: null };
            SRAMElm.contentsOverride = null;
            if (SRAMElm.fileNameOverride !== null)
                this.loadedFileName = SRAMElm.fileNameOverride;
            SRAMElm.fileNameOverride = null;
            return ei;
        }
        if (n === 3) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Hex Display", this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY));
            return ei;
        }
        const reloadIdx = 4;
        if (n === reloadIdx) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Restore Contents on Reset",
                (this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0);
            return ei;
        }
        return super.getChipEditInfo(n);
    }

    contentsToString(): string {
        const hex = this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY);
        let s = "";
        const maxI = 1 << this.addressBits;
        for (let i = 0; i < maxI; i++) {
            let val = this.map.get(i);
            if (val === undefined || val === 0)
                continue;
            s += (hex ? i.toString(16).toUpperCase() : "" + i) + ": " +
                 (hex ? this.toHex(val) : "" + val);
            let ct = 1;
            while (true) {
                val = this.map.get(++i);
                if (val === undefined || val === 0)
                    break;
                s += " " + (hex ? this.toHex(val) : "" + val);
                if (++ct === 8)
                    break;
            }
            s += "\n";
        }
        return s;
    }

    toHex(val: number): string {
        const mask = (1 << this.dataBits) - 1;
        const h = (val & mask).toString(16).toUpperCase();
        return h.length < 2 ? "0" + h : h;
    }

    parseContentsString(s: string): void {
        this.map.clear();
        const lines = s.split("\n");
        for (let i = 0; i !== lines.length; i++) {
            try {
                const line = lines[i];
                const args = line.split(/: */);
                let addr = this.parseNumber(args[0]);
                const vals = args[1].split(/ +/);
                for (let j = 0; j !== vals.length; j++) {
                    const val = this.parseNumber(vals[j]);
                    this.map.set(addr++, val);
                }
            } catch (e) {}
        }
    }

    parseNumber(str: string): number {
        if (str.startsWith("0x"))
            return parseInt(str.substring(2), 16);
        if (this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY))
            return parseInt(str, 16);
        if (str.startsWith("0b"))
            return parseInt(str.substring(2), 2);
        return parseInt(str);
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 2 && ei.value <= 16) {
                this.addressBits = Math.floor(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be between 2 and 16");
        }
        if (n === 1) {
            if (ei.value >= 2 && ei.value <= 16) {
                this.dataBits = Math.floor(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be between 2 and 16");
        }
        if (n === 2) {
            this.parseContentsString(ei.textArea.element ? ei.textArea.element.value : ei.textArea.value);
            if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0)
                this.initialMap = new Map(this.map);
        }
        if (n === 3) {
            const oldFlags = this.flags;
            if (ei.textArea && ei.textArea.element)
                this.parseContentsString(ei.textArea.element.value);
            this.flags = ei.changeFlag(this.flags, SRAMElm.FLAG_HEX_DISPLAY);
            if (this.flags !== oldFlags) {
                SRAMElm.contentsOverride = this.contentsToString();
                ei.newDialog = true;
            }
        }
        const reloadIdx = 4;
        if (n === reloadIdx) {
            this.flags = ei.changeFlag(this.flags, SRAMElm.FLAG_RELOAD_ON_RESET);
            if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0)
                this.initialMap = new Map(this.map);
            else
                this.initialMap = null;
        }
    }
    getVoltageSourceCount(): number { return this.dataBits; }
    getInternalNodeCount(): number { return this.dataBits; }
    setVoltageSource(j: number, vs: VoltageSource): void {
        super.setVoltageSource(j, vs);
        vs.setNodes(CircuitNode.ground, this.nodes[this.internalNodes + j]);
    }
    getMatrixConnection(n1: number, n2: number): boolean {
        // each internal node connects to its corresponding data pin
        for (let i = 0; i !== this.dataBits; i++)
            if (this.comparePair(n1, n2, this.internalNodes + i, this.dataNodes + i))
                return true;
        return false;
    }

    address: number = 0;

    stamp(): void {
        for (let i = 0; i !== this.dataBits; i++) {
            const p = this.pins[i + this.dataNodes];
            CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[this.internalNodes + i], p.voltSource!);
            CircuitElm.sim.stampNonLinear(this.nodes[this.internalNodes + i]);
            CircuitElm.sim.stampNonLinear(this.nodes[this.dataNodes + i]);
        }
    }

    doStep(): void {
        const writeEnabled = this.nodes[0].v < this.getThreshold();
        const outputEnabled = (this.nodes[1].v < this.getThreshold()) && !writeEnabled;

        // get address
        this.address = 0;
        for (let i = 0; i !== this.addressBits; i++) {
            this.address |= (this.nodes[this.addressNodes + i].v > this.getThreshold()) ? 1 << (this.addressBits - 1 - i) : 0;
        }

        const dataObj = this.map.get(this.address);
        const data = (dataObj === undefined) ? 0 : dataObj;
        for (let i = 0; i !== this.dataBits; i++) {
            const p = this.pins[i + this.dataNodes];
            CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[this.internalNodes + i], p.voltSource,
                (data & (1 << (this.dataBits - 1 - i))) === 0 ? 0 : this.highVoltage);

            // if output enabled, stamp a small resistor from internal voltage source to data pin.
            // if output disabled, stamp a large pulldown resistor from data pin to ground.
            if (outputEnabled)
                CircuitElm.sim.stampResistor(this.nodes[this.internalNodes + i], this.nodes[this.dataNodes + i], 1);
            else
                CircuitElm.sim.stampResistor(this.nodes[this.dataNodes + i], CircuitNode.ground, 1e8);
        }
    }

    stepFinished(): void {
        let data = 0;
        const writeEnabled = this.nodes[0].v < this.getThreshold();
        if (!writeEnabled)
            return;

        // store data in RAM
        for (let i = 0; i !== this.dataBits; i++) {
            data |= (this.nodes[this.dataNodes + i].v > this.getThreshold()) ? 1 << (this.dataBits - 1 - i) : 0;
        }
        this.map.set(this.address, data);
    }
    getDumpType(): number { return 413; }

    /** One CUSTOM_CHIP per data bit, matching how dice-ts's own real bipolar-RAM catalog entries
     * (chips/82S16.cpp, chips/8225.cpp) are built: address/CE/WE decoded straight from
     * chip.inputs, read and write handled together in one update function - see doStep()/
     * stepFinished() above for the exact same active-low WE/OE and MSB-first bit convention this
     * mirrors. Those real chips have SEPARATE physical Din/Dout pins per bit though (no ambiguity
     * about which one an update reads from); SRAMElm's data pins are genuinely bidirectional (the
     * same real pin drives while reading, receives while writing), which is why each bit's cell
     * also takes a `readback` input via digitalTriStateReadbackPin() below - a write must capture
     * whatever's ACTUALLY on the shared bus (an external writer's driven value), not this bit's
     * own output, which doStep()'s own outputEnabled logic forces to 0 while writing (see
     * isTriStateOutput()'s "AND(enable, data)" convention) and would therefore only ever read
     * back 0. */
    digitalSynthesis(): DigitalSynthesis {
        const m = this.addressBits;
        const n = this.dataBits;
        const wePin = 1;
        const oePin = 2;
        const addrPin = (k: number) => 3 + k;
        const driverPin = (i: number) => 3 + m + i;
        const readbackPin = (i: number) => 3 + m + n + i;

        const pinMap = new Map<number, number>();
        pinMap.set(0, wePin);
        pinMap.set(1, oePin);
        for (let k = 0; k < m; k++) pinMap.set(this.addressNodes + k, addrPin(k));

        const desc: ChipDesc[] = [];
        for (let i = 0; i < n; i++) {
            const bitMask = 1 << (n - 1 - i);

            const update = (chip: Chip, mask: number): void => {
                chip.inputs ^= mask;
                const weActive = (chip.inputs & 1) === 0; // WE is active low
                const oeActive = ((chip.inputs >> 1) & 1) === 0; // OE is active low
                let address = 0;
                for (let k = 0; k < m; k++) address |= ((chip.inputs >> (2 + k)) & 1) << (m - 1 - k);
                const readback = (chip.inputs >> (2 + m)) & 1;

                let newOut: number;
                if (weActive) {
                    const cur = this.map.get(address) ?? 0;
                    this.map.set(address, readback ? (cur | bitMask) : (cur & ~bitMask));
                    newOut = 0; // never drives while writing, same as doStep()'s outputEnabled
                } else if (oeActive) {
                    newOut = ((this.map.get(address) ?? 0) & bitMask) ? 1 : 0;
                } else {
                    newOut = 0; // tri-stated
                }

                if (newOut !== chip.output && chip.pendingEvent === 0n)
                    chip.pendingEvent = chip.circuit.queuePush(chip, chip.delay[chip.output]);
                else if (chip.pendingEvent !== 0n && newOut === chip.output)
                    chip.pendingEvent = 0n;
            };

            desc.push(customChipStart(update)
                .inputPins(wePin, oePin, ...Array.from({ length: m }, (_, k) => addrPin(k)), readbackPin(i))
                .outputPin(driverPin(i))
                .outputDelayS(DEFAULT_GATE_DELAY_LH_S, DEFAULT_GATE_DELAY_HL_S));
            pinMap.set(this.dataNodes + i, driverPin(i));
        }

        return { desc, pinMap };
    }

    isTriStateOutput(postIndex: number): boolean {
        return postIndex >= this.dataNodes && postIndex < this.dataNodes + this.dataBits;
    }

    digitalTriStateReadbackPin(postIndex: number): number | null {
        if (postIndex < this.dataNodes || postIndex >= this.dataNodes + this.dataBits) return null;
        return 3 + this.addressBits + this.dataBits + (postIndex - this.dataNodes);
    }
}
