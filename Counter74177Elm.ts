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
import { EditInfo } from "./EditInfo";
import { appendInfoLine, digitalStateTextForOutput, digitalOutputPosts, digitalOutputPin } from "./digital/DigitalGraphBuilder";
import type { DigitalInitialState } from "./digital/DigitalGraphBuilder";
import { chipStart, NEG_EDGE_PIN as negEdge } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

/** Models a real SN74177/74LS177 "Presettable Binary Counter/Latch" (verified against the
 * NTE74177 datasheet, which cross-references the same part), generalized from its fixed 4 bits
 * to needsBits()'s usual "# of Bits" option - reduces to a real 74177 at bits===4. Built from two
 * independent pieces that share only CLR and LOAD:
 *   - bit 0: an independent flip-flop, toggles on CLK1's falling edge.
 *   - bits 1..bits-1: an independent (bits-1)-wide ripple counter - bit 1 toggles on CLK2's
 *     falling edge; each subsequent bit ripples off the PREVIOUS bit's own falling edge - exactly
 *     like CounterElm's real-7493 ripple chain, just clocked from CLK2 instead of an external pin.
 * Bit 0 is NOT wired to CLK2 internally on the real chip (the datasheet's own "Typical Count
 * Configuration" section is explicit about this): normal binary counting needs an external jumper
 * from Q0 to CLK2. The "Single Clock" option (see singleClock() below) makes that jumper for you -
 * CLK2 disappears as an external pin and the ripple chain's first stage clocks from Q0's own value
 * instead - so left off, this still models the two-independent-counters mode (a real, documented
 * use of this chip: /2 off CLK1, /(2^(bits-1)) off CLK2) exactly as before. At bits===1 there's no
 * ripple chain at all (just the CLK1 flip-flop), so CLK2/singleClock() are moot and no CLK2 pin is
 * ever shown.
 * LOAD (active low) is asynchronous and level-sensitive/transparent - not edge-gated like
 * Counter2Elm's LOAD - so outputs continuously track the data inputs whenever it's held low,
 * which is also how the datasheet describes using this chip as a plain latch. CLR (active low) is
 * the usual unconditional asynchronous clear and takes priority over LOAD. Neither pin has an
 * invert option - both are unconditionally active-low on the real chip, with no user-selectable
 * polarity like CounterElm's reset. */
export class Counter74177Elm extends ChipElm implements DigitalInitialState {
    static readonly FLAG_SINGLE_CLOCK = 1 << 1;

    // Post layout (all computed in setupPins(), since it depends on bits and singleClock()):
    //   0..bits-1        data inputs I0..I(bits-1)
    //   clk1Post         CLK1 (always present)
    //   clk2Post         CLK2 (present only when bits>=2 && !singleClock(); else -1)
    //   loadPost, clrPost
    //   outputBase..+bits-1   Q0..Q(bits-1)
    clk1Post: number = 0;
    clk2Post: number = -1;
    loadPost: number = 0;
    clrPost: number = 0;
    outputBase: number = 0;

    lastClk1: boolean = false;
    lastRippleClock: boolean = false; // tracks whatever clocks bit 1 (CLK2, or bit 0 if singleClock())

    singleClock(): boolean { return this.hasFlag(Counter74177Elm.FLAG_SINGLE_CLOCK); }
    hasRipple(): boolean { return this.bits >= 2; }
    needsBits(): boolean { return true; }
    allowBus(): boolean { return true; }

    dataPost(i: number): number { return i; }
    qPost(i: number): number { return this.outputBase + i; }

