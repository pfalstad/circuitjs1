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

export class HalfAdderElm extends ChipElm {
    hasReset(): boolean { return false; }
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
        }
    }
    getChipName(): string { return "Half Adder"; }

    setupPins(): void {
        this.sizeX = 2;
        this.sizeY = 2;
        this.pins = new Array(this.getPostCount());

        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_E, "S");
        this.pins[0].output = true;
        this.pins[1] = new Pin(this, 1, ChipElm.SIDE_E, "C");
        this.pins[1].output = true;
        this.pins[2] = new Pin(this, 0, ChipElm.SIDE_W, "A");
        this.pins[3] = new Pin(this, 1, ChipElm.SIDE_W, "B");
    }
    getPostCount(): number {
        return 4;
    }
    getVoltageSourceCount(): number { return 2; }

    execute(): void {
        this.pins[0].value = this.pins[2].value !== this.pins[3].value;
        this.pins[1].value = this.pins[2].value && this.pins[3].value;
    }
    getDumpType(): number { return 195; }
}
