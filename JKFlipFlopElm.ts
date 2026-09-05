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
import { appendInfoLine, digitalStateTextForOutput } from "./digital/DigitalGraphBuilder";
import { chipStart, POS_EDGE_PIN as posEdge, NEG_EDGE_PIN as negEdge } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

export class JKFlipFlopElm extends ChipElm {
    static readonly FLAG_RESET         = 2;
    static readonly FLAG_POSITIVE_EDGE = 4;
    static readonly FLAG_INVERT_RESET  = 8;

    hasReset():           boolean { return (this.flags & JKFlipFlopElm.FLAG_RESET        ) !== 0; }
    positiveEdgeTriggered(): boolean { return (this.flags & JKFlipFlopElm.FLAG_POSITIVE_EDGE) !== 0; }
    invertReset():        boolean { return (this.flags & JKFlipFlopElm.FLAG_INVERT_RESET ) !== 0; }

    // matches dice-ts's 74107 master-stage delay (~/Projects/dice-ts/src/chips/74107.ts)
    propagationDelay: number = 15.0e-9;

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        appendInfoLine(arr, "opt Q: " + digitalStateTextForOutput(this, 0));
        appendInfoLine(arr, "opt /Q: " + digitalStateTextForOutput(this, 1));
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
