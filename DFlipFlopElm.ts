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
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { GroupPin, syncedValue } from "./digital/DigitalElm";
import type { Group, DigitalElmInstance } from "./digital/DigitalElm";
import { digitalStateText, appendInfoLine } from "./digital/CircuitWiring";
import { chipStart, POS_EDGE_PIN as posEdge } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

export class DFlipFlopElm extends ChipElm implements Group {
    static readonly FLAG_RESET            = 2;
    static readonly FLAG_SET              = 4;
    static readonly FLAG_INVERT_SET_RESET = 8;

    hasReset():       boolean { return (this.flags & DFlipFlopElm.FLAG_RESET) !== 0 || this.hasSet(); }
    hasSet():         boolean { return (this.flags & DFlipFlopElm.FLAG_SET) !== 0; }
    invertSetReset(): boolean { return (this.flags & DFlipFlopElm.FLAG_INVERT_SET_RESET) !== 0; }

    // --- Group/GroupPin: digital fast-path scaffolding, dormant until a
    // future circuit-detection/wiring pass populates `inputs` and calls
    // initDigitalPins() - see doc.txt's Group/GroupPin design and this
    // repo's GateElm.evaluate() for the same "exists but unused" pattern.
    // inputs layout: [D, clk, R?, S?] (R present iff hasReset(), S iff hasSet()).
    inputs: DigitalElmInstance[] = [];
    digitalPins: GroupPin[] = []; // [0]=Q, [1]=/Q

    // Persists across re-stamps (unlike digitalPins itself, which
    // initDigitalPins() below always rebuilds from scratch as brand new
    // GroupPin instances - see CircuitWiring.initDigitalElements()'s
    // docstring) since it's a user debugging preference, not scheduler-
    // cycle state.
    digitalDebugPins = false;

    // Dedicated clock-edge watermark, one per pin (Q, /Q) - NOT the same
    // thing as each pin's own generic pin.lastChecked. See CounterElm.ts's
    // identical field for the full explanation: commit()'s "passive" branch
    // (digital/DigitalElm.ts) advances pin.lastChecked to `now` on every
    // recompute regardless of what triggered it - including a D-only change
    // (D changing alone doesn't move Q, but the generic engine still wakes
    // this element to re-check, per inputUpdated()), which evaluate() below
    // does NOT treat as a clock check. Sharing the generic watermark with
    // clock-edge detection silently swallows a real clock edge landing on
    // that exact same tick - transitionedTo()'s window is exclusive of its
    // lower bound, so the very next clock-triggered check can never see an
    // edge that occurred AT the tick lastChecked was stamped with. Rebuilt
    // fresh by initDigitalPins() below, not persisted across re-stamps.
    private lastClockChecked: number[] = [];

    initDigitalPins(): void {
        this.digitalPins = [new GroupPin(this, 0), new GroupPin(this, 1)];
        for (const p of this.digitalPins) p.digitalDebug = this.digitalDebugPins;
        this.lastClockChecked = new Array(this.digitalPins.length).fill(0);
    }

    /** Pure equivalent of execute() (see below) - computes [Q, /Q] without
     * mutating anything, so the digital scheduler can call it speculatively.
     * Mirrors execute()'s exact semantics, including the DFlipFlopElm-
     * specific quirk that Q and /Q are independently forced during set/reset
     * (not simply complementary) - see execute()'s own body. */
    evaluate(pin: GroupPin, sender: DigitalElmInstance | null): boolean[] {
        const d = this.inputs[0];
        const clk = this.inputs[1];
        const now = pin.scheduler.currentTime;
        let idx = 2;
        const r = this.hasReset() ? this.inputs[idx++] : null;
        const s = this.hasSet() ? this.inputs[idx] : null;
        const isSet = s !== null && s.currentValue() !== this.invertSetReset();
        const isReset = r !== null && r.currentValue() !== this.invertSetReset();

        if (isSet || isReset)
            return [isSet, isReset];

        let q = syncedValue(this.digitalPins[0], now);
        // Use lastClockChecked, not pin.lastChecked - see its own docstring.
        const checkingClock = sender === null || sender === clk;
        const edgeTime = checkingClock
            ? clk.transitionedTo(true, this.lastClockChecked?.[pin.index] ?? 0, now) : null;
        if (edgeTime !== null)
            // Sample D as of the edge's own timestamp, not "now" - if we're
            // only catching up to this edge late (e.g. after demoting), D
            // may have changed again since, and reading its current value
            // would sample whatever it became by then, not what it actually
            // was at the clock edge. See CounterElm.evaluate()'s identical
            // fix for the concrete failure mode this caused.
            q = d.valueAt(edgeTime);
        if (checkingClock) {
            if (!this.lastClockChecked) this.lastClockChecked = [];
            this.lastClockChecked[pin.index] = now;
        }
        return [q, !q];
    }

