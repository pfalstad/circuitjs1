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
export class RingCounterElm extends ChipElm {
    static readonly FLAG_CLOCK_INHIBIT = 2;
    static readonly FLAG_RESET_HIGH    = 4;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.flags |= RingCounterElm.FLAG_CLOCK_INHIBIT;
            this.setupPins();
        } else {
            super(xa, ya, xb, yb!, f!, st!);
        }
    }

    getChipName(): string { return "ring counter"; }
    needsBits(): boolean { return true; }
    defaultBitCount(): number { return 10; }
    hasClockInhibit(): boolean { return (this.flags & RingCounterElm.FLAG_CLOCK_INHIBIT) !== 0 && this.bits >= 3; }
    hasInvertReset(): boolean { return (this.flags & RingCounterElm.FLAG_RESET_HIGH) === 0; }

    declare clockInhibit: number;

    setupPins(): void {
        if (!this.bits)
            return;
        this.sizeX = this.bits > 2 ? this.bits : 2;
        this.sizeY = 2;
        this.pins = new Array(this.getPostCount());
        this.pins[0] = new Pin(this, 1, ChipElm.SIDE_W, "");
        this.pins[0].clock = true;
        this.pins[1] = new Pin(this, this.sizeX - 1, ChipElm.SIDE_S, "R");
        this.pins[1].lineOver = this.hasInvertReset();
        for (let i = 0; i !== this.bits; i++) {
            const ii = i + 2;
            this.pins[ii] = new Pin(this, i, ChipElm.SIDE_N, "Q" + i);
            this.pins[ii].output = this.pins[ii].state = true;
        }
        if (this.hasClockInhibit()) {
            this.clockInhibit = this.pins.length - 1;
            this.pins[this.clockInhibit] = new Pin(this, 1, ChipElm.SIDE_S, "CE");
            this.pins[this.clockInhibit].lineOver = true;
        } else
            this.clockInhibit = -1;
        this.allocNodes();
    }

    getPostCount(): number { return this.hasClockInhibit() ? this.bits + 3 : this.bits + 2; }
    getVoltageSourceCount(): number { return this.bits; }

    execute(): void {
        let i: number;

        let running = true;
        if (this.hasClockInhibit() && this.pins[this.clockInhibit].value)
            running = false;

        // find which output is high
        for (i = 0; i !== this.bits; i++)
            if (this.pins[i + 2].value)
                break;

        if (this.pins[0].value && !this.lastClock && running) {
            if (i < this.bits)
                this.pins[i++ + 2].value = false;
            i %= this.bits;
            this.pins[i + 2].value = true;
        }

        // reset if requested, or if all outputs are low
        if (this.pins[1].value !== this.hasInvertReset() || i === this.bits) {
            for (i = 1; i !== this.bits; i++)
                this.pins[i + 2].value = false;
            this.pins[2].value = true;
        }
        this.lastClock = this.pins[0].value;
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Invert reset pin", this.hasInvertReset());
            return ei;
        }
        if (n === 1)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.checkbox!.getState())
                this.flags &= ~RingCounterElm.FLAG_RESET_HIGH;
            else
                this.flags |= RingCounterElm.FLAG_RESET_HIGH;
            this.setupPins();
            this.setPoints();
            return;
        }
        if (n === 1) {
            if (ei.value >= 2) {
                this.bits = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be >= 2");
        }
    }

    getDumpType(): number { return 163; }
}
