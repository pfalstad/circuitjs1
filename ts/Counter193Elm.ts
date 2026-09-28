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
import { chipStart, POS_EDGE_PIN as posEdge, i1, i2, i3 } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import { appendInfoLine, digitalStateTextForOutput, digitalOutputPosts, digitalOutputPin } from "./digital/DigitalGraphBuilder";
import type { DigitalInitialState } from "./digital/DigitalGraphBuilder";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

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
 * See digitalSynthesisBCD() below for the ported formulas.
 */
export class Counter193Elm extends ChipElm implements DigitalInitialState {
    static readonly FLAG_BCD = 1 << 1;
    isBCD(): boolean { return this.hasFlag(Counter193Elm.FLAG_BCD); }

    // Post layout (all computed in setupPins(), since it depends on bits):
    //   0..bits-1            Q0..Q(bits-1) (Q0 = LSB)
    //   bits..2*bits-1       data inputs I0..I(bits-1)
    //   cpuPost, cpdPost     UP (count up clock), DN (count down clock)
    //   mrPost               CLR (master reset, active high)
    //   loadPost             LD (parallel load, active low)
    //   tcuPost, tcdPost     CO (carry, active low), BO (borrow, active low)
    cpuPost: number = 0;
    cpdPost: number = 0;
    mrPost: number = 0;
    loadPost: number = 0;
    tcuPost: number = 0;
    tcdPost: number = 0;

    lastCPU: boolean = false;
    lastCPD: boolean = false;

    qPost(i: number): number { return this.bits - 1 - i; }
    dataPost(i: number): number { return this.bits + (this.bits - 1 - i); }

    /** DigitalInitialState - see its own docstring. Every Q pin here doubles as its own state
     * cell (see digitalSynthesis() below, same convention as CounterElm.digitalSynthesisRipple()
     * and Counter74177Elm), so digitalOutputPin() names the right pin directly. */
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

    /** Analog/legacy fallback path (see startIteration() in ChipElm.ts) - digitalSynthesis()
     * below is what actually drives an all-digital circuit. CLR is checked first (unconditional,
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

    /** Ported and generalized from dice-ts's chip74193 (chips/74193.ts), which is fixed at 4
     * bits - see that file for the derivation this generalizes. Every stage is gated by the SAME
     * event pin (COUNT = CPU AND CPD, i1), rather than each bit clocking off its neighbor's own
     * edge like CounterElm.digitalSynthesisRipple() - this chip is internally synchronous, with a
     * combinational carry/borrow chain settling within a single stage delay (25-29ns, matching
     * the datasheet's CPn-to-Qn figure, uniformly - NOT increasing per bit the way a real ripple
     * chain's cumulative delay would, since the whole chain is combinational within one edge).
     *
     * The up/down direction gating reuses dice-ts's original trick: UP (i2) and DOWN (i3) are
     * plain delayed passthroughs of CPU/CPD with a delay (2ns) strictly greater than COUNT's own
     * delay (1ns), so at the instant a bit-cell's COUNT-triggered evaluation reads pin[UP]/
     * pin[DOWN], it sees the PRE-transition level of whichever clock just moved (its own passthrough
     * hasn't caught up yet) - e.g. pulsing CPU low-to-high (CPD held high) fires COUNT's edge
     * before UP's own passthrough updates, so `!pin[UP]` (still reading UP's stale low value) is
     * what actually selects the up-counting branch. This only works because COUNT's delay is
     * strictly less than UP/DOWN's - matches the real chip's internal gate topology, not just an
     * arbitrary tie-break.
     *
     * Bit 0 always toggles on any COUNT edge, independent of direction (real hardware: the LSB
     * flips on every CPU or CPD pulse). Bit w>=1 toggles iff EITHER the AND of all lower Q bits
     * (up-counting: carry propagates only when every lower bit is already 1) OR the AND of all
     * lower Q bits' complements (down-counting: borrow propagates only when every lower bit is
     * already 0) - reduces exactly to dice-ts's per-bit formulas at bits=4 (verified by hand
     * against chips/74193.ts: e.g. bit 2's up-toggle condition QA&QB matches this generalized
     * AND-of-lower-bits with w=2).
     *
     * CO/BO are separate, purely combinational cells reading the live Q pins plus UP/DN -
     * equivalent to execute()'s own CO/BO computation, just built once per bit-count rather than
     * every execute() call.
     *
     * FLAG_BCD (see class docstring) swaps in digitalSynthesisBCD()'s bit 1-3/CO cells instead -
     * bit 0 and the count/up/down/BO cells are identical in both real chips, so buildCommon()
     * below builds those once and both modes finish the rest themselves. */
    digitalSynthesis(): DigitalSynthesis {
        return this.isBCD() ? this.digitalSynthesisBCD() : this.digitalSynthesisBinary();
    }