    /** Q and /Q are correlated through set/reset (see evaluate()): a set/
     * reset line changing must always demote both pins rather than risk one
     * slipping through on a lucky value match - same reasoning as
     * GroupPin.prepare()'s own docstring for a shared reset line. */
    alwaysDemoteOn(sender: DigitalElmInstance): boolean {
        let idx = 2;
        if (this.hasReset() && sender === this.inputs[idx++]) return true;
        if (this.hasSet() && sender === this.inputs[idx]) return true;
        return false;
    }

    /** Same propagation-delay modeling as GateElm.propagationDelayTicks() (seconds ->
     * ticks, floored at 1 - see the Digital mixin's own propagationDelayTicks()
     * docstring), applied here via the Group hook since this chip's pins
     * are individually-tracked GroupPins rather than the chip itself. */
    propagationDelay: number = 0;
    propagationDelayTicks(pin: GroupPin): number {
        const step = CircuitElm.sim?.maxTimeStep;
        if (!step) return 1;
        return Math.max(1, Math.round(this.propagationDelay / step));
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        appendInfoLine(arr, "opt Q: " + digitalStateText(this.digitalPins[0]));
        appendInfoLine(arr, "opt /Q: " + digitalStateText(this.digitalPins[1]));
    }

    /** Phase 3 (see noble-stirring-rabin.md): a state cell (own real Q pin doubles as its
     * prevOutputPin, per-pin post index -> pin number is postIndex+1 throughout, matching
     * GateElm.digitalSynthesis()'s convention) computes Q exactly per evaluate() above - captures
     * D on the configured clock edge, or forces to isSet/isReset on that same quirky
     * independent-per-pin basis - then a /Q buffer cell reads it back, re-deriving the same
     * isSet/isReset override rather than simply inverting Q (see evaluate()'s own docstring for
     * why DFlipFlopElm's /Q isn't strictly !Q during a set/reset collision). */
    digitalSynthesis(): DigitalSynthesis {
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const Dpin = 1, Qpin = 2, notQpin = 3, clkPin = 4;
        const hasR = this.hasReset(), hasS = this.hasSet();
        const Rpin = hasR ? 5 : 0;
        const Spin = hasS ? 6 : 0;
        const invertBit = this.invertSetReset() ? 1 : 0;

        const stateIn: number[] = [Dpin, clkPin];
        if (hasR) stateIn.push(Rpin);
        if (hasS) stateIn.push(Spin);

        const state: ChipLogic = (pin, prevPin, eventPin) => {
            const isSet = hasS ? (pin[Spin] ^ invertBit) : 0;
            const isReset = hasR ? (pin[Rpin] ^ invertBit) : 0;
            if (isSet || isReset) pin[Qpin] = isSet;
            else if (posEdge(pin, eventPin, clkPin)) pin[Qpin] = pin[Dpin];
            else pin[Qpin] = prevPin[Qpin];
        };

        const notQIn: number[] = [Qpin];
        if (hasR) notQIn.push(Rpin);
        if (hasS) notQIn.push(Spin);
        const notQ: ChipLogic = (pin) => {
            const isSet = hasS ? (pin[Spin] ^ invertBit) : 0;
            const isReset = hasR ? (pin[Rpin] ^ invertBit) : 0;
            pin[notQpin] = (isSet || isReset) ? isReset : (pin[Qpin] ^ 1);
        };

        const desc: ChipDesc[] = [
            chipStart(state).inputPins(...stateIn).eventPins(clkPin).outputPin(Qpin).prevOutputPin(Qpin)
                .outputDelayS(this.propagationDelay, this.propagationDelay),
            chipStart(notQ).inputPins(...notQIn).outputPin(notQpin),
        ];
        return { desc, pinMap };
    }

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.pins[2].value = !this.pins[1].value;
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            this.pins[2].value = !this.pins[1].value;
        }
    }

    getChipName(): string { return "D flip-flop"; }

    setupPins(): void {
        this.sizeX = 2;
        this.sizeY = 3;
        this.pins = new Array(this.getPostCount());
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "D");
        this.pins[1] = new Pin(this, 0, ChipElm.SIDE_E, "Q");
        this.pins[1].output = this.pins[1].state = true;
        this.pins[2] = new Pin(this, this.hasSet() ? 1 : 2, ChipElm.SIDE_E, "Q");
        this.pins[2].output = true;
        this.pins[2].lineOver = true;
        this.pins[3] = new Pin(this, 1, ChipElm.SIDE_W, "");
        this.pins[3].clock = true;
        if (!this.hasSet()) {
            if (this.hasReset()) {
                this.pins[4] = new Pin(this, 2, ChipElm.SIDE_W, "R");
                this.pins[4].bubble = this.invertSetReset();
            }
        } else {
            this.pins[5] = new Pin(this, 2, ChipElm.SIDE_W, "S");
            this.pins[4] = new Pin(this, 2, ChipElm.SIDE_E, "R");
            this.pins[4].bubble = this.pins[5].bubble = this.invertSetReset();
        }
    }

    getPostCount(): number {
        return 4 + (this.hasReset() ? 1 : 0) + (this.hasSet() ? 1 : 0);
    }

    getVoltageSourceCount(): number { return 2; }

    execute(): void {
        let isSet   = false;
        let isReset = false;

        if (this.hasSet()   && this.pins[5].value !== this.invertSetReset()) isSet   = true;
        if (this.hasReset() && this.pins[4].value !== this.invertSetReset()) isReset = true;

        if (isSet || isReset) {
            this.writeOutput(1, false);
            this.writeOutput(2, false);
            if (isSet)   this.writeOutput(1, true);
            if (isReset) this.writeOutput(2, true);
        } else {
            if (this.pins[3].value && !this.lastClock)
                this.writeOutput(1, this.pins[0].value);
            this.writeOutput(2, !this.pins[1].value);
        }

        this.lastClock = this.pins[3].value;
    }

    getDumpType(): number { return 155; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Reset Pin", this.hasReset());
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Set Pin", this.hasSet());
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Invert Set/Reset", this.invertSetReset());
            return ei;
        }
        if (n === 3) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Digital Debug", this.digitalDebugPins);
            return ei;
        }
        return super.getChipEditInfo(n);
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.checkbox!.getState())
                this.flags |= DFlipFlopElm.FLAG_RESET;
            else
                this.flags &= ~DFlipFlopElm.FLAG_RESET | DFlipFlopElm.FLAG_SET;
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        }
        if (n === 1) {
            if (ei.checkbox!.getState())
                this.flags |= DFlipFlopElm.FLAG_SET;
            else
                this.flags &= ~DFlipFlopElm.FLAG_SET;
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        }
        if (n === 2) {
            this.flags = ei.changeFlag(this.flags, DFlipFlopElm.FLAG_INVERT_SET_RESET);
            this.setupPins();
            this.setPoints();
        }
        if (n === 3) {
            this.digitalDebugPins = ei.checkbox!.getState();
            // Apply immediately (not just on the next stamp's
            // initDigitalPins()) since digitalPins already exist if a
            // stamp has already run.
            for (const p of this.digitalPins) p.digitalDebug = this.digitalDebugPins;
        }
        super.setChipEditValue(n, ei);
    }
}
