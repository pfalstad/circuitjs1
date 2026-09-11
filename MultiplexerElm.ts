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
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { appendInfoLine, digitalStateTextForOutput } from "./digital/DigitalGraphBuilder";
import { chipStart, i1 } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

/** Builds a binary tree of 2:1 mux cells picking `leaves[sel]`, `sel` read LSB-first off
 * `selectPins` (weight i at selectPins[i], matching MultiplexerElm.readSelectValue()'s own
 * convention) - not a single wide LUT cell enumerating every (data, select) combination at once,
 * which would need a `2^(leaves.length + selectPins.length)`-entry truth table (infeasible for
 * anything past a handful of channels; chip_desc.ts's LUT enumeration is genuinely brute-force).
 * Each tree node is instead a tiny 3-input cell (`select bit, a, b`), chained via freshly
 * `allocPin()`-ed pins - `leaves.length - 1` of them per call, shared out of chip_desc.ts's
 * MAX_PINS=48 budget for this element's whole synthesized instance, so this doesn't scale to
 * this editor's largest configurable widths (6 select bits x wide data buses) - fine for
 * realistic mux sizes. */
function buildMuxTree(leaves: number[], selectPins: number[], allocPin: () => number, desc: ChipDesc[]): number {
    let level = leaves.slice();
    for (const sel of selectPins) {
        const next: number[] = [];
        for (let k = 0; k < level.length; k += 2) {
            const a = level[k], b = level[k + 1];
            const out = allocPin();
            const logic: ChipLogic = (pin) => { pin[out] = pin[sel] ? pin[b] : pin[a]; };
            desc.push(chipStart(logic).inputPins(sel, a, b).outputPin(out));
            next.push(out);
        }
        level = next;
    }
    return level[0];
}

export class MultiplexerElm extends ChipElm {
    static readonly FLAG_INVERTED_OUTPUT = 1 << 1;
    static readonly FLAG_STROBE         = 1 << 2;
    static readonly FLAG_BUS_SELECT     = 1 << 3;

    // inputMode: 0 = individual inputs/single output (original)
    //            1 = bus input/single output (bit selector)
    //            2 = bus input/bus output
    static readonly INPUT_MODE_INDIVIDUAL = 0;
    static readonly INPUT_MODE_BUS_BIT    = 1;
    static readonly INPUT_MODE_BUS_BUS    = 2;

    selectBitCount: number;
    outputCount: number = 0;
    inputMode: number = 0;
    dataBusWidth: number = 4;
    strobe: number = -1;
    outputPin: number = 0;
    selectPin: number = 0;

    hasReset(): boolean { return false; }
    busSelect(): boolean { return this.hasFlag(MultiplexerElm.FLAG_BUS_SELECT); }

    private outputWidth(): number {
        return this.inputMode === MultiplexerElm.INPUT_MODE_BUS_BUS ? this.dataBusWidth : 1;
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        let k = 0;
        for (const pin of this.pins) {
            if (!pin.output) continue;
            if (ChipElm.app.developerMode)
                appendInfoLine(arr, `${pin.text}${pin.lineOver ? "'" : ""}: ${digitalStateTextForOutput(this, k)}`);
            k++;
        }
    }

