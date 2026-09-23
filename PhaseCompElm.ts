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
import { CircuitNode } from "./CircuitNode";
import { StringTokenizer } from "./StringTokenizer";

export class PhaseCompElm extends ChipElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
        } else {
            super(xa, ya, xb, yb!, f!, st!);
        }
    }

    getChipName(): string { return "phase comparator"; }

    setupPins(): void {
        this.sizeX = 2;
        this.sizeY = 2;
        this.pins = new Array(3);
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "I1");
        this.pins[1] = new Pin(this, 1, ChipElm.SIDE_W, "I2");
        this.pins[2] = new Pin(this, 0, ChipElm.SIDE_E, "O");
        this.pins[2].output = true;
    }

    nonLinear(): boolean { return true; }

    stamp(): void {
        CircuitElm.sim.stampNonLinearVS(this.pins[2].voltSource!);
        CircuitElm.sim.stampNonLinear(CircuitNode.ground);
        CircuitElm.sim.stampNonLinear(this.nodes[2]);
    }

    ff1: boolean = false;
    ff2: boolean = false;

    startIteration(): void {
        const v1 = this.nodes[0].v > this.getThreshold();
        const v2 = this.nodes[1].v > this.getThreshold();
        if (v1 && !this.pins[0].value)
            this.ff1 = true;
        if (v2 && !this.pins[1].value)
            this.ff2 = true;
        if (this.ff1 && this.ff2)
            this.ff1 = this.ff2 = false;
        this.pins[0].value = v1;
        this.pins[1].value = v2;
    }

    doStep(): void {
        const out = (this.ff1) ? this.highVoltage : (this.ff2) ? 0 : -1;
        if (out !== -1)
            CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[2], this.pins[2].voltSource, out);
        else {
            // tie current through output pin to 0
            CircuitElm.sim.stampMatrixVV(this.pins[2].voltSource!, this.pins[2].voltSource!, 1);
        }
    }

    getPostCount(): number { return 3; }
    getVoltageSourceCount(): number { return 1; }
    getDumpType(): number { return 161; }
    getMatrixConnection(n1: number, n2: number): boolean { return true; }
}