    /** DigitalInitialState - see its own docstring. this.pins[post].value already holds the
     * restored Q value (from ChipElm.undumpXml()'s generic "v"+i attrs), and every Q pin here
     * doubles as its own state cell (see digitalSynthesis() below, same convention as
     * CounterElm.digitalSynthesisRipple()), so digitalOutputPin() names the right pin directly -
     * no separate internal/buffer indirection to account for. */
    digitalInitialState(): { pin: number, value: number }[] | null {
        return digitalOutputPosts(this).map(post => ({ pin: digitalOutputPin(this, post)!, value: this.pins[post].value ? 1 : 0 }));
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        let k = 0;
        for (const pin of this.pins) {
            if (!pin.output) continue;
            if (ChipElm.app.developerMode)
                appendInfoLine(arr, `${pin.text}: ${digitalStateTextForOutput(this, k)}`);
            k++;
        }
    }

    /** One cell per bit, each keyed off its own clock source (CLK1 for bit 0; then CLK2, or -
     * singleClock() - bit 0 itself, for bit 1; then each subsequent bit's own predecessor) - never
     * a sibling's value read combinationally, so this can genuinely sleep like
     * CounterElm.digitalSynthesisRipple() (see its docstring for why that matters). CLR/LOAD are
     * plain (non-edge) inputPins, so a level change on either still wakes the cell even without
     * being listed as an eventPin - only the edge-detected clock source needs that (matches
     * DFlipFlopElm's reset/set pins, which get the same treatment). Delays: CLK1->bit0 and
     * CLK2->bit1 match the datasheet's own max propagation delays (for CLK1->QA/CLK2->QB); every
     * later ripple hop approximates the datasheet's CLK2->QC/QD cumulative max delays minus the
     * CLK2->QB figure (~24-25ns per additional stage). singleClock() reuses the CLK2->bit1 delay
     * for bit0->bit1 too, since that stage is still just "one ripple hop" - only which pin feeds
     * it changed. */
    digitalSynthesis(): DigitalSynthesis {
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const bits = this.bits;
        const dataPin = (i: number) => this.dataPost(i) + 1;
        const qPin = (i: number) => this.qPost(i) + 1;
        const clk1Pin = this.clk1Post + 1, loadPin = this.loadPost + 1, clrPin = this.clrPost + 1;
        const bit1ClockPin = this.singleClock() ? qPin(0) : this.clk2Post + 1;

        const bitCell = (i: number, clockSrc: number, lh: number, hl: number): ChipDesc => {
            const outPin = qPin(i);
            const logic: ChipLogic = (pin, prevPin, eventPin) => {
                let bit: number;
                if (!pin[clrPin]) bit = 0;
                else if (!pin[loadPin]) bit = pin[dataPin(i)];
                else if (negEdge(pin, eventPin, clockSrc)) bit = prevPin[outPin] ^ 1;
                else bit = prevPin[outPin];
                pin[outPin] = bit;
            };
            return chipStart(logic).inputPins(clrPin, loadPin, dataPin(i), clockSrc).eventPins(clockSrc)
                .outputPin(outPin).prevOutputPin(outPin).outputDelayNs(lh, hl);
        };

        const desc: ChipDesc[] = [bitCell(0, clk1Pin, 13.0, 17.0)];
        for (let i = 1; i < bits; i++)
            desc.push(bitCell(i, i === 1 ? bit1ClockPin : qPin(i - 1), i === 1 ? 17.0 : 24.0, i === 1 ? 26.0 : 25.0));
        return { desc, pinMap };
    }

    getChipName(): string { return "Presettable Counter/Latch"; }

