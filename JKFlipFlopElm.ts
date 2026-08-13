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
import { GroupPin, syncedValue } from "./digital/DigitalElm";
import type { Group, DigitalElmInstance } from "./digital/DigitalElm";

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

    initDigitalPins(): void {
        this.digitalPins = [new GroupPin(this, 0), new GroupPin(this, 1)];
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
        if ((sender === null || sender === clk) && clk.transitionedTo(edgeTarget, pin.lastChecked, now)) {
            const jv = syncedValue(j, now), kv = syncedValue(k, now);
            if (jv) q = kv ? !q : true;
            else if (kv) q = false;
        }
        if (this.hasReset() && syncedValue(this.inputs[3], now) !== this.invertReset())
            q = false;
        return [q, !q];
    }

    alwaysDemoteOn(sender: DigitalElmInstance): boolean {
        return this.hasReset() && sender === this.inputs[3];
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
        super.setChipEditValue(n, ei);
    }
}
