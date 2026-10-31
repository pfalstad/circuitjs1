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

/** Models a real SN74193/74LS193 "Synchronous 4-Bit Up/Down Binary Counter" (verified against
 * dice-ts's own chips/74193.ts, itself ported from the real chip's SPICE-derived gate netlist),
 * generalized from its fixed 4 bits to needsBits()'s usual "# of Bits" option - reduces to a real
 * 74193 at bits===4.
 *
 * Unlike CounterElm (a single clock + direction pin, idealized) and Counter2Elm (single clock +
 * ENP/ENT, modeled on the 74163/9316 family), the 74193 has two independent clock inputs - drawn
 * as UP (count up, real chip's CPU) and DN (count down, real chip's CPD), each rising-edge
 * triggered - and never counts on both at once (holding the unused clock high is the real chip's
 * documented idle state for the other direction). LD (real chip's PL, parallel load) and CLR
 * (real chip's MR, master reset) are both asynchronous/level-sensitive, not edge-gated: CLR
 * unconditionally forces every Q low whenever high (active high, no invert option - the real chip
 * has none), and LD (active low, no invert option either) is transparent - Q tracks the data
 * inputs continuously whenever LD is low, same convention as Counter74177Elm's LOAD. CLR takes
 * priority over LD, matching the real chip's internal gating (and execute()'s own ordering
 * below). CO (real chip's TCU, terminal count up / carry, active low) and BO (real chip's TCD,
 * terminal count down / borrow, active low) are purely combinational: CO is low exactly when
 * every Q is 1 AND UP is low; BO is low exactly when every Q is 0 AND DN is low - so cascading
 * another 193 just needs CO wired to the next stage's UP (or BO to DN).
 *
 * FLAG_BCD switches this to a real SN74192/74LS192 instead - a decade (BCD, mod 10) counter,
 * otherwise identical (same pinout, same CLR/LD/CO/BO semantics). Unlike CounterElm's/
 * Counter2Elm's runtime `modulus` field, this is NOT a generic "any modulus" option: dice-ts's
 * chips/74192.ts (the real chip's hand-derived per-bit truth tables) shows that a mod-10 wrap
 * needs bespoke Boolean minimization per bit - bit 1 and bit 2's carry/borrow conditions need to
 * peek at bit 3 (QD) to suppress the normal ripple once the count enters the 8-9 region, and bit
 * 3 gets a whole extra branch for the 9<->0 wrap - none of which follows mechanically from the
 * 193's clean "AND of lower bits" recurrence the way a real modulus parameter would need to.
 * Since that only exists as a hand-derived formula for modulus=10 (not a general N), FLAG_BCD is
 * a fixed mode, not a numeric field - and forces bits=4 (a decade digit is inherently 4 bits;
 * multi-digit BCD cascades multiple 4-bit stages via CO->next stage's UP, same as a real 74192).
 */
export class Counter193Elm extends ChipElm {
    static readonly FLAG_BCD = 1 << 1;
    isBCD(): boolean { return this.hasFlag(Counter193Elm.FLAG_BCD); }

    // Post layout (all computed in setupPins(), since it depends on bits):
    //   0..bits-1            Q0..Q(bits-1) (Q0 = LSB)
    //   bits..2*bits-1       data inputs I0..I(bits-1)
    //   cpuPost, cpdPost     UP (count up clock), DN (count down clock)
    //   mrPost               CLR (master reset, active high)
    //   loadPost             LD (parallel load, active low)
    //   tcuPost, tcdPost     CO (carry, active low), BO (borrow, active low)
    declare cpuPost: number;
    declare cpdPost: number;
    declare mrPost: number;
    declare loadPost: number;
    declare tcuPost: number;
    declare tcdPost: number;

    lastCPU: boolean = false;
    lastCPD: boolean = false;

    qPost(i: number): number { return this.bits - 1 - i; }
    dataPost(i: number): number { return this.bits + (this.bits - 1 - i); }

    needsBits(): boolean { return true; }
    allowBus(): boolean { return true; }
    getChipName(): string {
        return this.isBCD() ? "BCD Up/Down Counter w/ Load (74192)" : "Up/Down Counter w/ Load (74193)";
    }