    /** Shared setup for both digitalSynthesisBinary() and digitalSynthesisBCD(): the pin-number
     * bindings, the count/up/down cells, and bit 0's cell (a real 74192/74193's bit 0 is
     * identical - an unconditional toggle on any COUNT edge - since carrying into/borrowing from
     * the LSB never depends on which modulus the higher bits wrap at). */
    private buildCommon() {
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const qPin = (w: number) => this.qPost(w) + 1;
        const dataPin = (w: number) => this.dataPost(w) + 1;
        const cpuPin = this.cpuPost + 1, cpdPin = this.cpdPost + 1;
        const mrPin = this.mrPost + 1, loadPin = this.loadPost + 1;
        const tcuPin = this.tcuPost + 1, tcdPin = this.tcdPost + 1;

        const COUNT = i1, UP = i2, DOWN = i3;

        const countLogic: ChipLogic = (pin) => { pin[COUNT] = pin[cpuPin] & pin[cpdPin]; };
        const upLogic: ChipLogic = (pin) => { pin[UP] = pin[cpuPin]; };
        const downLogic: ChipLogic = (pin) => { pin[DOWN] = pin[cpdPin]; };

        const out0 = qPin(0);
        const bit0Logic: ChipLogic = (pin, prevPin, eventPin) => {
            let bitW = prevPin[out0];
            if (pin[mrPin]) bitW = 0;
            else if (!pin[loadPin]) bitW = pin[dataPin(0)];
            else if (posEdge(pin, eventPin, COUNT)) bitW = prevPin[out0] ^ 1;
            pin[out0] = bitW;
        };

        const desc: ChipDesc[] = [
            chipStart(countLogic).inputPins(cpuPin, cpdPin).outputPin(COUNT).outputDelayNs(1.0, 1.0),
            chipStart(upLogic).inputPins(cpuPin).outputPin(UP).outputDelayNs(2.0, 2.0),
            chipStart(downLogic).inputPins(cpdPin).outputPin(DOWN).outputDelayNs(2.0, 2.0),
            chipStart(bit0Logic).inputPins(mrPin, loadPin, dataPin(0), COUNT).eventPins(COUNT)
                .outputPin(out0).prevOutputPin(out0).outputDelayNs(25.0, 29.0),
        ];

        return { pinMap, qPin, dataPin, cpuPin, cpdPin, mrPin, loadPin, tcuPin, tcdPin, COUNT, UP, DOWN, desc };
    }

    private digitalSynthesisBinary(): DigitalSynthesis {
        const bits = this.bits;
        const { pinMap, qPin, dataPin, cpuPin, cpdPin, mrPin, loadPin, tcuPin, tcdPin, COUNT, UP, DOWN, desc } = this.buildCommon();

        for (let w = 1; w < bits; w++) {
            const out = qPin(w);
            const lowerQ: number[] = [];
            for (let j = 0; j < w; j++) lowerQ.push(qPin(j));

            const logic: ChipLogic = (pin, prevPin, eventPin) => {
                let bitW = prevPin[out];
                if (pin[mrPin]) bitW = 0;
                else if (!pin[loadPin]) bitW = pin[dataPin(w)];
                else if (posEdge(pin, eventPin, COUNT) && !pin[UP]) {
                    let carryUp = 1;
                    for (const q of lowerQ) carryUp &= pin[q];
                    bitW = carryUp ^ prevPin[out];
                } else if (posEdge(pin, eventPin, COUNT) && !pin[DOWN]) {
                    let carryDown = 1;
                    for (const q of lowerQ) carryDown &= pin[q] ^ 1;
                    bitW = carryDown ^ prevPin[out];
                }
                pin[out] = bitW;
            };

            desc.push(
                chipStart(logic).inputPins(mrPin, loadPin, dataPin(w), UP, DOWN, COUNT, ...lowerQ)
                    .eventPins(COUNT).outputPin(out).prevOutputPin(out).outputDelayNs(25.0, 29.0)
            );
        }

        const allQ: number[] = [];
        for (let w = 0; w < bits; w++) allQ.push(qPin(w));

        const tcuLogic: ChipLogic = (pin) => {
            let allOnes = 1;
            for (const q of allQ) allOnes &= pin[q];
            pin[tcuPin] = (allOnes & (pin[cpuPin] ^ 1)) ^ 1;
        };
        desc.push(chipStart(tcuLogic).inputPins(cpuPin, ...allQ).outputPin(tcuPin).outputDelayNs(17.0, 16.0));

        desc.push(this.bo(allQ, cpdPin, tcdPin));

        return { desc, pinMap };
    }

