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
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { chipStart } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import { appendInfoLine, digitalStateTextForOutput } from "./digital/DigitalGraphBuilder";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

export class FullAdderElm extends ChipElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.flags |= FullAdderElm.FLAG_BITS;
            this.bits = 4;
            this.setupPins();
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
            if (!this.needsBits())
                this.bits = 1;
            this.setupPins();
        }
    }
    static readonly FLAG_BITS = 2;

    getChipName(): string { return "Adder"; }
    carryIn: number = 0;
    carryOut: number = 0;

    setupPins(): void {
        this.sizeX = 2;
        const bitsY = this.useBus() ? 1 : this.bits;
        this.sizeY = bitsY * 2 + 1;
        this.pins = new Array(this.getPostCount());

        this.makeBitPins(this.bits, 0,      ChipElm.SIDE_W, 0,           "A", false, false, false);
        this.makeBitPins(this.bits, bitsY,  ChipElm.SIDE_W, this.bits,   "B", false, false, false);
        this.makeBitPins(this.bits, 2,      ChipElm.SIDE_E, this.bits*2, "S", true,  false, false);
        this.carryIn  = this.bits * 3;
        this.carryOut = this.bits * 3 + 1;
        this.pins[this.carryOut] = new Pin(this, 0, ChipElm.SIDE_E, "C");
        this.pins[this.carryOut].output = true;
        this.pins[this.carryIn] = new Pin(this, bitsY * 2, ChipElm.SIDE_W, "Cin");
        this.allocNodes();
    }
    getPostCount(): number {
        return this.bits * 3 + 2;
    }
    getVoltageSourceCount(): number { return this.bits + 1; }

    execute(): void {
        let c = this.pins[this.carryIn].value ? 1 : 0;
        for (let i = 0; i !== this.bits; i++) {
            const v = (this.pins[i].value ? 1 : 0) + (this.pins[i + this.bits].value ? 1 : 0) + c;
            c = (v > 1) ? 1 : 0;
            this.writeOutput(i + this.bits * 2, ((v & 1) === 1));
        }
        this.writeOutput(this.carryOut, (c === 1));
    }

    /** Purely combinational, generalized to `bits` from dice-ts/src/chips/7483.ts's fixed 4-bit
     * shape: rather than a real per-bit carry chain of internal pins, each sum cell reconstructs
     * the running total of just the bits at or below its own weight (its own A/B pair plus every
     * lower one, plus Cin) and extracts its own bit - exactly 7483's s0..s3 cells, just built by
     * a loop instead of hand-unrolled per bit. carryOut is the same reconstruction carried one bit
     * further, over the whole word. No clock, no prevOutputPin/eventPins - matches
     * GateElm.digitalSynthesis()'s plain-combinational convention. */
    digitalSynthesis(): DigitalSynthesis {
        const bits = this.bits;
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const aPin = (w: number) => w + 1;
        const bPin = (w: number) => w + bits + 1;
        const sPin = (w: number) => w + bits * 2 + 1;
        const cinPin = bits * 3 + 1;
        const coutPin = bits * 3 + 2;

        const desc: ChipDesc[] = [];
        for (let w = 0; w < bits; w++) {
            const out = sPin(w);
            const inPins = [cinPin];
            for (let j = 0; j <= w; j++) inPins.push(aPin(j), bPin(j));

            const logic: ChipLogic = (pin) => {
                let value = pin[cinPin];
                for (let j = 0; j <= w; j++) value += (pin[aPin(j)] + pin[bPin(j)]) << j;
                pin[out] = (value >> w) & 1;
            };

            // matches dice-ts's 7483 sum-output delay (~/Projects/dice-ts/src/chips/7483.ts)
            desc.push(chipStart(logic).inputPins(...inPins).outputPin(out).outputDelayNs(16.0, 16.0));
        }

        const coutInPins = [cinPin];
        for (let j = 0; j < bits; j++) coutInPins.push(aPin(j), bPin(j));
        const coutLogic: ChipLogic = (pin) => {
            let value = pin[cinPin];
            for (let j = 0; j < bits; j++) value += (pin[aPin(j)] + pin[bPin(j)]) << j;
            pin[coutPin] = (value >> bits) & 1;
        };
        // matches dice-ts's 7483 carry-out delay
        desc.push(chipStart(coutLogic).inputPins(...coutInPins).outputPin(coutPin).outputDelayNs(9.0, 11.0));

        return { desc, pinMap };
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        // One line per bit (not a summary): see CounterElm.getInfo()'s docstring for why -
        // uses each pin's own real label (pins[i].text, e.g. "S0") rather than a made-up
        // index, since S/C ordering depends on setupPins()'s layout, not a fixed index.
        let k = 0;
        for (const pin of this.pins) {
            if (!pin.output) continue;
            appendInfoLine(arr, `${pin.text}: ${digitalStateTextForOutput(this, k)}`);
            k++;
        }
    }

    getDumpType(): number { return 196; }
    needsBits(): boolean { return (this.flags & FullAdderElm.FLAG_BITS) !== 0; }
    allowBus(): boolean { return this.needsBits(); }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless().setPositive();
        return super.getChipEditInfo(n);
    }
    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.bits = Math.floor(ei.value);
            this.flags |= FullAdderElm.FLAG_BITS;
            this.setupPins();
            this.setPoints();
            this.allocNodes();
            return;
        }
        super.setChipEditValue(n, ei);
    }
}
