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
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Locale } from "./Locale";
import { chipStart, POS_EDGE_PIN as posEdge, NEG_EDGE_PIN as negEdge, i1, i2, i3 } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import { appendInfoLine, digitalStateTextForOutput } from "./digital/DigitalGraphBuilder";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

export class Counter2Elm extends ChipElm {
    modulus: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
            try {
                this.modulus = parseInt(st!.nextToken());
            } catch (e) {}
        }
    }

    dump(): string {
        return super.dump() + " " + this.modulus;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "mo", this.modulus);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.modulus = xml.parseIntAttr("mo", this.modulus);
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        // One line per bit (not a summary): see CounterElm.getInfo()'s docstring for why -
        // uses each pin's own real label (pins[i].text, e.g. "Q0") rather than a made-up
        // index, since Q/RCO ordering depends on setupPins()'s layout, not a fixed index.
        let k = 0;
        for (const pin of this.pins) {
            if (!pin.output) continue;
            appendInfoLine(arr, `${pin.text}: ${digitalStateTextForOutput(this, k)}`);
            k++;
        }
    }

    needsBits(): boolean { return true; }
    allowBus(): boolean { return true; }
    getChipName(): string {
        if (this.modulus === 0)
            return "Counter";
        return Locale.LS("Counter") + Locale.LS(" (mod ") + this.modulus + ")";
    }

    clk: number = 0;
    clr: number = 0;
    enp: number = 0;
    ent: number = 0;
    rco: number = 0;
    load: number = 0;

    setupPins(): void {
        this.sizeX = 2;
        const bitsY = this.useBus() ? 1 : this.bits;
        this.sizeY = bitsY + 3;
        this.pins = new Array(this.getPostCount());
        this.makeBitPins(this.bits, 1, ChipElm.SIDE_E, 0,         "Q", true,  true,  true);
        this.makeBitPins(this.bits, 1, ChipElm.SIDE_W, this.bits, "I", false, false, true);
        const p = this.bits * 2;
        this.clk  = p;
        this.clr  = p + 1;
        this.enp  = p + 2;
        this.rco  = p + 3;
        this.load = p + 4;
        this.ent  = p + 5;
        this.pins[this.clk] = new Pin(this, 0, ChipElm.SIDE_W, "");
        this.pins[this.clk].clock = true;
        this.pins[this.clr] = new Pin(this, bitsY + 1, ChipElm.SIDE_W, "CLR");
        this.pins[this.clr].bubble = true;
        this.pins[this.enp] = new Pin(this, bitsY + 2, ChipElm.SIDE_W, "EnP");
        this.pins[this.rco] = new Pin(this, 0, ChipElm.SIDE_E, "RCO");
        this.pins[this.rco].output = true;
        this.pins[this.load] = new Pin(this, bitsY + 1, ChipElm.SIDE_E, "LOAD");
        this.pins[this.load].bubble = true;
        this.pins[this.ent] = new Pin(this, bitsY + 2, ChipElm.SIDE_E, "EnT");
    }
    getPostCount(): number {
        return this.bits * 2 + 6;
    }
    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        if (n === 1)
            return new EditInfo("Modulus", this.modulus, 1, 1).setDimensionless();
        return null;
    }
    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 2) {
                this.bits = Math.floor(ei.value);
                this.setupPins();
                this.setPoints();
                this.allocNodes();
            } else
                ei.setError("must be >= 2");
        }
        if (n === 1)
            this.modulus = Math.floor(ei.value);
    }
    getVoltageSourceCount(): number { return this.bits + 1; }

    carry: boolean = false;

    execute(): void {
        if (this.pins[this.clk].value && !this.lastClock) {
            if (this.pins[this.enp].value && this.pins[this.ent].value) {
                let value = 0;

                // get current value
                const lastBit = this.bits - 1;
                for (let i = 0; i !== this.bits; i++)
                    if (this.pins[lastBit - i].value)
                        value |= 1 << i;

                // update value
                value++;
                const realmod = (this.modulus === 0) ? (1 << this.bits) : this.modulus;
                value %= realmod;

                // convert value to binary
                for (let i = 0; i !== this.bits; i++)
                    this.writeOutput(lastBit - i, (value & (1 << i)) !== 0);

                this.carry = (value === realmod - 1);
            }

            if (!this.pins[this.load].value) {
                for (let i = 0; i !== this.bits; i++)
                    this.writeOutput(i, this.pins[i + this.bits].value);

                let value = 0;

                // get current value
                const lastBit = this.bits - 1;
                for (let i = 0; i !== this.bits; i++)
                    if (this.pins[lastBit - i].value)
                        value |= 1 << i;

                const realmod = (this.modulus === 0) ? (1 << this.bits) : this.modulus;

                this.carry = (value === realmod - 1);
            }
        }
        if (!this.pins[this.clr].value) {
            for (let i = 0; i !== this.bits; i++)
                this.writeOutput(i, false);
            this.carry = false;
        }

        this.lastClock = this.pins[this.clk].value;
        this.writeOutput(this.rco, this.carry && this.pins[this.ent].value);
    }

    /** modulus===0 (plain power-of-2 binary counting, realmod = 1<<bits) gets a genuine
     * ripple/gated-toggle synthesis - see digitalSynthesisRipple() below, structured like the real
     * 74163 (dice-ts/src/chips/9316.ts) and like CounterElm.digitalSynthesisRipple(). An arbitrary
     * non-power-of-2 modulus still needs every bit-cell to see the whole register for the
     * synchronous compare-and-clear against realmod-1, so that case (and modulus===1, the
     * degenerate always-zero case) keeps the original digitalSynthesisWholeRegister() below - see
     * its own docstring for why that one can't be a ripple chain. */
    digitalSynthesis(): DigitalSynthesis {
        if (this.modulus === 0) return this.digitalSynthesisRipple();
        return this.digitalSynthesisWholeRegister();
    }

    /** A genuine ripple/gated-toggle counter, structured exactly like the real 74163
     * (dice-ts/src/chips/9316.ts) and like CounterElm.digitalSynthesisRipple() (see its own
     * docstring for why a whole-register design structurally prevents ChipState.ASLEEP - the
     * same problem applies here). Two internal gating cells (cntPin, ldPin) reproduce 9316.ts's
     * `clk`/`ld` cells: each latches high on the real clock's rising edge (if its condition holds)
     * and drops low on the clock's falling edge, so downstream bit-cells see gated edges that
     * track the real clock's period without depending on ENP/ENT/LOAD directly (avoiding the
     * mutual-whole-register coupling that blocks sleep).
     *
     * Unlike CounterElm.digitalSynthesisRipple() (which models a real 7493 - a genuinely
     * asynchronous chip whose stages really do ripple, each with its own full propagation delay
     * stacking onto the next), the 9316/74163 this models is internally synchronous: every Q pin
     * changes together, at essentially the same moment, no matter how many bits carry. dice-ts's
     * actual 9316.ts achieves that with two speeds - an internal toggle chain (its `a`/`b`/`c`/`d`
     * cells) wired bit-to-bit through internal-only pins with a near-zero delay (0.01ns), so the
     * whole internal ripple finishes many orders of magnitude faster than the real output delay;
     * then a separate per-bit buffer cell (`buf()`) copies each settled internal pin out to its
     * real Q pin with the actual ~12-15ns delay, depending on nothing but that one internal pin.
     * Every buffer fires within ~0.01ns of the others, so externally all Q pins move together -
     * this is what makes a real 74163 synchronous despite internally being a ripple/carry chain.
     *
     * Each internal bit-cell here (intPin(w)) only ever depends on {clrPin, ldPin, its own I pin,
     * its own clock source} - bit 0's clock source is cntPin (the gated "counting" edge); bit w>0's
     * clock source is bit (w-1)'s own INTERNAL pin (not its real Q pin), toggling on ITS falling
     * edge, the real ripple-carry condition for binary up-counting - never a sibling's live value
     * read combinationally, unlike digitalSynthesisWholeRegister()'s design. LOAD is checked first
     * (posEdge(ldPin) wins), matching execute()'s ordering where the LOAD branch's writeOutput()
     * runs strictly after the increment branch's. CLR remains the same unconditional,
     * asynchronous/level-sensitive check every cell already had. RCO stays the separate
     * whole-register combinational cell described below - it doesn't block any Q bit's own
     * ability to sleep, and correctly sees only the buffered (externally-synchronous) Q pins. */
    private digitalSynthesisRipple(): DigitalSynthesis {
        const bits = this.bits;
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const qPin = (w: number) => bits - w;
        const iPin = (w: number) => 2 * bits - w;
        const clkPin  = 2 * bits + 1;
        const clrPin  = 2 * bits + 2;
        const enpPin  = 2 * bits + 3;
        const rcoPin  = 2 * bits + 4;
        const loadPin = 2 * bits + 5;
        const entPin  = 2 * bits + 6;
        const realmod = 1 << bits;

        const cntPin = i1; // gated "counting enabled at this clock edge" pulse, like 9316.ts's i5
        const ldPin  = i2; // gated "loading at this clock edge" pulse, like 9316.ts's i6
        const intPin = (w: number) => i3 + w; // fast internal ripple-chain pin for bit w, like 9316.ts's i4/i3/i2/i1

        const desc: ChipDesc[] = [];

        const cntLogic: ChipLogic = (pin, prevPin, eventPin) => {
            if (posEdge(pin, eventPin, clkPin) && pin[loadPin] && pin[enpPin] && pin[entPin]) pin[cntPin] = 1;
            else if (negEdge(pin, eventPin, clkPin)) pin[cntPin] = 0;
            else pin[cntPin] = prevPin[cntPin];
        };
        desc.push(chipStart(cntLogic).inputPins(clkPin, loadPin, enpPin, entPin).eventPins(clkPin).outputPin(cntPin).prevOutputPin(cntPin));

        const ldLogic: ChipLogic = (pin, prevPin, eventPin) => {
            if (posEdge(pin, eventPin, clkPin) && !pin[loadPin]) pin[ldPin] = 1;
            else if (negEdge(pin, eventPin, clkPin)) pin[ldPin] = 0;
            else pin[ldPin] = prevPin[ldPin];
        };
        desc.push(chipStart(ldLogic).inputPins(clkPin, loadPin).eventPins(clkPin).outputPin(ldPin).prevOutputPin(ldPin));

        for (let w = 0; w < bits; w++) {
            const out = qPin(w);
            const internal = intPin(w);
            const clockSource = w === 0 ? cntPin : intPin(w - 1);

            const logic: ChipLogic = (pin, prevPin, eventPin) => {
                let bitW = prevPin[internal];
                if (posEdge(pin, eventPin, ldPin)) bitW = pin[iPin(w)];
                // The `&& !pin[ldPin]` guard matches 9316.ts's own bit cells exactly (every one
                // of them, including the LSB): without it, a neighbor loading a falling edge onto
                // its own internal pin (a byproduct of ITS load, not a real count pulse) would
                // ripple into this bit's toggle too, corrupting whichever bits happen to see a
                // high-to-low load transition upstream while LOAD is asserted.
                else if ((w === 0 ? posEdge(pin, eventPin, cntPin) : negEdge(pin, eventPin, clockSource)) && !pin[ldPin])
                    bitW = prevPin[internal] ^ 1;
                if (!pin[clrPin]) bitW = 0;
                pin[internal] = bitW;
            };

            // Near-zero delay: matches 9316.ts's internal a/b/c/d cells (0.01ns), so the whole
            // internal ripple (up to `bits` hops) settles long before the buffer below ever fires.
            desc.push(
                chipStart(logic).inputPins(clrPin, ldPin, iPin(w), clockSource).eventPins(ldPin, clockSource)
                    .outputPin(internal).prevOutputPin(internal).outputDelayNs(0.01, 0.01)
            );

            // Buffer: matches 9316.ts's buf() cells - a pure passthrough from the (already
            // settled) internal pin to the real, externally-visible Q pin, with the actual per-bit
            // delay applied here and only here. Depends on nothing but this bit's own internal
            // pin, so it can no longer stack with a sibling's delay the way the old
            // direct-external-ripple design did.
            desc.push(
                chipStart((pin) => { pin[out] = pin[internal]; }).inputPins(internal).outputPin(out)
                    .outputDelayNs(12.0, 15.0)
            );
        }

        const rcoLogic: ChipLogic = (pin) => {
            let value = 0;
            for (let j = 0; j < bits; j++) if (pin[qPin(j)]) value |= 1 << j;
            pin[rcoPin] = (pin[entPin] && value === realmod - 1) ? 1 : 0;
        };
        const rcoIn: number[] = [entPin];
        for (let j = 0; j < bits; j++) rcoIn.push(qPin(j));
        // matches dice-ts's 9316 TC (ripple carry) delay
        desc.push(chipStart(rcoLogic).inputPins(...rcoIn).outputPin(rcoPin).outputDelayNs(18.0, 17.0));

        return { desc, pinMap };
    }

    /** Whole-register reconstruction, one LUT cell per bit - same technique as
     * CounterElm.digitalSynthesisWholeRegister() (see its docstring for the rationale): LOAD and
     * an arbitrary non-power-of-2 modulus both need every bit-cell to see the whole register, so
     * this can't be a genuine per-bit ripple chain like digitalSynthesisRipple() above (which only
     * handles modulus===0).
     *
     * LOAD (active low, unconditional bubble, no invert option) is a synchronous straight-through
     * per-bit passthrough that overrides counting whenever active - matching execute()'s
     * ordering, where the LOAD branch's writeOutput() runs strictly after the increment branch's
     * and so wins outright when both would otherwise apply on the same edge. CLR (active low, no
     * invert option either) is checked every call, independent of the clock edge, i.e. genuinely
     * asynchronous/level-sensitive - matching execute()'s own unconditional `if
     * (!this.pins[this.clr].value)` outside the edge block, and CounterElm's identical
     * reset handling.
     *
     * RCO is a separate, purely combinational cell: ENT AND (register === realmod-1), read
     * straight off the live Q pins. This is equivalent to execute()'s private `carry` field (which
     * only ever gets set to that same comparison, right when Q itself changes) but needs no shadow
     * bit of state, and is correct even in the degenerate modulus===1 case where execute()'s
     * `carry: boolean = false` initializer disagrees with the true comparison at power-up. */
    private digitalSynthesisWholeRegister(): DigitalSynthesis {
        const bits = this.bits;
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const qPin = (w: number) => bits - w;      // w=0 is LSB, matches execute()'s pins[lastBit-i] layout
        const iPin = (w: number) => 2 * bits - w;  // I pin straight-through to the Q pin of the same weight
        const clkPin  = 2 * bits + 1;
        const clrPin  = 2 * bits + 2;
        const enpPin  = 2 * bits + 3;
        const rcoPin  = 2 * bits + 4;
        const loadPin = 2 * bits + 5;
        const entPin  = 2 * bits + 6;
        const realmod = (this.modulus === 0) ? (1 << bits) : this.modulus;

        const desc: ChipDesc[] = [];
        for (let w = 0; w < bits; w++) {
            const out = qPin(w);
            const inPins = [clkPin, clrPin, loadPin, enpPin, entPin, iPin(w)];
            for (let j = 0; j < bits; j++) if (j !== w) inPins.push(qPin(j));

            const logic: ChipLogic = (pin, prevPin, eventPin) => {
                let bitW = prevPin[out];
                if (posEdge(pin, eventPin, clkPin)) {
                    if (!pin[loadPin]) {
                        bitW = pin[iPin(w)];
                    } else if (pin[enpPin] && pin[entPin]) {
                        let value = 0;
                        for (let j = 0; j < bits; j++) {
                            const bit = j === w ? prevPin[out] : pin[qPin(j)];
                            if (bit) value |= 1 << j;
                        }
                        value = (value + 1) % realmod;
                        bitW = (value >> w) & 1;
                    }
                }
                if (!pin[clrPin]) bitW = 0;
                pin[out] = bitW;
            };

            // matches dice-ts's 9316 buffered Q delay (~/Projects/dice-ts/src/chips/9316.ts)
            desc.push(chipStart(logic).inputPins(...inPins).eventPins(clkPin).outputPin(out).prevOutputPin(out)
                .outputDelayNs(12.0, 15.0));
        }

        const rcoLogic: ChipLogic = (pin) => {
            let value = 0;
            for (let j = 0; j < bits; j++) if (pin[qPin(j)]) value |= 1 << j;
            pin[rcoPin] = (pin[entPin] && value === realmod - 1) ? 1 : 0;
        };
        const rcoIn: number[] = [entPin];
        for (let j = 0; j < bits; j++) rcoIn.push(qPin(j));
        // matches dice-ts's 9316 TC (ripple carry) delay
        desc.push(chipStart(rcoLogic).inputPins(...rcoIn).outputPin(rcoPin).outputDelayNs(18.0, 17.0));

        return { desc, pinMap };
    }

    getDumpType(): number { return 421; }
    getXmlDumpType(): string { return "ctr2"; }
}