    setupPins(): void {
        if (!this.bits) return;
        const bits = this.bits;
        this.sizeX = 2;
        this.sizeY = this.useBus() ? 1 : Math.max(bits+4, 6);
        this.pins = new Array(this.getPostCount());

        this.makeBitPins(bits, 0, ChipElm.SIDE_E, 0,    "Q", true,  true,  true);
        this.makeBitPins(bits, 0, ChipElm.SIDE_W, bits, "I", false, false, true);

        let row = bits;
        this.cpuPost = 2 * bits;
        this.pins[this.cpuPost] = new Pin(this, row++, ChipElm.SIDE_W, "U");
        this.pins[this.cpuPost].clock = true;

        this.cpdPost = 2 * bits + 1;
        this.pins[this.cpdPost] = new Pin(this, row++, ChipElm.SIDE_W, "D");
        this.pins[this.cpdPost].clock = true;

        this.mrPost = 2 * bits + 2;
        this.pins[this.mrPost] = new Pin(this, row++, ChipElm.SIDE_W, "CLR");

        this.loadPost = 2 * bits + 3;
        this.pins[this.loadPost] = new Pin(this, row++, ChipElm.SIDE_W, "LD");
        this.pins[this.loadPost].bubble = true;

        this.tcuPost = 2 * bits + 4;
	row = bits;
        this.pins[this.tcuPost] = new Pin(this, row++, ChipElm.SIDE_E, "CO");
        this.pins[this.tcuPost].output = true;
        this.pins[this.tcuPost].bubble = true;

        this.tcdPost = 2 * bits + 5;
        this.pins[this.tcdPost] = new Pin(this, row++, ChipElm.SIDE_E, "BO");
        this.pins[this.tcdPost].output = true;
        this.pins[this.tcdPost].bubble = true;

        this.allocNodes();
    }

    getPostCount(): number {
        if (!this.bits) return 0;
        return this.bits * 2 + 6;
    }

    getVoltageSourceCount(): number { return this.bits + 2; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return EditInfo.createCheckbox("BCD (mod 10, 74192)", this.isBCD());
        if (n === 1 && !this.isBCD())
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.flags = ei.changeFlag(this.flags, Counter193Elm.FLAG_BCD);
            if (this.isBCD()) this.bits = 4; // a decade digit is inherently 4 bits - see class docstring
            this.setupPins();
            this.setPoints();
            this.allocNodes();
        }
        if (n === 1 && !this.isBCD()) {
            if (ei.value >= 1) {
                this.bits = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
                this.allocNodes();
            } else
                ei.setError("must be >= 1");
        }
    }

    /** CLR is checked first (unconditional,
     * async, matches the real chip's priority over LD), then LD (async, transparent), then
     * whichever clock most recently rose - never both, matching real usage (the unused clock is
     * always held high, so at most one of UP/DN can be a fresh rising edge on a given tick).
     * CO/BO are recomputed every call, purely combinationally off the live Q bits and clock
     * levels - no separate shadow state needed, unlike a naive "carry latched at count time"
     * design (which would disagree with the true comparison whenever Q changes for a reason other
     * than counting, e.g. CLR or LD). */
    execute(): void {
        const bits = this.bits;
        const realmod = this.isBCD() ? 10 : (1 << bits);
        const cpu = this.pins[this.cpuPost].value;
        const cpd = this.pins[this.cpdPost].value;
        const mr = this.pins[this.mrPost].value;
        const load = !this.pins[this.loadPost].value;

        if (mr) {
            for (let i = 0; i < bits; i++) this.writeOutput(this.qPost(i), false);
        } else if (load) {
            for (let i = 0; i < bits; i++) this.writeOutput(this.qPost(i), this.pins[this.dataPost(i)].value);
        } else {
            let value = 0;
            for (let i = 0; i < bits; i++) if (this.pins[this.qPost(i)].value) value |= 1 << i;

            if (cpu && !this.lastCPU) value = (value + 1) % realmod;
            else if (cpd && !this.lastCPD) value = (value - 1 + realmod) % realmod;

            for (let i = 0; i < bits; i++) this.writeOutput(this.qPost(i), (value & (1 << i)) !== 0);
        }

        let value = 0;
        for (let i = 0; i < bits; i++) if (this.pins[this.qPost(i)].value) value |= 1 << i;
        this.writeOutput(this.tcuPost, !(value === realmod - 1 && !cpu));
        this.writeOutput(this.tcdPost, !(value === 0 && !cpd));

        this.lastCPU = cpu;
        this.lastCPD = cpd;
    }

    getDumpType(): number { return 439; }
    getXmlDumpType(): string { return "ctr193"; }
}
