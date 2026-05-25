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
import { Graphics } from "./Graphics";

// concrete subclass of ChipElm that can be used by other elements (like CustomCompositeElm) to draw chips.
// CustomCompositeElm can't be a subclass of both ChipElm and CompositeElm.
export class CustomCompositeChipElm extends ChipElm {
    label: string | null = null;

    constructor(xx: number, yy: number) {
        super(xx, yy);
        this.setSize(2);
    }

    needsBits(): boolean { return false; }
    setupPins(): void {}
    getVoltageSourceCount(): number { return 0; }

    setPins(p: Pin[]): void {
        this.pins = p;
    }

    allocPins(n: number): void {
        this.pins = new Array(n);
        this.volts = new Array(n).fill(0);
    }

    setPin(n: number, p: number, s: number, t: string): void {
        this.pins[n] = new Pin(this, p, s, t);
        this.pins[n].fixName();
    }

    setLabel(text: string | null): void {
        this.label = text;
    }

    drawLabel(g: Graphics, x: number, y: number): void {
        if (this.label === null) return;
        g.save();
        g.context.textBaseline = "middle";
        g.context.textAlign = "center";
        g.drawString(this.label, x, y);
        g.restore();
    }

    getPostCount(): number { return this.pins == null ? 1 : this.pins.length; }
}