    /** Phase 3 (see noble-stirring-rabin.md): one buildMuxTree() per output bit (dataBusWidth of
     * them in INPUT_MODE_BUS_BUS, else just one), matching evaluate() above's own per-mode data
     * layout exactly (channel g's bit i at post `g*dataBusWidth+i` for BUS_BUS, plain channel
     * post `ch` otherwise). Strobe forces the output low without a separate mux stage; inverted
     * output is a trailing NOT cell, mirroring evaluate()'s own trailing `out.map(v => !v)`. */
    digitalSynthesis(): DigitalSynthesis {
        const M = MultiplexerElm;
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const selectPins = Array.from({ length: this.selectBitCount }, (_, i) => this.selectPin + i + 1);
        const strobePin = this.strobe >= 0 ? this.strobe + 1 : 0;
        const width = this.outputWidth();
        const desc: ChipDesc[] = [];
        let nextInternal = i1;
        const allocPin = () => nextInternal++;

        for (let bit = 0; bit < width; bit++) {
            const leaves = Array.from({ length: this.outputCount }, (_, ch) => {
                const dataPost = this.inputMode === M.INPUT_MODE_BUS_BUS ? ch * this.dataBusWidth + bit : ch;
                return dataPost + 1;
            });
            const muxOut = buildMuxTree(leaves, selectPins, allocPin, desc);

            // final output-stage delay matches dice-ts's 74153 dual mux delay (~/Projects/dice-ts/src/chips/74153.ts)
            const outPin = this.outputPin + bit + 1;
            if (strobePin) {
                const strobed: ChipLogic = (pin) => { pin[outPin] = pin[strobePin] ? 0 : pin[muxOut]; };
                desc.push(chipStart(strobed).inputPins(strobePin, muxOut).outputPin(outPin).outputDelayNs(16.0, 18.0));
            } else {
                const buf: ChipLogic = (pin) => { pin[outPin] = pin[muxOut]; };
                desc.push(chipStart(buf).inputPins(muxOut).outputPin(outPin).outputDelayNs(16.0, 18.0));
            }

            if (this.hasFlag(M.FLAG_INVERTED_OUTPUT)) {
                const invPin = this.outputPin + width + bit + 1;
                const inv: ChipLogic = (pin) => { pin[invPin] = pin[outPin] ^ 1; };
                desc.push(chipStart(inv).inputPins(outPin).outputPin(invPin).outputDelayNs(16.0, 18.0));
            }
        }

        return { desc, pinMap };
    }

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.selectBitCount = 2;
            this.setupPins();
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            this.selectBitCount = 2;
            try {
                this.selectBitCount = parseInt(st!.nextToken());
            } catch (e) {}
            this.setupPins();
        }
    }

    getChipName(): string { return "Multiplexer"; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "se", this.selectBitCount);
        if (this.inputMode !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "im", this.inputMode);
        if (this.dataBusWidth !== 4)
            CircuitXMLSerializer.dumpAttr(elem, "dw", this.dataBusWidth);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.selectBitCount = xml.parseIntAttr("se", this.selectBitCount);
        this.inputMode = xml.parseIntAttr("im", 0);
        this.dataBusWidth = xml.parseIntAttr("dw", 4);
        this.setupPins();
    }

    setupPins(): void {
        if (!this.selectBitCount)
	    this.selectBitCount = 2;
        const M = MultiplexerElm;
        this.outputCount = 1 << this.selectBitCount;
        let i: number, n: number;

        if (this.inputMode === M.INPUT_MODE_BUS_BUS) {
            const inputPinCount   = this.outputCount * this.dataBusWidth;
            const outputPinCount  = this.dataBusWidth;
            const invertedCount   = this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? this.dataBusWidth : 0;
            const strobeCount     = this.hasFlag(M.FLAG_STROBE) ? 1 : 0;

            this.sizeX = this.selectBitCount + 1;
            this.sizeY = this.outputCount + 1;
            this.pins = new Array(inputPinCount + this.selectBitCount + outputPinCount + invertedCount + strobeCount);

            // input bus groups on west side
            for (let g = 0; g < this.outputCount; g++) {
                for (i = 0; i < this.dataBusWidth; i++) {
                    n = g * this.dataBusWidth + i;
                    this.pins[n] = new Pin(this, g, ChipElm.SIDE_W, "I" + g);
                    this.pins[n].busWidth = this.dataBusWidth;
                    this.pins[n].busZ = i;
                }
            }

            // select pins on south side
            this.selectPin = inputPinCount;
            for (i = 0; i < this.selectBitCount; i++) {
                n = this.selectPin + i;
                if (this.busSelect()) {
                    this.pins[n] = new Pin(this, 0, ChipElm.SIDE_S, "S");
                    this.pins[n].busWidth = this.selectBitCount;
                    this.pins[n].busZ = i;
                } else {
                    this.pins[n] = new Pin(this, i + 1, ChipElm.SIDE_S, "S" + i);
                }
            }

            // output bus on east side
            this.outputPin = this.selectPin + this.selectBitCount;
            for (i = 0; i < this.dataBusWidth; i++) {
                n = this.outputPin + i;
                this.pins[n] = new Pin(this, 0, ChipElm.SIDE_E, "Q");
                this.pins[n].output = true;
                this.pins[n].busWidth = this.dataBusWidth;
                this.pins[n].busZ = i;
            }

            // inverted output bus
            if (this.hasFlag(M.FLAG_INVERTED_OUTPUT)) {
                for (i = 0; i < this.dataBusWidth; i++) {
                    n = this.outputPin + this.dataBusWidth + i;
                    this.pins[n] = new Pin(this, 1, ChipElm.SIDE_E, "Q");
                    this.pins[n].lineOver = true;
                    this.pins[n].output = true;
                    this.pins[n].bubble = (i === 0);
                    this.pins[n].busWidth = this.dataBusWidth;
                    this.pins[n].busZ = i;
                }
            }

            // strobe
            if (this.hasFlag(M.FLAG_STROBE)) {
                n = this.outputPin + this.dataBusWidth + invertedCount;
                this.pins[n] = new Pin(this, 0, ChipElm.SIDE_S, "STR");
                this.strobe = n;
            } else
                this.strobe = -1;

        } else if (this.inputMode === M.INPUT_MODE_BUS_BIT) {
            this.sizeX = this.selectBitCount + 1;
            this.sizeY = 3;
            const strobeCount   = this.hasFlag(M.FLAG_STROBE) ? 1 : 0;
            const invertedCount = this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? 1 : 0;
            this.pins = new Array(this.outputCount + this.selectBitCount + 1 + invertedCount + strobeCount);

            // bus input pins: all at same position
            for (i = 0; i < this.outputCount; i++) {
                this.pins[i] = new Pin(this, 0, ChipElm.SIDE_W, "I");
                this.pins[i].busWidth = this.outputCount;
                this.pins[i].busZ = i;
            }

            // select pins
            this.selectPin = this.outputCount;
            for (i = 0; i < this.selectBitCount; i++) {
                n = this.selectPin + i;
                if (this.busSelect()) {
                    this.pins[n] = new Pin(this, 0, ChipElm.SIDE_S, "S");
                    this.pins[n].busWidth = this.selectBitCount;
                    this.pins[n].busZ = i;
                } else {
                    this.pins[n] = new Pin(this, i + 1, ChipElm.SIDE_S, "S" + i);
                }
            }

            // output
            n = this.selectPin + this.selectBitCount;
            this.pins[n] = new Pin(this, 0, ChipElm.SIDE_E, "Q");
            this.pins[n].output = true;
            this.outputPin = n;

            if (this.hasFlag(M.FLAG_INVERTED_OUTPUT)) {
                n++;
                this.pins[n] = new Pin(this, 1, ChipElm.SIDE_E, "Q");
                this.pins[n].lineOver = true;
                this.pins[n].output = true;
                this.pins[n].bubble = true;
            }
            if (this.hasFlag(M.FLAG_STROBE)) {
                n++;
                this.pins[n] = new Pin(this, 0, ChipElm.SIDE_S, "STR");
                this.strobe = n;
            } else
                this.strobe = -1;

        } else {
            // mode 0: individual inputs / single output
            this.sizeX = this.selectBitCount + 1;
            this.sizeY = this.outputCount + 1;
            const strobeCount   = this.hasFlag(M.FLAG_STROBE) ? 1 : 0;
            const invertedCount = this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? 1 : 0;
            this.pins = new Array(this.outputCount + this.selectBitCount + 1 + invertedCount + strobeCount);

            for (i = 0; i < this.outputCount; i++)
                this.pins[i] = new Pin(this, i, ChipElm.SIDE_W, "I" + i);

            this.selectPin = this.outputCount;
            for (i = 0; i < this.selectBitCount; i++) {
                n = this.selectPin + i;
                if (this.busSelect()) {
                    this.pins[n] = new Pin(this, 0, ChipElm.SIDE_S, "S");
                    this.pins[n].busWidth = this.selectBitCount;
                    this.pins[n].busZ = i;
                } else {
                    this.pins[n] = new Pin(this, i + 1, ChipElm.SIDE_S, "S" + i);
                }
            }

            n = this.selectPin + this.selectBitCount;
            this.pins[n] = new Pin(this, 0, ChipElm.SIDE_E, "Q");
            this.pins[n].output = true;
            this.outputPin = n;
            if (this.hasFlag(M.FLAG_INVERTED_OUTPUT)) {
                n++;
                this.pins[n] = new Pin(this, 1, ChipElm.SIDE_E, "Q");
                this.pins[n].lineOver = true;
                this.pins[n].output = true;
                this.pins[n].bubble = true;
            }
            if (this.hasFlag(M.FLAG_STROBE)) {
                n++;
                this.pins[n] = new Pin(this, 0, ChipElm.SIDE_S, "STR");
                this.strobe = n;
            } else
                this.strobe = -1;
        }

        this.allocNodes();
    }

    getPostCount(): number {
        const M = MultiplexerElm;
        if (this.inputMode === M.INPUT_MODE_BUS_BUS) {
            const invertedCount = this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? this.dataBusWidth : 0;
            const strobeCount   = this.hasFlag(M.FLAG_STROBE) ? 1 : 0;
            return this.outputCount * this.dataBusWidth + this.selectBitCount + this.dataBusWidth + invertedCount + strobeCount;
        }
        const invertedCount = this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? 1 : 0;
        const strobeCount   = this.hasFlag(M.FLAG_STROBE) ? 1 : 0;
        return this.outputCount + this.selectBitCount + 1 + invertedCount + strobeCount;
    }

    getVoltageSourceCount(): number {
        const M = MultiplexerElm;
        if (this.inputMode === M.INPUT_MODE_BUS_BUS) {
            let count = this.dataBusWidth;
            if (this.hasFlag(M.FLAG_INVERTED_OUTPUT))
                count += this.dataBusWidth;
            return count;
        }
        return this.hasFlag(M.FLAG_INVERTED_OUTPUT) ? 2 : 1;
    }

    readSelectValue(): number {
        let sel = 0;
        for (let i = 0; i < this.selectBitCount; i++)
            if (this.pins[this.selectPin + i].value)
                sel |= 1 << i;
        return sel;
    }

    execute(): void {
        const M = MultiplexerElm;
        const selectedValue = this.readSelectValue();

        if (this.inputMode === M.INPUT_MODE_BUS_BUS) {
            const strobed = (this.strobe !== -1 && this.pins[this.strobe].value);
            for (let i = 0; i < this.dataBusWidth; i++) {
                const val = strobed ? false : this.pins[selectedValue * this.dataBusWidth + i].value;
                this.pins[this.outputPin + i].value = val;
            }
            if (this.hasFlag(M.FLAG_INVERTED_OUTPUT)) {
                for (let i = 0; i < this.dataBusWidth; i++)
                    this.pins[this.outputPin + this.dataBusWidth + i].value = !this.pins[this.outputPin + i].value;
            }
        } else {
            let val = this.pins[selectedValue].value;
            if (this.strobe !== -1 && this.pins[this.strobe].value)
                val = false;
            this.pins[this.outputPin].value = val;
            if (this.hasFlag(M.FLAG_INVERTED_OUTPUT))
                this.pins[this.outputPin + 1].value = !val;
        }
    }

    getDumpType(): number { return 184; }
    getXmlDumpType(): string { return "mux"; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Select Bits", this.selectBitCount, 1, 8).setDimensionless();
        if (n === 1)
            return EditInfo.createCheckbox("Inverted Output", this.hasFlag(MultiplexerElm.FLAG_INVERTED_OUTPUT));
        if (n === 2)
            return EditInfo.createCheckbox("Strobe Pin", this.hasFlag(MultiplexerElm.FLAG_STROBE));
        if (n === 3) {
            const ei = new EditInfo("Input Mode", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Individual Inputs");
            ei.choice.add("Bus Input (Bit Select)");
            ei.choice.add("Bus Input/Output");
            ei.choice.select(this.inputMode);
            return ei;
        }
        if (n === 4)
            return EditInfo.createCheckbox("Bus Select", this.busSelect());
        if (n === 5 && this.inputMode === MultiplexerElm.INPUT_MODE_BUS_BUS)
            return new EditInfo("Data Bus Width", this.dataBusWidth, 2, 32).setDimensionless();
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        const M = MultiplexerElm;
        if (n === 0) {
            if (ei.value >= 1 && ei.value <= 6) {
                this.selectBitCount = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be between 1 and 6");
            return;
        }
        if (n === 1) {
            this.flags = ei.changeFlag(this.flags, M.FLAG_INVERTED_OUTPUT);
            this.setupPins();
            this.setPoints();
            return;
        }
        if (n === 2) {
            this.flags = ei.changeFlag(this.flags, M.FLAG_STROBE);
            this.setupPins();
            this.setPoints();
            return;
        }
        if (n === 3) {
            this.inputMode = ei.choice!.getSelectedIndex();
            this.setupPins();
            this.setPoints();
            return;
        }
        if (n === 4) {
            this.flags = ei.changeFlag(this.flags, M.FLAG_BUS_SELECT);
            this.setupPins();
            this.setPoints();
            return;
        }
        if (n === 5) {
            if (ei.value >= 2) {
                this.dataBusWidth = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be >= 2");
            return;
        }
    }
}
