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
import { Checkbox } from "./Checkbox";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Locale } from "./Locale";
import { appendInfoLine, digitalStateTextForOutput } from "./digital/DigitalGraphBuilder";
import { chipStart, POS_EDGE_PIN as posEdge, NEG_EDGE_PIN as negEdge } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

export class CounterElm extends ChipElm {
    invertreset: boolean = false;
    modulus: number = 0;

    propagationDelay: number = 0;

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        // One line per bit (not a summary): with limited horizontal room in
        // the info box, a combined "opt: Active x3, Asleep x1"-style line
        // doesn't say WHICH bit is the odd one out, which is exactly what
        // matters when tracking down why a specific bit isn't sleeping.
        // Uses each pin's own real label (pins[i].text, e.g. "Q0") rather
        // than a made-up index - the k-th output pin's corresponding
        // Q-number depends on the Bit Order setting (MSB/LSB first), so
        // only the pin's own text is guaranteed to match what's actually
        // drawn on the chip.
        let k = 0;
        for (const pin of this.pins) {
            if (!pin.output) continue;
            appendInfoLine(arr, `${pin.text}: ${digitalStateTextForOutput(this, k)}`);
            k++;
        }
    }
    /** Phase 3 (see noble-stirring-rabin.md): one LUT cell per bit, each cell's own real Q pin
     * doubling as its prevOutputPin (see DFlipFlopElm.digitalSynthesis()'s identical convention),
     * with the OTHER bits' current values wired in as plain inPins - every bit-cell reconstructs
     * the whole register's value (its own bit from prevPin, every other bit from its real wired
     * pin, which reflects that sibling's PRE-edge output since dice-ts's engine always defers an
     * output's own `.output` mutation through the event queue - see chip.ts's updateOutput() -
     * even at zero delay, so no sibling can appear to have already advanced when this cell reads
     * it off the same clock edge), applies +/-1 and the configured modulus exactly per evaluate()
     * above, then re-extracts its own bit. When idle (no edge), the reconstruction trivially
     * reproduces the bit it started from (nothing else touches position w), which is why this
     * needs no separate "hold" branch - matches evaluate()'s "genuine synchronous design"
     * docstring, just with the whole register visible to every bit-cell instead of a chain.
     * Deliberately NOT the doc's originally-sketched ripple/9316-style carry chain (chained
     * bit-to-bit dependency, doc.txt's "extra internal-pin cell" compare-and-clear trick): this
     * needs no internal pins at all (every bit's real Q pin already carries what a sibling needs,
     * both as data and via its own prevOutputPin), which sidesteps chip_desc.ts's 24-internal-pin
     * ceiling entirely - and it's a direct restatement of the already-validated evaluate(), not a
     * fresh derivation. Trade-off: each bit-cell's LUT is `2^(bits+2+hasUpDown)` truth-table
     * entries, so this doesn't scale to very wide (~20+ bit) counters - fine for this editor's
     * realistic range. */
    digitalSynthesis(): DigitalSynthesis {
        const bits = this.bits;
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const clkPin = 1, resetPin = 2;
        const hasUD = this.hasUpDown();
        const updownPin = hasUD ? bits + 3 : 0;
        const qPin = (w: number) => bits + 2 - w; // w=0 is LSB, matches execute()'s pins[lastBit-i] layout
        const neg = this.negativeEdgeTriggered();
        const modulus = this.modulus;
        const invertBit = this.invertreset ? 1 : 0;

        const desc: ChipDesc[] = [];
        for (let w = 0; w < bits; w++) {
            const out = qPin(w);
            const inPins: number[] = [clkPin, resetPin];
            if (hasUD) inPins.push(updownPin);
            for (let j = 0; j < bits; j++) if (j !== w) inPins.push(qPin(j));

            const logic: ChipLogic = (pin, prevPin, eventPin) => {
                let value = 0;
                for (let j = 0; j < bits; j++) {
                    const bit = j === w ? prevPin[out] : pin[qPin(j)];
                    if (bit) value |= 1 << j;
                }
                const edge = neg ? negEdge(pin, eventPin, clkPin) : posEdge(pin, eventPin, clkPin);
                if (edge) {
                    const dir = (hasUD && pin[updownPin]) ? -1 : 1;
                    value += dir;
                    if (modulus !== 0) value = ((value % modulus) + modulus) % modulus;
                }
                let bitW = (value >> w) & 1;
                if (pin[resetPin] ^ invertBit) bitW = 0;
                pin[out] = bitW;
            };

            desc.push(
                chipStart(logic).inputPins(...inPins).eventPins(clkPin).outputPin(out).prevOutputPin(out)
                    .outputDelayS(this.propagationDelay, this.propagationDelay)
            );
        }
        return { desc, pinMap };
    }

    static readonly FLAG_UP_DOWN       = 4;
    static readonly FLAG_NEGATIVE_EDGE = 8;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            this.invertreset = true;
            try {
                this.invertreset = st!.nextToken() === "true";
                this.modulus = parseInt(st!.nextToken());
            } catch (e) {}
            this.pins[1].bubble = this.invertreset;
        }
    }

    dump(): string {
        return super.dump() + " " + this.invertreset + " " + this.modulus;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "in", this.invertreset);
        CircuitXMLSerializer.dumpAttr(elem, "mo", this.modulus);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.invertreset = xml.parseBooleanAttr("in", this.invertreset);
        this.modulus = xml.parseIntAttr("mo", this.modulus);
        this.pins[1].bubble = this.invertreset;
    }

    needsBits(): boolean { return true; }
    allowBus(): boolean { return true; }

    getChipName(): string {
        if (this.modulus === 0)
            return "Counter";
        return Locale.LS("Counter") + Locale.LS(" (mod ") + this.modulus + ")";
    }

    setupPins(): void {
        if (!this.bits) return;
        this.sizeX = 2;
        this.sizeY = this.useBus() ? 3 : this.bits;
        this.pins = new Array(this.getPostCount());
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "");
        this.pins[0].clock = true;
        this.pins[0].bubble = this.negativeEdgeTriggered();
        this.pins[1] = new Pin(this, this.sizeY - 1, ChipElm.SIDE_W, "R");
        this.pins[1].bubble = this.invertreset;
        this.makeBitPins(this.bits, 0, ChipElm.SIDE_E, 2, "Q", true, true, true);
        if (this.hasUpDown())
            this.pins[this.bits + 2] = new Pin(this, this.sizeY - 2, ChipElm.SIDE_W, "U/D");
        this.allocNodes();
    }

    getPostCount(): number {
        return this.hasUpDown() ? this.bits + 3 : this.bits + 2;
    }

    getVoltageSourceCount(): number { return this.bits; }

    hasUpDown(): boolean { return this.hasFlag(CounterElm.FLAG_UP_DOWN); }
    negativeEdgeTriggered(): boolean { return this.hasFlag(CounterElm.FLAG_NEGATIVE_EDGE); }

    execute(): void {
        const neg = this.negativeEdgeTriggered();
        if (this.pins[0].value !== neg && this.lastClock === neg) {
            let value = 0;

            // get direction
            let dir = 1;
            if (this.hasUpDown() && this.pins[this.bits + 2].value)
                dir = -1;

            // get current value
            const lastBit = 2 + this.bits - 1;
            for (let i = 0; i !== this.bits; i++)
                if (this.pins[lastBit - i].value)
                    value |= 1 << i;

            // update value
            value += dir;
            if (this.modulus !== 0)
                value = ((value % this.modulus) + this.modulus) % this.modulus;

            // convert value to binary
            for (let i = 0; i !== this.bits; i++)
                this.pins[lastBit - i].value = (value & (1 << i)) !== 0;
        }
        if (!this.pins[1].value === this.invertreset) {
            for (let i = 0; i !== this.bits; i++)
                this.pins[i + 2].value = false;
        }
        this.lastClock = this.pins[0].value;
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Invert reset pin", this.invertreset);
            return ei;
        }
        if (n === 1)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        if (n === 2)
            return new EditInfo("Modulus", this.modulus, 1, 1).setDimensionless();
        if (n === 3) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Up/Down Pin", this.hasUpDown());
            return ei;
        }
        if (n === 4) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Negative Edge Triggered", this.negativeEdgeTriggered());
            return ei;
        }
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.invertreset = ei.checkbox!.getState();
            this.setupPins();
            this.setPoints();
        }
        if (n === 1) {
            if (ei.value >= 3) {
                this.bits = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be >= 3");
        }
        if (n === 2)
            this.modulus = Math.trunc(ei.value);
        if (n === 3) {
            this.flags = ei.changeFlag(this.flags, CounterElm.FLAG_UP_DOWN);
            this.setupPins();
            this.setPoints();
        }
        if (n === 4) {
            this.flags = ei.changeFlag(this.flags, CounterElm.FLAG_NEGATIVE_EDGE);
            this.setupPins();
            this.setPoints();
        }
    }

    getDumpType(): number { return 164; }
    getXmlDumpType(): string { return "ctr"; }
}
