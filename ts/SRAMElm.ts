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
import { DEFAULT_GATE_DELAY_LH_S, DEFAULT_GATE_DELAY_HL_S, disableOptimizationEditInfo } from "./GateElm";
import { sramBitCell, type SramMemory } from "./digital/nativeKinds";
import { chipStart } from "./digital/chip_desc";
import type { ChipDesc } from "./digital/chip_desc";
import type { Chip } from "./digital/chip";
import type { DigitalSynthesis, DigitalTriStateDriver, DigitalTriStateReadback } from "./digital/DigitalGraphBuilder";
import { CirSim } from "./CirSim";
import { Locale } from "./Locale";
import { parseIntStrict } from "./NumberParse";

export class SRAMElm extends ChipElm implements DigitalTriStateDriver, DigitalTriStateReadback {
    static readonly FLAG_HEX_DISPLAY = 4;
    addressNodes: number = 0;
    dataNodes: number = 0;
    // where a write reads its data from: dataNodes (the same bidirectional pins reads drive),
    // unless FLAG_SEPARATE_IO adds a separate set of data input pins after them
    dataInNodes: number = 0;
    internalNodes: number = 0;
    addressBits: number = 0;
    dataBits: number = 0;
    map: Map<number, number>;
    initialMap: Map<number, number> | null = null; // saved initial contents for restore on reset
    optimizationDisabled = false; // see DigitalSynthesis.optimizationDisabled
    loadedFileName: string | null = null; // remembers the last file loaded via "Load Contents From File"
    static readonly FLAG_RELOAD_ON_RESET = 2;
    // separate data in/out pins instead of one bidirectional bus, like bipolar RAMs (74189, 82S16)
    static readonly FLAG_SEPARATE_IO = 8;
    // invert the data outputs (74189, 82S16)
    static readonly FLAG_INVERT_OUTPUT = 16;
    // add an active-low chip select pin: while it's high, nothing is written and the outputs are off
    static readonly FLAG_CHIP_SELECT = 32;
    // (these flag values match ts-digital's SRAMElm, for compatibility)
    static contentsOverride: string | null = null;
    private contentsEi: EditInfo | null = null;  // the Contents field in the edit dialog, if any

    private getContentsTextArea(): HTMLTextAreaElement | null {
        return (this.contentsEi?.textArea?.element as HTMLTextAreaElement | null | undefined) ?? null;
    }
    static fileNameOverride: string | null = null;

    // The digital cells' view of the contents, read live through `this.map` (which reset/load
    // replace wholesale). One object for the element's lifetime, so syncFromEngine (set while
    // the WASM engine holds the live contents) can be reached from here.
    private memObj: SramMemory | undefined;
    private get mem(): SramMemory {
        return this.memObj ??= {
            read: (address) => this.map.get(address) ?? 0,
            write: (address, value) => { this.map.set(address, value); },
        };
    }

    /** Brings `map` up to date with the running digital circuit. */
    private syncContents(): void { this.mem.syncFromEngine?.(); }

