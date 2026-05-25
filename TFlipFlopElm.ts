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

export class TFlipFlopElm extends ChipElm {
    readonly FLAG_RESET = 2;
    readonly FLAG_SET = 4;
    hasReset(): boolean { return (this.flags & this.FLAG_RESET) !== 0 || this.hasSet(); }
    hasSet(): boolean { return (this.flags & this.FLAG_SET) !== 0; }
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
            this.pins[2].value = !this.pins[1].value;
        }
    }
    getChipName(): string { return "T flip-flop"; }
    setupPins(): void {
        this.sizeX = 2;
        this.sizeY = 3;
        this.pins = new Array(this.getPostCount());
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "T");
        this.pins[1] = new Pin(this, 0, ChipElm.SIDE_E, "Q");
        this.pins[1].output = this.pins[1].state = true;
        this.pins[2] = new Pin(this, this.hasSet() ? 1 : 2, ChipElm.SIDE_E, "Q");
        this.pins[2].output = true;
        this.pins[2].lineOver = true;
        this.pins[3] = new Pin(this, 1, ChipElm.SIDE_W, "");
        this.pins[3].clock = true;
        if (!this.hasSet()) {
            if (this.hasReset())
                this.pins[4] = new Pin(this, 2, ChipElm.SIDE_W, "R");
        } else {
            this.pins[5] = new Pin(this, 2, ChipElm.SIDE_W, "S");
            this.pins[4] = new Pin(this, 2, ChipElm.SIDE_E, "R");
        }
    }
    getPostCount(): number {
        return 4 + (this.hasReset() ? 1 : 0) + (this.hasSet() ? 1 : 0);
    }
    getVoltageSourceCount(): number { return 2; }
    reset(): void {
        super.reset();
        this.volts[2] = this.highVoltage;
        this.pins[2].value = true;
    }
    execute(): void {
        if (this.pins[3].value && !this.lastClock) {
            if (this.pins[0].value) // if T = 1
            {
                this.pins[1].value = !this.pins[1].value;
            }
            // else no change
        }
        if (this.hasSet() && this.pins[5].value) {
            this.pins[1].value = true;
        }
        if (this.hasReset() && this.pins[4].value) {
            this.pins[1].value = false;
        }
        this.pins[2].value = !this.pins[1].value;
        this.lastClock = this.pins[3].value;
    }
    getDumpType(): number { return 193; }
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
        return super.getChipEditInfo(n);
    }
    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.checkbox!.getState())
                this.flags |= this.FLAG_RESET;
            else
                this.flags &= ~this.FLAG_RESET | this.FLAG_SET;
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        }
        if (n === 1) {
            if (ei.checkbox!.getState())
                this.flags |= this.FLAG_SET;
            else
                this.flags &= ~this.FLAG_SET;
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        }
        super.setChipEditValue(n, ei);
    }
}
