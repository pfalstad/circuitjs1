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

// contributed by Edward Calver

import { ChipElm, Pin } from "./ChipElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { StringTokenizer } from "./StringTokenizer";
import { appendInfoLine, digitalStateTextForOutput } from "./digital/DigitalGraphBuilder";
import type { DigitalInitialState, DigitalSynthesis } from "./digital/DigitalGraphBuilder";
import { chipStart, i1, POS_EDGE_PIN as posEdge } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";

export class PisoShiftElm extends ChipElm implements DigitalInitialState {
    readonly FLAG_NEW_BEHAVIOR = 2;

    data: boolean[] = [];
    dataIndex: number = 0;
    clockState: boolean = false;
    loadState: boolean = false;
    dataPinIndex: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f, st);
        if (st !== undefined) {
            this.data = new Array<boolean>(this.bits).fill(false);
            ChipElm.readBits(st, this.data);
        } else {
            this.data = new Array<boolean>(this.bits).fill(false);
            this.flags |= this.FLAG_NEW_BEHAVIOR;
        }
        this.setupPins();
    }

    dumpXml(doc: Document, elem: Element): void { super.dumpXml(doc, elem); }

    dumpXmlState(doc: Document, elem: Element): void {
        super.dumpXmlState(doc, elem);
        const newData = new Array<boolean>(this.data.length).fill(false);
        for (let i = 0; i < this.data.length; i++)
            newData[i] = this.data[(i + this.dataIndex) % this.data.length];
        CircuitXMLSerializer.dumpAttr(elem, "dt", ChipElm.writeBitsToString(newData));
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.data = new Array<boolean>(this.bits).fill(false);
        this.dataIndex = 0;
        const dt = xml.parseStringAttr("dt", null);
        if (dt !== null)
            ChipElm.readBitsFromString(dt, this.data);
    }

    getDumpType(): number { return 186; }
    getChipName(): string { return "PISO shift register"; }
    needsBits(): boolean { return true; }
    defaultBitCount(): number { return 8; }
    hasNewBhvr(): boolean { return (this.flags & this.FLAG_NEW_BEHAVIOR) !== 0; }

    reset(): void {
        super.reset();
        this.data = new Array<boolean>(this.bits).fill(false);
    }

    setupPins(): void {
        this.sizeX = this.bits + 2;
        this.sizeY = 3;
        this.pins = new Array(this.getPostCount());

        this.pins[0] = new Pin(this, 1, ChipElm.SIDE_W, "LD");
        this.pins[1] = new Pin(this, 2, ChipElm.SIDE_W, "");
        this.pins[1].clock = true;

        this.pins[2] = new Pin(this, 1, ChipElm.SIDE_E, "Q" + (this.hasNewBhvr() ? this.bits - 1 : this.bits));
        this.pins[2].output = true;

        if (this.hasNewBhvr()) {
            this.pins[3] = new Pin(this, 0, ChipElm.SIDE_W, "SER");
            if (this.data && this.data.length > 0)
                this.pins[2].value = this.data[0];
            this.dataPinIndex = 4;
        } else {
            this.dataPinIndex = 3;
        }

        for (let i = 0; i < this.bits; i++)
            this.pins[this.dataPinIndex + i] = new Pin(this, this.bits - i, ChipElm.SIDE_N, "D" + (this.bits - (i + 1)));

        this.allocNodes();
    }

    getPostCount(): number { return (this.hasNewBhvr() ? 4 : 3) + this.bits; }
    getVoltageSourceCount(): number { return 1; }

    // Pin numbers (chip_desc space, post index + 1 - see digitalSynthesis() below): LD and CLK
    // are always posts 0/1, Q is always post 2, so these three never move regardless of bits/
    // hasNewBhvr(). dataPin()/stagePin() below depend on those, so stay methods.
    private static readonly LD_PIN = 1;
    private static readonly CLK_PIN = 2;
    private static readonly Q_PIN = 3;

    /** Pin number of parallel input D(bits-1-i) - the i-th data post in pins[] array order (post
     * dataPinIndex+i), matching data[i]'s own meaning in execute()/dumpXmlState() above: data[0]
     * is the MSB (D(bits-1)), data[bits-1] the LSB (D0). */
    private dataPin(i: number): number { return this.dataPinIndex + i + 1; }

    /** Pin number of shift-chain stage k (k=0 nearest the serial input, k=bits-1 nearest Q) - see
     * digitalSynthesis()'s own docstring for why this indexing reproduces execute()'s circular
     * buffer exactly. The last stage (k===bits-1) IS the real Q post/pin (Q_PIN); every earlier
     * stage gets its own internal-only pin, allocated sequentially from i1 (chip_desc.ts's
     * MultiplexerElm.buildMuxTree() uses the same "i1, i1+1, ..." sequential-allocation idiom) -
     * fine up to chip_desc's 48-pin-per-instance budget (realistic bit counts only, same
     * trade-off buildMuxTree() itself documents). */
    private stagePin(k: number): number { return k === this.bits - 1 ? PisoShiftElm.Q_PIN : i1 + k; }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        if (ChipElm.app.developerMode)
            appendInfoLine(arr, `Q: ${digitalStateTextForOutput(this, 0)}`);
    }

    /** Seeds every shift-chain stage (see digitalSynthesis() below) from the restored `data`
     * array. dumpXmlState()/undumpXml() above always normalize a save to dataIndex===0 (data[i]
     * rotated so it reads the same as if the register had just been loaded and then clocked i
     * times), and digitalSynthesis()'s own stage[k]===data[bits-1-k] invariant (see its docstring)
     * holds at dataIndex===0 same as any other time - so this can seed straight from data[] with
     * no rotation math of its own. */
    digitalInitialState(): { pin: number, value: number }[] | null {
        if (this.data.length !== this.bits) return null;
        const entries: { pin: number, value: number }[] = [];
        for (let k = 0; k < this.bits; k++)
            entries.push({ pin: this.stagePin(k), value: this.data[this.bits - 1 - k] ? 1 : 0 });
        return entries;
    }

    /** Models execute()'s circular data[]/dataIndex buffer as a genuine `bits`-stage shift chain
     * instead - stage k===0 is fed by the serial input (SER, or a fixed 0 when !hasNewBhvr(), same
     * as execute()'s `hasNewBhvr() && pins[3].value` term), each later stage k shifts in its
     * predecessor's own value, and the LAST stage (bits-1) drives the real Q pin directly. LD
     * (edge-triggered here, unlike a real 74165's async LEVEL-sensitive SH//LD - matches this
     * element's own execute(), which only reacts to LD's rising edge) loads every stage from its
     * own parallel data pin, taking priority over a same-tick CLK edge exactly like execute()'s
     * sequential LD-then-CLK if-blocks.
     *
     * Why this reproduces execute()'s circular-buffer output bit-for-bit: right after a load,
     * execute() sets Q (data[0]) to the MSB and, after w clocks, Q=data[w] - i.e. the visible
     * output walks data[] in ascending index order while dataIndex tracks "how many clocks since
     * load". A genuine physical chain shows the SAME sequence with the stages numbered in
     * REVERSE (stage bits-1, nearest Q, loaded from data[0]/the MSB; stage 0, nearest the serial
     * input, loaded from data[bits-1]/the LSB) - each clock hop moves data[0..w] one stage closer
     * to Q, so Q reads data[w] after w clocks either way. This still holds once the register is
     * running past the initial load, not just for the first `bits` clocks: at any dataIndex,
     * execute()'s own state satisfies stage[k] === data[(dataIndex + bits-1-k) % bits] - verified
     * by induction on both models stepping together - which collapses to stage[k]===data[bits-1-k]
     * at dataIndex===0 (right after any load), the same relation digitalInitialState() above
     * relies on. */
    digitalSynthesis(): DigitalSynthesis {
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const bits = this.bits;
        const ldPin = PisoShiftElm.LD_PIN, clkPin = PisoShiftElm.CLK_PIN;
        const serPin = this.hasNewBhvr() ? 4 : 0;

        const desc: ChipDesc[] = [];
        let prevOut = 0;
        for (let k = 0; k < bits; k++) {
            const out = this.stagePin(k);
            const loadSrc = this.dataPin(bits - 1 - k);
            const serialSrc = k === 0 ? serPin : prevOut;

            const logic: ChipLogic = (pin, prevPin, eventPin) => {
                let bit: number;
                if (posEdge(pin, eventPin, ldPin)) bit = pin[loadSrc];
                else if (posEdge(pin, eventPin, clkPin)) bit = serialSrc ? pin[serialSrc] : 0;
                else bit = prevPin[out];
                pin[out] = bit;
            };

            const inPins = [ldPin, clkPin, loadSrc];
            if (serialSrc) inPins.push(serialSrc);
            desc.push(
                chipStart(logic).inputPins(...inPins).eventPins(ldPin, clkPin)
                    .outputPin(out).prevOutputPin(out).outputDelayNs(15.0, 15.0)
            );
            prevOut = out;
        }
        return { desc, pinMap };
    }

    execute(): void {
        // LOAD raised
        if (this.pins[0].value !== this.loadState) {
            this.loadState = this.pins[0].value;
            if (this.loadState && this.data.length > 0) {
                if (this.hasNewBhvr()) {
                    this.pins[2].value = this.pins[this.dataPinIndex].value;
                    this.dataIndex = 0;
                } else {
                    this.dataIndex = -1;
                }
                for (let i = 0; i < this.data.length; i++)
                    this.data[i] = this.pins[this.dataPinIndex + i].value;
            }
        }
        // CLK raised
        if (this.pins[1].value !== this.clockState) {
            this.clockState = this.pins[1].value;
            if (this.clockState) {
                if (this.dataIndex >= 0)
                    this.data[this.dataIndex] = this.hasNewBhvr() && this.pins[3].value;
                this.dataIndex++;
                if (this.dataIndex >= this.data.length)
                    this.dataIndex = 0;
                this.pins[2].value = this.data[this.dataIndex];
            }
        }
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value !== this.bits && ei.value >= 1) {
            this.bits = Math.trunc(ei.value);
            this.data = new Array<boolean>(this.bits).fill(false);
            this.setupPins();
            this.setPoints();
        }
    }
}
