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
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";

export class BusSplitterElm extends ChipElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
        }
    }
    getChipName(): string { return "Bus Splitter"; }
    needsBits(): boolean { return true; }

    setupPins(): void {
        this.sizeX = 2;
        this.sizeY = this.bits;
        this.currents = new Array(this.bits).fill(0);
        this.pins = new Array(this.getPostCount());

        // bus side: all pins at same position
        for (let i = 0; i !== this.bits; i++) {
            this.pins[i] = new Pin(this, 0, ChipElm.SIDE_W, "Bus");
            this.pins[i].busWidth = this.bits;
            this.pins[i].busZ = i;
        }

        // individual side: one pin per bit
        for (let i = 0; i !== this.bits; i++) {
            this.pins[i + this.bits] = new Pin(this, this.bits - 1 - i, ChipElm.SIDE_E, "" + i);
        }
    }

    currents: number[] = [];

    getPostCount(): number { return this.bits * 2; }
    getBusWidth(): number { return this.bits; }
    getVoltageSourceCount(): number { return 0; }

    getConnection(n1: number, n2: number): boolean {
        // bus pin i connects to individual pin i+bits
        return Math.abs(n1 - n2) === this.bits;
    }

    isWireEquivalent(): boolean { return true; }
    isRemovableWire(): boolean { return true; }

    getConnectedPost(n?: number): Point {
        // bus bit n connects to individual pin n+bits
        return this.getPost((n ?? 0) + this.bits);
    }

    getCurrentIntoNode(n: number): number {
        if (n < this.bits)
            return -this.currents[n];
        return this.currents[n - this.bits];
    }

    setWireCurrent(bit: number, c: number): void {
        this.currents[bit] = c;
        this.pins[bit + this.bits].current = c;
        // update total bus current on pin 0 (the only bus-side pin that gets drawn)
        let total = 0;
        for (let i = 0; i < this.bits; i++)
            total += this.currents[i];
        this.pins[0].current = -total;
    }

    getDumpType(): number { return 433; }
    getXmlDumpType(): string { return "bs"; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        return null;
    }
    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 2) {
                this.bits = Math.floor(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be >= 2");
        }
    }
}
