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

    // matches dice-ts's 7493 per-stage toggle delay (~/Projects/dice-ts/src/chips/7493.ts)
    propagationDelay: number = 17.0e-9;

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
    /** Phase 3 (see noble-stirring-rabin.md), revised: plain binary counting (modulus===0, no
     * Up/Down pin) now synthesizes as a genuine ripple chain - see digitalSynthesisRipple()
     * below, which is the whole point (see its own docstring for why). Modulus and Up/Down keep
     * the original whole-register-reconstruction synthesis (digitalSynthesisWholeRegister()
     * below): an arbitrary non-power-of-2 modulus needs every bit-cell to see the whole register
     * to apply a synchronous compare-and-clear, and Up/Down's dynamic direction pin would need an
     * extra XOR-carry-select cell per ripple stage - both real, separable follow-ups, not bundled
     * into this change (see the digitalSynthesisRipple() docstring's own note). */
    digitalSynthesis(): DigitalSynthesis {
        if (this.modulus === 0 && !this.hasUpDown()) return this.digitalSynthesisRipple();
        return this.digitalSynthesisWholeRegister();
    }

    /** A genuine asynchronous ripple counter, structured exactly like a real 7493 (see
     * dice-ts/src/chips/7493.ts): bit 0 (the LSB) toggles on the configured edge of the real
     * clock pin; each subsequent bit w toggles on bit (w-1)'s OWN falling edge - the real carry
     * condition for binary up-counting (incrementing only ever carries out of a bit at the exact
     * moment that bit falls from 1 to 0), always negedge-triggered regardless of the top-level
     * Negative Edge Triggered flag (which only configures the EXTERNAL clock at bit 0 - the
     * internal ripple carry's edge sense is a fixed consequence of "what carrying means", not a
     * user setting - matching every cell of the real 7493, which is unconditionally negedge
     * regardless of any polarity option). Reset is the same broadcast, level-sensitive pin every
     * bit already had.
     *
     * Each bit-cell's only inputs are its own {resetPin, clockSourcePin} - never a sibling bit's
     * value - unlike digitalSynthesisWholeRegister()'s one-LUT-cell-reads-every-other-bit design.
     * That whole-register design is fine as long as a counter's reset stays a pure function of
     * its OWN bits (a single self-contained feedback loop can still jointly settle), but it makes
     * literal ChipState.ASLEEP structurally unreachable for ANY bit with more than one sibling:
     * ASLEEP requires a chip's activeOutputs to reach zero, which needs every consumer to
     * release its interest via activateInputs()'s cross-reference-the-upstream's-own-cycle
     * handshake (chip.ts) - a handshake that depends on catching that specific upstream chip
     * still mid-relearning (ACTIVE) at the moment the consumer itself (re)activates. With every
     * bit of a counter mutually watching every other bit and all sharing the exact same clock,
     * every bit tends to settle into PASSIVE at essentially the same moment, so none ever catches
     * a sibling still ACTIVE and the release never fires for any sibling-to-sibling edge -
     * permanently pinning activeOutputs nonzero. (PASSIVE, note, is NOT an optimization: every
     * updateInputs() call re-runs the full LUT lookup regardless of ACTIVE/PASSIVE - see
     * chip.ts's updateInputs() - so a mutually-clique-coupled counter's bits get fully
     * resimulated on literally every clock edge forever, same cost as if unoptimized.) A real
     * 7493-style bit's only real per-edge dependency is its own single ripple/clock source, so
     * this same handshake has a real chance to succeed and does - confirmed empirically against
     * dice-ts's actual 7493-based Pong circuit, which settles every relevant chip to ASLEEP
     * within its first few hundred clock cycles. */
    private digitalSynthesisRipple(): DigitalSynthesis {
        const bits = this.bits;
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const clkPin = 1, resetPin = 2;
        const qPin = (w: number) => bits + 2 - w; // w=0 is LSB, matches execute()'s pins[lastBit-i] layout
        const neg = this.negativeEdgeTriggered();
        const invertBit = this.invertreset ? 1 : 0;

        const desc: ChipDesc[] = [];
        for (let w = 0; w < bits; w++) {
            const out = qPin(w);
            const clockSource = w === 0 ? clkPin : qPin(w - 1);
            const edgeFn = w === 0 ? (neg ? negEdge : posEdge) : negEdge;

            const logic: ChipLogic = (pin, prevPin, eventPin) => {
                let bitW: number;
                if (edgeFn(pin, eventPin, clockSource)) bitW = prevPin[out] ^ 1;
                else bitW = prevPin[out];
                if (pin[resetPin] ^ invertBit) bitW = 0;
                pin[out] = bitW;
            };

            desc.push(
                chipStart(logic).inputPins(resetPin, clockSource).eventPins(clockSource).outputPin(out).prevOutputPin(out)
                    .outputDelayS(this.propagationDelay, this.propagationDelay)
            );
        }
        return { desc, pinMap };
    }

    /** Original Phase 3 synthesis (see noble-stirring-rabin.md): one LUT cell per bit, each
     * cell's own real Q pin doubling as its prevOutputPin (see DFlipFlopElm.digitalSynthesis()'s
     * identical convention), with the OTHER bits' current values wired in as plain inPins - every
     * bit-cell reconstructs the whole register's value (its own bit from prevPin, every other bit
     * from its real wired pin, which reflects that sibling's PRE-edge output since dice-ts's
     * engine always defers an output's own `.output` mutation through the event queue - see
     * chip.ts's updateOutput() - even at zero delay, so no sibling can appear to have already
     * advanced when this cell reads it off the same clock edge), applies +/-1 and the configured
     * modulus exactly per evaluate() above, then re-extracts its own bit. When idle (no edge),
     * the reconstruction trivially reproduces the bit it started from (nothing else touches
     * position w), which is why this needs no separate "hold" branch - matches evaluate()'s
     * "genuine synchronous design" docstring, just with the whole register visible to every
     * bit-cell instead of a chain. Still used for modulus!==0 (an arbitrary non-power-of-2
     * modulus needs a synchronous compare-and-clear against the WHOLE register - see
     * digitalSynthesisRipple()'s docstring) and for Up/Down (a real ripple up/down counter needs
     * an extra per-stage XOR-carry-select cell, not yet implemented) - see digitalSynthesis()
     * above. Trade-off: each bit-cell's LUT is `2^(bits+2+hasUpDown)` truth-table entries, so
     * this doesn't scale to very wide (~20+ bit) counters - fine for this editor's realistic
     * range. */
    private digitalSynthesisWholeRegister(): DigitalSynthesis {
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