    setupPins(): void {
        if (!this.bits) return;
        const bits = this.bits;
        const clk2Needed = this.hasRipple() && !this.singleClock();

        const leftCount = bits + 3 + (clk2Needed ? 1 : 0); // data + CLK1 + [CLK2] + LOAD + CLR
        this.sizeX = 2;
        this.sizeY = Math.max(leftCount, bits);
        this.pins = new Array(leftCount + bits);

        this.makeBitPins(bits, 0, ChipElm.SIDE_W, 0, "I", false, false, false);
        this.outputBase = leftCount;
        this.makeBitPins(bits, 0, ChipElm.SIDE_E, this.outputBase, "Q", true, true, false);

        let row = bits;
        this.clk1Post = bits;
        this.pins[this.clk1Post] = new Pin(this, row++, ChipElm.SIDE_W, clk2Needed ? "CLK1" : "");
        this.pins[this.clk1Post].clock = true;
        this.pins[this.clk1Post].bubble = true;

        if (clk2Needed) {
            this.clk2Post = bits + 1;
            this.pins[this.clk2Post] = new Pin(this, row++, ChipElm.SIDE_W, "CLK2");
            this.pins[this.clk2Post].clock = true;
            this.pins[this.clk2Post].bubble = true;
        } else {
            this.clk2Post = -1;
        }

        this.loadPost = leftCount - 2;
        this.pins[this.loadPost] = new Pin(this, row++, ChipElm.SIDE_W, "LOAD");
        this.pins[this.loadPost].bubble = true;

        this.clrPost = leftCount - 1;
        this.pins[this.clrPost] = new Pin(this, row++, ChipElm.SIDE_W, "CLR");
        this.pins[this.clrPost].bubble = true;

        this.allocNodes();
    }

    getPostCount(): number {
        if (!this.bits) return 0;
        const clk2Needed = this.hasRipple() && !this.singleClock();
        return this.bits * 2 + 3 + (clk2Needed ? 1 : 0);
    }

    getVoltageSourceCount(): number { return this.bits; }

    execute(): void {
        const bits = this.bits;
        const clr = !this.pins[this.clrPost].value;
        const load = !this.pins[this.loadPost].value;

        if (clr) {
            for (let i = 0; i < bits; i++) this.pins[this.qPost(i)].value = false;
        } else if (load) {
            for (let i = 0; i < bits; i++) this.pins[this.qPost(i)].value = this.pins[this.dataPost(i)].value;
        } else {
            // bit 0: independent flip-flop, toggles on CLK1's falling edge
            if (this.lastClk1 && !this.pins[this.clk1Post].value)
                this.pins[this.qPost(0)].value = !this.pins[this.qPost(0)].value;

            // bits 1..bits-1: independent ripple counter, advances as a whole on the falling edge
            // of whatever clocks bit 1 - the real external CLK2 pin, or (singleClock()) bit 0's
            // own value (already updated above if this tick's the edge), exactly as if bit 0 were
            // jumpered to CLK2 on the real chip (equivalent to genuine per-bit ripple since these
            // bits never load or clear independently of each other)
            if (this.hasRipple() && this.lastRippleClock && !this.rippleClockValue()) {
                const rippleBits = bits - 1;
                let value = 0;
                for (let i = 0; i < rippleBits; i++)
                    if (this.pins[this.qPost(i + 1)].value) value |= 1 << i;
                value = (value + 1) & ((1 << rippleBits) - 1);
                for (let i = 0; i < rippleBits; i++)
                    this.pins[this.qPost(i + 1)].value = (value & (1 << i)) !== 0;
            }
        }

        this.lastClk1 = this.pins[this.clk1Post].value;
        if (this.hasRipple()) this.lastRippleClock = this.rippleClockValue();
    }

    private rippleClockValue(): boolean {
        return this.singleClock() ? this.pins[this.qPost(0)].value : this.pins[this.clk2Post].value;
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        if (n === 1 && this.hasRipple())
            return EditInfo.createCheckbox("Single Clock (ties bit 0 to CLK2)", this.singleClock());
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 1) {
                this.bits = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
                ei.newDialog = true;
            } else
                ei.setError("must be >= 1");
            return;
        }
        if (n === 1) {
            this.flags = ei.changeFlag(this.flags, Counter74177Elm.FLAG_SINGLE_CLOCK);
            this.setupPins();
            this.setPoints();
            return;
        }
    }

    getDumpType(): number { return 438; }
    getXmlDumpType(): string { return "ctr177"; }
}
