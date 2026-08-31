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
import { chipStart, POS_EDGE_PIN as posEdge, NEG_EDGE_PIN as negEdge } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

export class JKFlipFlopElm extends ChipElm implements Group {
    static readonly FLAG_RESET         = 2;
    static readonly FLAG_POSITIVE_EDGE = 4;
    static readonly FLAG_INVERT_RESET  = 8;

    hasReset():           boolean { return (this.flags & JKFlipFlopElm.FLAG_RESET        ) !== 0; }
    positiveEdgeTriggered(): boolean { return (this.flags & JKFlipFlopElm.FLAG_POSITIVE_EDGE) !== 0; }
    invertReset():        boolean { return (this.flags & JKFlipFlopElm.FLAG_INVERT_RESET ) !== 0; }

    // --- Group/GroupPin: digital fast-path scaffolding, dormant until a
    // future circuit-detection/wiring pass populates `inputs` and calls
    // initDigitalPins() - see DFlipFlopElm.ts for the same pattern.
    // inputs layout: [J, clk, K, R?] (R present iff hasReset()).
    inputs: DigitalElmInstance[] = [];
    digitalPins: GroupPin[] = []; // [0]=Q, [1]=/Q

    // Persists across re-stamps (unlike digitalPins itself, rebuilt from
    // scratch by initDigitalPins() below - see DFlipFlopElm.ts for why).
    digitalDebugPins = false;

    // Dedicated clock-edge watermark, one per pin - see CounterElm.ts's/
    // DFlipFlopElm.ts's identical field for the full explanation of why
    // sharing the generic pin.lastChecked with clock-edge detection is a
    // real bug (a same-tick J/K/reset-driven recompute silently swallows a
    // genuine clock edge landing on that exact tick, permanently).
    private lastClockChecked: number[] = [];

    initDigitalPins(): void {
        this.digitalPins = [new GroupPin(this, 0), new GroupPin(this, 1)];
        for (const p of this.digitalPins) p.digitalDebug = this.digitalDebugPins;
        this.lastClockChecked = new Array(this.digitalPins.length).fill(0);
    }

    /** Pure equivalent of execute() (see below): unlike DFlipFlopElm, JK's
     * /Q is always strictly !Q (reset only forces Q, never /Q
     * independently) - see execute()'s writeOutput(4, !pins[3].value)
     * running after any reset override has already applied. */
    evaluate(pin: GroupPin, sender: DigitalElmInstance | null): boolean[] {
        const j = this.inputs[0];
        const clk = this.inputs[1];
        const k = this.inputs[2];
        const now = pin.scheduler.currentTime;

        let q = syncedValue(this.digitalPins[0], now);
        const edgeTarget = this.positiveEdgeTriggered();
        // Use lastClockChecked, not pin.lastChecked - see its own docstring.
        const checkingClock = sender === null || sender === clk;
        const edgeTime = checkingClock
            ? clk.transitionedTo(edgeTarget, this.lastClockChecked?.[pin.index] ?? 0, now) : null;
        if (edgeTime !== null) {
            // Sample J/K as of the edge's own timestamp, not "now" - same
            // reasoning as DFlipFlopElm.evaluate()'s D sample.
            const jv = j.valueAt(edgeTime), kv = k.valueAt(edgeTime);
            if (jv) q = kv ? !q : true;
            else if (kv) q = false;
        }
        if (checkingClock) {
            if (!this.lastClockChecked) this.lastClockChecked = [];
            this.lastClockChecked[pin.index] = now;
        }
        if (this.hasReset() && syncedValue(this.inputs[3], now) !== this.invertReset())
            q = false;
        return [q, !q];
    }