    /** Called when `map` is replaced: the running circuit's copy is no longer wanted. */
    private detachContents(): void { this.mem.syncFromEngine = null; }

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
            this.addressBits = parseIntStrict(st!.nextToken());
            this.dataBits    = parseIntStrict(st!.nextToken());
            this.setupPins();
            try {
                // load contents
                // format: addr val(addr) val(addr+1) val(addr+2) ... -1 addr val val ... -1 ... -2
                while (true) {
                    const a_str = st!.nextToken();
                    let a = parseIntStrict(a_str);
                    if (a < 0)
                        break;
                    let v = parseIntStrict(st!.nextToken());
                    this.map.set(a, v);
                    while (true) {
                        v = parseIntStrict(st!.nextToken());
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
        if (this.optimizationDisabled)
            CircuitXMLSerializer.dumpAttr(elem, "nopt", true);
    }
    dumpXmlState(doc: Document, elem: Element): void {
        super.dumpXmlState(doc, elem);
        this.syncContents();
        if (this.map.size > 0)
            elem.appendChild(doc.createTextNode(this.contentsToString()));
        else
            // mark empty contents so the state isn't skipped (CompositeElm.dumpXmlState skips
            // children with no state), which would bring back the model's contents on reload
            CircuitXMLSerializer.dumpAttr(elem, "em", 1);
    }
    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.addressBits = xml.parseIntAttr("ab", this.addressBits);
        this.dataBits = xml.parseIntAttr("db", this.dataBits);
        this.optimizationDisabled = xml.parseBooleanAttr("nopt", this.optimizationDisabled);
        this.map = new Map();
        try {
            const s = xml.parseContents();
            if (s) this.parseContentsString(s, this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY), true);
        } catch (e) {}
        if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0)
            this.initialMap = new Map(this.map);
        this.setupPins();
    }

    hasSeparateIO(): boolean { return this.hasFlag(SRAMElm.FLAG_SEPARATE_IO); }
    hasInvertedOutput(): boolean { return this.hasFlag(SRAMElm.FLAG_INVERT_OUTPUT); }
    hasChipSelect(): boolean { return this.hasFlag(SRAMElm.FLAG_CHIP_SELECT); }
    // the chip select post, if any, comes after all the others so it doesn't renumber them
    protected get chipSelectNode(): number { return this.getPostCount() - 1; }

    // the pin options offered in the edit dialog, as flags
    protected pinOptions(): number[] {
        return [SRAMElm.FLAG_SEPARATE_IO, SRAMElm.FLAG_INVERT_OUTPUT, SRAMElm.FLAG_CHIP_SELECT];
    }
    private static readonly PIN_OPTION_NAMES: Record<number, string> = {
        [SRAMElm.FLAG_SEPARATE_IO]: "Separate Data In/Out",
        [SRAMElm.FLAG_INVERT_OUTPUT]: "Inverted Data Out",
        [SRAMElm.FLAG_CHIP_SELECT]: "Chip Select",
    };

    reset(): void {
        super.reset();
        if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0 && this.initialMap !== null) {
            this.detachContents();
            this.map = new Map(this.initialMap);
        }
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
        const separate = this.hasSeparateIO();
        const westY = separate ? addrY + dataY : addrY;
        // east side: OE, then chip select (if any), then the data pins at the bottom
        const eastY = this.hasChipSelect() ? dataY + 1 : dataY;
        this.sizeY = Math.max(westY, eastY) + 1;
        this.bits = this.addressBits;
        this.pins = new Array(this.getPostCount());
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "WE");
        this.pins[0].lineOver = true;
        this.pins[1] = new Pin(this, 0, ChipElm.SIDE_E, "OE");
        this.pins[1].lineOver = true;
        this.addressNodes = 2;
        this.dataNodes = 2 + this.addressBits;
        this.dataInNodes = separate ? this.dataNodes + this.dataBits : this.dataNodes;
        // internal nodes come right after the posts
        this.internalNodes = this.getPostCount();
        this.makeBitPins(this.addressBits, this.sizeY - addrY, ChipElm.SIDE_W, this.addressNodes, "A", false, false, true);
        this.makeBitPins(this.dataBits, this.sizeY - dataY, ChipElm.SIDE_E, this.dataNodes, "D", true, false, true);
        if (this.hasInvertedOutput())
            for (let i = 0; i !== this.dataBits; i++)
                this.pins[this.dataNodes + i].lineOver = true;
        if (separate)
            this.makeBitPins(this.dataBits, 1, ChipElm.SIDE_W, this.dataInNodes, "DI", false, false, true);
        if (this.hasChipSelect()) {
            const cs = new Pin(this, 1, ChipElm.SIDE_E, "CS");
            cs.lineOver = true;
            this.pins[this.chipSelectNode] = cs;
        }
        this.allocNodes();
    }
    getPostCount(): number {
        return 2 + this.addressBits + this.dataBits + (this.hasSeparateIO() ? this.dataBits : 0) +
            (this.hasChipSelect() ? 1 : 0);
    }
    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Address Bits", this.addressBits, 1, 1).setDimensionless().setStructural();
        if (n === 1)
            return new EditInfo("# of Data Bits", this.dataBits, 1, 1).setDimensionless().setStructural();
        if (n === 2) {
            const ei = new EditInfo("Contents", 0).setIsState();
            this.contentsEi = ei;
            ei.textArea = { value: SRAMElm.contentsOverride !== null ? SRAMElm.contentsOverride : this.contentsToString(), element: null };
            SRAMElm.contentsOverride = null;
            if (SRAMElm.fileNameOverride !== null)
                this.loadedFileName = SRAMElm.fileNameOverride;
            SRAMElm.fileNameOverride = null;
            return ei;
        }
        if (n === 3) {
            const ei = new EditInfo("", 0, -1, -1).setIsState();
            ei.checkbox = new Checkbox("Hex Display", this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY));
            return ei;
        }
        if (n === 4 && SRAMElm.loadFileSupported()) {
            const ei = new EditInfo(
                this.loadedFileName !== null ? "Loaded: " + this.loadedFileName : "",
                0, -1, -1).setIsState();
            const input = document.createElement("input");
            input.type = "file";
            input.addEventListener("change", () => {
                const file = input.files?.[0];
                if (file) SRAMElm.fetchLoadFileData(this, file);
            });
            ei.widget = input;
            return ei;
        }
        const reloadIdx = SRAMElm.loadFileSupported() ? 5 : 4;
        if (n === reloadIdx) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Restore Contents on Reset",
                (this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0);
            return ei;
        }
        const opts = this.pinOptions();
        const opt = opts[n - reloadIdx - 1];
        if (n > reloadIdx && opt !== undefined) {
            const ei = new EditInfo("", 0, -1, -1);
            if (opt !== SRAMElm.FLAG_INVERT_OUTPUT)
                ei.setStructural(); // adds pins
            ei.checkbox = new Checkbox(SRAMElm.PIN_OPTION_NAMES[opt], this.hasFlag(opt));
            return ei;
        }
        if (n === reloadIdx + opts.length + 1)
            return disableOptimizationEditInfo(this.optimizationDisabled);
        return super.getChipEditInfo(n - opts.length - 1);
    }

    static loadFileSupported(): boolean {
        return typeof File !== "undefined" && typeof FileReader !== "undefined";
    }

    // Load Contents From File: reads the raw bytes of the chosen file and turns them into the
    // same "addr: val val val..." text the Contents field understands, one value per byte (or,
    // for dataBits > 8, per big-endian 16-bit pair) - matching circuitjs1's SRAMLoadFile.
    static fetchLoadFileData(elm: SRAMElm, file: File): void {
        if (file.size >= 128000) {
            window.alert(Locale.LS("Cannot load: That file is too large!"));
            return;
        }
        const bytesPerValue = elm.dataBits > 8 ? 2 : 1;
        const hexDigits = bytesPerValue * 2;
        const reader = new FileReader();
        reader.onload = () => {
            const arr = new Uint8Array(reader.result as ArrayBuffer);
            const n = arr.length - (arr.length % bytesPerValue);
            let str = "0x0:";
            for (let i = 0; i < n; i += bytesPerValue) {
                let val = 0;
                for (let j = 0; j < bytesPerValue; j++)
                    val = (val << 8) | arr[i + j];
                let hex = val.toString(16).toUpperCase();
                while (hex.length < hexDigits)
                    hex = "0" + hex;
                str += " 0x" + hex;
            }
            SRAMElm.doLoadCallback(str, file.name);
        };
        reader.readAsArrayBuffer(file);
    }

    static doLoadCallback(data: string, fileName: string): void {
        SRAMElm.contentsOverride = data;
        SRAMElm.fileNameOverride = fileName;
        CirSim.editDialog?.resetDialog();
        SRAMElm.contentsOverride = null;
        SRAMElm.fileNameOverride = null;
    }

    contentsToString(): string {
        this.syncContents();
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

    // parse the Contents text ("addr: val val val..." lines) into this.map.  Returns an error
    // message for the first bad line, if any, in which case the contents are left unchanged
    // (unless lenient, when loading a file: then whatever could be parsed is used, as before).
    parseContentsString(s: string, hex: boolean = this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY),
                        lenient: boolean = false): string | null {
        const map: Map<number, number> = new Map();
        let error: string | null = null;
        const lines = s.split("\n");
        for (let i = 0; i !== lines.length; i++) {
            const line = lines[i].trim();
            if (line === "")
                continue;
            const colon = line.indexOf(":");
            const lineError = (msg: string) => "line " + (i + 1) + ": " + msg;
            if (colon < 0) {
                error ??= lineError("expected \"address: values\"");
                continue;
            }
            try {
                let addr = this.parseNumber(line.substring(0, colon).trim(), hex);
                const rest = line.substring(colon + 1).trim();
                if (rest === "")
                    continue;
                for (const v of rest.split(/\s+/))
                    map.set(addr++, this.parseNumber(v, hex));
            } catch (e) {
                error ??= lineError((e as Error).message);
            }
        }
        if (error === null || lenient) {
            this.detachContents();
            this.map = map;
        }
        return error;
    }

    // parse an address or value: hex in hex mode, otherwise decimal; 0x (hex) and 0b
    // (binary, except in hex mode, where it's a hex number) prefixes work in either mode
    parseNumber(str: string, hex: boolean = this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY)): number {
        if (/^0x[0-9a-f]+$/i.test(str))
            return parseInt(str.substring(2), 16);
        if (hex) {
            if (/^[0-9a-f]+$/i.test(str))
                return parseInt(str, 16);
            throw new Error("\"" + str + "\" is not a hex number");
        }
        if (/^0b[01]+$/.test(str))
            return parseInt(str.substring(2), 2);
        if (/^-?[0-9]+$/.test(str))
            return parseInt(str, 10);
        if (/^[0-9a-f]+$/i.test(str))
            throw new Error("\"" + str + "\" is not a decimal number (check Hex Display to enter hex, or write 0x" + str + ")");
        throw new Error("\"" + str + "\" is not a number");
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
            const err = this.parseContentsString(ei.textArea.element ? ei.textArea.element.value : ei.textArea.value);
            if (err !== null) {
                ei.setError(err);
                return;
            }
            if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0)
                this.initialMap = new Map(this.map);
        }
        if (n === 3) {
            const oldFlags = this.flags;
            const newFlags = ei.changeFlag(this.flags, SRAMElm.FLAG_HEX_DISPLAY);
            // read the contents as written before converting them to the new mode.  If they
            // aren't valid in the old mode but are in the new one (say, hex was typed and then
            // Hex Display checked), take them as being in the new mode.  If neither, leave the
            // text alone, so it can be fixed (the dialog shows the error).
            const ta = this.getContentsTextArea();
            let keepText: string | null = null;
            if (ta != null) {
                const text = ta.value;
                if (this.parseContentsString(text, (oldFlags & SRAMElm.FLAG_HEX_DISPLAY) !== 0) !== null &&
                    this.parseContentsString(text, (newFlags & SRAMElm.FLAG_HEX_DISPLAY) !== 0) !== null)
                    keepText = text;
            }
            this.flags = newFlags;
            if (this.flags !== oldFlags) {
                SRAMElm.contentsOverride = keepText ?? this.contentsToString();
                ei.newDialog = true;
            }
        }
        const reloadIdx = SRAMElm.loadFileSupported() ? 5 : 4;
        if (n === reloadIdx) {
            this.flags = ei.changeFlag(this.flags, SRAMElm.FLAG_RELOAD_ON_RESET);
            if ((this.flags & SRAMElm.FLAG_RELOAD_ON_RESET) !== 0) {
                this.syncContents();
                this.initialMap = new Map(this.map);
            } else
                this.initialMap = null;
        }
        const opts = this.pinOptions();
        const opt = opts[n - reloadIdx - 1];
        if (n > reloadIdx && opt !== undefined) {
            this.flags = ei.changeFlag(this.flags, opt);
            this.setupPins();
            this.setPoints();
        }
        if (n === reloadIdx + opts.length + 1)
            this.optimizationDisabled = ei.checkbox!.getState();
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

    protected chipSelected(): boolean {
        return !this.hasChipSelect() || this.nodes[this.chipSelectNode].v < this.getThreshold();
    }

    doStep(): void {
        const selected = this.chipSelected();
        const writeEnabled = selected && this.nodes[0].v < this.getThreshold();
        // with separate I/O, the outputs follow the data being written (write-through, like the
        // 82S16).  With a bidirectional bus they're off while writing, so they don't fight the
        // writer.
        const separate = this.hasSeparateIO();
        const outputEnabled = selected && (this.nodes[1].v < this.getThreshold()) && (separate || !writeEnabled);

        // get address
        this.address = 0;
        for (let i = 0; i !== this.addressBits; i++) {
            this.address |= (this.nodes[this.addressNodes + i].v > this.getThreshold()) ? 1 << (this.addressBits - 1 - i) : 0;
        }

        let data: number;
        if (writeEnabled && separate) {
            data = 0;
            for (let i = 0; i !== this.dataBits; i++)
                data |= (this.nodes[this.dataInNodes + i].v > this.getThreshold()) ? 1 << (this.dataBits - 1 - i) : 0;
        } else {
            const dataObj = this.map.get(this.address);
            data = (dataObj === undefined) ? 0 : dataObj;
        }
        if (this.hasInvertedOutput())
            data ^= (1 << this.dataBits) - 1;
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
        const writeEnabled = this.chipSelected() && this.nodes[0].v < this.getThreshold();
        if (!writeEnabled)
            return;

        // store data in RAM - reads from dataInNodes, which is dataNodes itself unless
        // FLAG_SEPARATE_IO points it at a distinct set of pins (see setupPins()).
        for (let i = 0; i !== this.dataBits; i++) {
            data |= (this.nodes[this.dataInNodes + i].v > this.getThreshold()) ? 1 << (this.dataBits - 1 - i) : 0;
        }
        this.map.set(this.address, data);
    }
    getDumpType(): number { return 413; }

    /** One CUSTOM_CHIP per data bit, matching how dice-ts's own real bipolar-RAM catalog entries
     * (chips/82S16.cpp, chips/8225.cpp) are built: address/CE/WE decoded straight from
     * chip.inputs, read and write handled together in one update function - see doStep()/
     * stepFinished() above for the exact same active-low WE/OE and MSB-first bit convention this
     * mirrors. Those real chips have SEPARATE physical Din/Dout pins per bit though (no ambiguity
     * about which one an update reads from); with FLAG_SEPARATE_IO set, this element does too, and
     * `dataInPin(i)` below is then just an ordinary wired input (its post is in pinMap as a
     * regular INPUT, resolved through the normal connection-finding path - see
     * DigitalGraphBuilder.ts's layoutFromSynth()). Without the flag, SRAMElm's data pins stay
     * genuinely bidirectional (the same real pin drives while reading, receives while writing),
     * so dataInPin(i) is instead wired via digitalTriStateReadbackPin() below - a write must
     * capture whatever's ACTUALLY on the shared bus (an external writer's driven value). Note this
     * bit's own output is, per the real 82S16's write-through behavior, driven with that very same
     * value while writing (see doStep()'s and update()'s matching /OE-gated, /WE-selected logic),
     * so the readback and the output happen to agree during a write - the readback wiring exists
     * for correctness (it must reflect the external bus, not this element's own output post) not
     * because the two would otherwise differ. Either way the per-bit update() logic itself is
     * identical - only where dataInPin(i) gets its value from differs. */
    digitalSynthesis(): DigitalSynthesis {
        const m = this.addressBits;
        const n = this.dataBits;
        const separate = this.hasSeparateIO();
        const invert = this.hasInvertedOutput() ? 1 : 0;
        const wePin = 1;
        const oePin = 2;
        const addrPin = (k: number) => 3 + k;
        const driverPin = (i: number) => 3 + m + i;
        const dataInPin = (i: number) => 3 + m + n + i;

        const pinMap = new Map<number, number>();
        pinMap.set(0, wePin);
        pinMap.set(1, oePin);
        for (let k = 0; k < m; k++) pinMap.set(this.addressNodes + k, addrPin(k));
        if (separate) for (let i = 0; i < n; i++) pinMap.set(this.dataInNodes + i, dataInPin(i));

        const desc: ChipDesc[] = [];
        // Chip select (active low): while it's high, nothing is written and the outputs are off,
        // which is just WE and OE both forced inactive - so it's folded into those two inputs by
        // zero-delay OR cells rather than changing the bit cells themselves.
        let weIn = wePin, oeIn = oePin;
        if (this.hasChipSelect()) {
            const csPin = 3 + m + 2 * n;
            weIn = csPin + 1;
            oeIn = csPin + 2;
            pinMap.set(this.chipSelectNode, csPin);
            desc.push(chipStart((pin) => { pin[weIn] = pin[wePin] | pin[csPin]; }).inputPins(wePin, csPin).outputPin(weIn));
            desc.push(chipStart((pin) => { pin[oeIn] = pin[oePin] | pin[csPin]; }).inputPins(oePin, csPin).outputPin(oeIn));
        }
        for (let i = 0; i < n; i++) {
            const bitMask = 1 << (n - 1 - i);

            desc.push(sramBitCell(this.mem, m, bitMask, invert)
                .inputPins(weIn, oeIn, ...Array.from({ length: m }, (_, k) => addrPin(k)), dataInPin(i))
                .outputPin(driverPin(i))
                .outputDelayS(DEFAULT_GATE_DELAY_LH_S, DEFAULT_GATE_DELAY_HL_S));
            pinMap.set(this.dataNodes + i, driverPin(i));
        }

        return { desc, pinMap, optimizationDisabled: this.optimizationDisabled };
    }

    isTriStateOutput(postIndex: number): boolean {
        return postIndex >= this.dataNodes && postIndex < this.dataNodes + this.dataBits;
    }

    digitalTriStateReadbackPin(postIndex: number): number | null {
        // With separate I/O, dataInPin() is a plain wired-input post (see digitalSynthesis()'s
        // own pinMap) - no readback wiring needed at all.
        if (this.hasSeparateIO()) return null;
        if (postIndex < this.dataNodes || postIndex >= this.dataNodes + this.dataBits) return null;
        return 3 + this.addressBits + this.dataBits + (postIndex - this.dataNodes);
    }
}
