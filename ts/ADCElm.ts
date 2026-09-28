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

export class ADCElm extends ChipElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
        } else {
            super(xa, ya, xb, yb!, f!, st!);
        }
    }

    getChipName(): string { return "ADC"; }
    needsBits(): boolean { return true; }
    allowBus(): boolean { return true; }

    setupPins(): void {
        if (!this.bits)
            return;
        this.sizeX = 2;
        const bitsY = this.useBus() ? 1 : (this.bits > 2 ? this.bits : 2);
        this.sizeY = bitsY > 2 ? bitsY : 2;
        this.pins = new Array(this.getPostCount());
        this.makeBitPins(this.bits, 0, ChipElm.SIDE_E, 0, "D", true, false, false);
        this.pins[this.bits]     = new Pin(this, 0, ChipElm.SIDE_W, "In");
        this.pins[this.bits + 1] = new Pin(this, this.sizeY - 1, ChipElm.SIDE_W, "V+");
        this.allocNodes();
    }

    execute(): void {
        const imax = (1 << this.bits) - 1;
        // if we round, the half-flash doesn't work
        const val = imax * this.nodes[this.bits].v / this.nodes[this.bits + 1].v; // + .5;
        let ival = Math.trunc(val);
        ival = Math.min(imax, Math.max(0, ival));
        for (let i = 0; i !== this.bits; i++)
            this.pins[i].value = ((ival & (1 << i)) !== 0);
    }

    getVoltageSourceCount(): number { return this.bits; }
    getPostCount(): number { return this.bits + 2; }
    getDumpType(): number { return 167; }

    // there's already a V+ pin, how does that relate to high logic voltage?  figure out later
    isDigitalChip(): boolean { return false; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 2) {
                this.bits = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be >= 2");
        }
    }
}