    /** Ported (not generalized - see class docstring) from dice-ts's chips/74192.ts: a real
     * SN74192's hand-derived per-bit truth tables. bit 1's and bit 2's toggle conditions gain an
     * extra AND-gated term reading bit 3 (QD) - not just the lower bits the 193's clean recurrence
     * uses - to suppress the normal ripple once the count enters the 8-9 region; bit 3 gets a
     * third branch that unconditionally toggles when the count is exactly 9 (bit0=1 AND QD=1),
     * which is what actually performs the 9->0 wrap on the way up. The resulting same-edge
     * dependency graph (bit3 depends only on bit0; bit1 and bit2 depend on bit0 and bit3) is still
     * a DAG - not a mutual cycle - so, like digitalSynthesisBinary(), every stage can still settle
     * within one COUNT edge and this chip can still reach ChipState.ASLEEP; it's just not a
     * formula that generalizes to bit counts or moduli other than 4 bits/mod 10, which is why
     * FLAG_BCD forces bits=4 rather than exposing this as a general modulus. CO only needs QA and
     * QD (bit 0 and bit 3), since 9 = 0b1001 - matching chip74192's `co` cell exactly. BO is
     * unchanged from the binary chip (see bo() below) - the borrow condition (all Q low) doesn't
     * care which modulus the counter wraps at. */
    private digitalSynthesisBCD(): DigitalSynthesis {
        const { pinMap, qPin, dataPin, cpuPin, cpdPin, mrPin, loadPin, tcuPin, tcdPin, COUNT, UP, DOWN, desc } = this.buildCommon();
        const [qa, qb, qc, qd] = [qPin(0), qPin(1), qPin(2), qPin(3)];

        const bit1Logic: ChipLogic = (pin, prevPin, eventPin) => {
            let bitW = prevPin[qb];
            if (pin[mrPin]) bitW = 0;
            else if (!pin[loadPin]) bitW = pin[dataPin(1)];
            else if (posEdge(pin, eventPin, COUNT) && !pin[UP] && pin[qa] && !pin[qd]) bitW = prevPin[qb] ^ 1;
            else if (posEdge(pin, eventPin, COUNT) && !pin[DOWN] && !pin[qa] && (prevPin[qb] || pin[qc] || pin[qd])) bitW = prevPin[qb] ^ 1;
            pin[qb] = bitW;
        };
        desc.push(chipStart(bit1Logic).inputPins(mrPin, loadPin, dataPin(1), UP, DOWN, qa, qc, qd, COUNT)
            .eventPins(COUNT).outputPin(qb).prevOutputPin(qb).outputDelayNs(25.0, 29.0));

        const bit2Logic: ChipLogic = (pin, prevPin, eventPin) => {
            let bitW = prevPin[qc];
            if (pin[mrPin]) bitW = 0;
            else if (!pin[loadPin]) bitW = pin[dataPin(2)];
            else if (posEdge(pin, eventPin, COUNT) && !pin[UP]) bitW = (pin[qa] & pin[qb]) ^ prevPin[qc];
            else if (posEdge(pin, eventPin, COUNT) && !pin[DOWN] && !pin[qa] && !pin[qb] && (prevPin[qc] || pin[qd])) bitW = prevPin[qc] ^ 1;
            pin[qc] = bitW;
        };
        desc.push(chipStart(bit2Logic).inputPins(mrPin, loadPin, dataPin(2), UP, DOWN, qa, qb, qd, COUNT)
            .eventPins(COUNT).outputPin(qc).prevOutputPin(qc).outputDelayNs(25.0, 29.0));

        const bit3Logic: ChipLogic = (pin, prevPin, eventPin) => {
            let bitW = prevPin[qd];
            if (pin[mrPin]) bitW = 0;
            else if (!pin[loadPin]) bitW = pin[dataPin(3)];
            else if (posEdge(pin, eventPin, COUNT) && !pin[UP] && pin[qa] && prevPin[qd]) bitW = prevPin[qd] ^ 1;
            else if (posEdge(pin, eventPin, COUNT) && !pin[UP] && !(pin[qa] && prevPin[qd])) bitW = (pin[qa] & pin[qb] & pin[qc]) ^ prevPin[qd];
            else if (posEdge(pin, eventPin, COUNT) && !pin[DOWN]) bitW = ((pin[qa] | pin[qb] | pin[qc]) ^ prevPin[qd]) ^ 1;
            pin[qd] = bitW;
        };
        desc.push(chipStart(bit3Logic).inputPins(mrPin, loadPin, dataPin(3), UP, DOWN, qa, qb, qc, COUNT)
            .eventPins(COUNT).outputPin(qd).prevOutputPin(qd).outputDelayNs(25.0, 29.0));

        const tcuLogic: ChipLogic = (pin) => {
            pin[tcuPin] = (pin[qa] & pin[qd] & (pin[cpuPin] ^ 1)) ^ 1;
        };
        desc.push(chipStart(tcuLogic).inputPins(cpuPin, qa, qd).outputPin(tcuPin).outputDelayNs(17.0, 16.0));

        desc.push(this.bo([qa, qb, qc, qd], cpdPin, tcdPin));

        return { desc, pinMap };
    }

    /** BO (borrow, active low): OR of every Q bit plus CPD - identical between the 193 and 192
     * (see digitalSynthesisBCD()'s docstring) since "count is 0" doesn't depend on modulus. */
    private bo(allQ: number[], cpdPin: number, tcdPin: number): ChipDesc {
        const tcdLogic: ChipLogic = (pin) => {
            let anyOne = 0;
            for (const q of allQ) anyOne |= pin[q];
            pin[tcdPin] = anyOne | pin[cpdPin];
        };
        return chipStart(tcdLogic).inputPins(cpdPin, ...allQ).outputPin(tcdPin).outputDelayNs(16.0, 16.0);
    }

    getDumpType(): number { return 439; }
    getXmlDumpType(): string { return "ctr193"; }
}