    alwaysDemoteOn(sender: DigitalElmInstance): boolean {
        return this.hasReset() && sender === this.inputs[3];
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
     * prevOutputPin - see DFlipFlopElm.digitalSynthesis()'s identical convention) computes Q
     * exactly per evaluate() above (J/K transition on the configured edge, then an async reset
     * override), then a /Q buffer strictly inverts it - unlike DFlipFlopElm, JK's /Q has no
     * independent-forcing quirk (see evaluate()'s own `return [q, !q]`). */
    digitalSynthesis(): DigitalSynthesis {
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const Jpin = 1, clkPin = 2, Kpin = 3, Qpin = 4, notQpin = 5;
        const hasR = this.hasReset();
        const Rpin = hasR ? 6 : 0;
        const edgeIsPositive = this.positiveEdgeTriggered();
        const invertBit = this.invertReset() ? 1 : 0;

        const stateIn: number[] = [Jpin, clkPin, Kpin];
        if (hasR) stateIn.push(Rpin);

        const state: ChipLogic = (pin, prevPin, eventPin) => {
            let q = prevPin[Qpin];
            const edge = edgeIsPositive ? posEdge(pin, eventPin, clkPin) : negEdge(pin, eventPin, clkPin);
            if (edge) {
                if (pin[Jpin]) q = pin[Kpin] ? (q ^ 1) : 1;
                else if (pin[Kpin]) q = 0;
            }
            if (hasR && (pin[Rpin] ^ invertBit)) q = 0;
            pin[Qpin] = q;
        };

        const notQ: ChipLogic = (pin) => { pin[notQpin] = pin[Qpin] ^ 1; };

        const desc: ChipDesc[] = [
            chipStart(state).inputPins(...stateIn).eventPins(clkPin).outputPin(Qpin).prevOutputPin(Qpin)
                .outputDelayS(this.propagationDelay, this.propagationDelay),
            chipStart(notQ).inputPins(Qpin).outputPin(notQpin),
        ];
        return { desc, pinMap };
    }

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            this.pins[4].value = !this.pins[3].value;
        }
    }

    getChipName(): string { return "JK flip-flop"; }

    setupPins(): void {
        this.sizeX = 2;
        this.sizeY = 3;
        this.pins = new Array(this.getPostCount());
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "J");
        this.pins[1] = new Pin(this, 1, ChipElm.SIDE_W, "");
        this.pins[1].clock  = true;
        this.pins[1].bubble = !this.positiveEdgeTriggered();
        this.pins[2] = new Pin(this, 2, ChipElm.SIDE_W, "K");
        this.pins[3] = new Pin(this, 0, ChipElm.SIDE_E, "Q");
        this.pins[3].output = this.pins[3].state = true;
        this.pins[4] = new Pin(this, 2, ChipElm.SIDE_E, "Q");
        this.pins[4].output   = true;
        this.pins[4].lineOver = true;
        if (this.hasReset()) {
            this.pins[5] = new Pin(this, 1, ChipElm.SIDE_E, "R");
            this.pins[5].bubble = this.invertReset();
        }
    }

    getPostCount():        number { return 5 + (this.hasReset() ? 1 : 0); }
    getVoltageSourceCount(): number { return 2; }

    execute(): void {
        const transition = this.positiveEdgeTriggered()
            ?  this.pins[1].value && !this.lastClock
            : !this.pins[1].value &&  this.lastClock;

        if (transition) {
            let q = this.pins[3].value;
            if (this.pins[0].value) {
                if (this.pins[2].value) q = !q;
                else                    q = true;
            } else if (this.pins[2].value)
                q = false;
            this.writeOutput(3, q);
        }
        this.lastClock = this.pins[1].value;

        if (this.hasReset() && this.pins[5].value !== this.invertReset())
            this.writeOutput(3, false);

        this.writeOutput(4, !this.pins[3].value);
    }

    getDumpType(): number { return 156; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return EditInfo.createCheckbox("Reset Pin", this.hasReset());
        if (n === 1)
            return EditInfo.createCheckbox("Positive Edge Triggered", this.positiveEdgeTriggered());
        if (n === 2)
            return EditInfo.createCheckbox("Invert Reset", this.invertReset());
        if (n === 3)
            return EditInfo.createCheckbox("Digital Debug", this.digitalDebugPins);
        return super.getChipEditInfo(n);
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.flags = ei.changeFlag(this.flags, JKFlipFlopElm.FLAG_RESET);
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        }
        if (n === 1) {
            this.flags = ei.changeFlag(this.flags, JKFlipFlopElm.FLAG_POSITIVE_EDGE);
            this.pins[1].bubble = !this.positiveEdgeTriggered();
        }
        if (n === 2) {
            this.flags = ei.changeFlag(this.flags, JKFlipFlopElm.FLAG_INVERT_RESET);
            this.setupPins();
            this.setPoints();
        }
        if (n === 3) {
            this.digitalDebugPins = ei.checkbox!.getState();
            for (const p of this.digitalPins) p.digitalDebug = this.digitalDebugPins;
        }
        super.setChipEditValue(n, ei);
    }
}
