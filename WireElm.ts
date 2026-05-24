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

import { CircuitElm } from "./CircuitElm";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";

export class WireElm extends CircuitElm {
    busWidth: number = 1;
    currents: number[] | null = null;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
        } else {
            super(xa, ya, xb, yb!, f!);
        }
    }
    static readonly FLAG_SHOWCURRENT = 1;
    static readonly FLAG_SHOWVOLTAGE = 2;
    static readonly FLAG_SHOW_BUS_VALUE = 4;
    static readonly FLAG_SHOW_BUS_VALUE_HEX = 8;

    getPostCount(): number { return (this.busWidth ?? 1) * 2; }
    getBusWidth(): number { return this.busWidth; }

    getPost(n: number): Point {
        if (this.busWidth == 1)
            return (n == 0) ? this.point1 : this.point2;
        if (n < this.busWidth)
            return new Point(this.point1.x, this.point1.y, n);
        return new Point(this.point2.x, this.point2.y, n - this.busWidth);
    }

    getPostWidth(n: number): number { return this.busWidth; }

    getConnection(n1: number, n2: number): boolean {
        if (this.busWidth == 1)
            return true;
        // only connect matching bits: post n1 connects to n1 +/- busWidth
        return Math.abs(n1 - n2) == this.busWidth;
    }

    getConnectedPost(n?: number): Point {
        if (n === undefined)
            return this.point2;
        if (this.busWidth == 1)
            return (n == 0) ? this.point2 : this.point1;
        if (n < this.busWidth)
            return new Point(this.point2.x, this.point2.y, n);
        return new Point(this.point1.x, this.point1.y, n - this.busWidth);
    }

    getBusValue(): number {
        let value = 0;
        for (let i = 0; i < this.busWidth; i++)
            if (this.volts[i] > 2.5)
                value |= 1 << i;
        return value;
    }

    draw(g: Graphics): void {
        if (this.currents != null) {
            this.current = 0;
            for (let i = 0; i < this.currents.length; i++)
                this.current += this.currents[i];
        }
        this.setVoltageColor(g, this.volts[0]);
        CircuitElm.drawThickLine(g, this.point1, this.point2, (this.busWidth > 1) ? 5 : 3);
        this.doDots(g);
        this.setBbox(this.point1, this.point2, 3);
        let s = "";
        if (this.busWidth > 1 && (this.mustShowBusValue() || this.mustShowBusValueHex())) {
            const value = this.getBusValue();
            if (this.mustShowBusValue())
                s = ""+value;
            if (this.mustShowBusValueHex())
                s = (s.length > 0 ? s + " " : "") + "0x" + value.toString(16).toUpperCase();
        } else if (this.busWidth == 1) {
            if (this.mustShowCurrent())
                s = CircuitElm.getShortUnitText(Math.abs(this.getCurrent()), "A");
            if (this.mustShowVoltage())
                s = (s.length > 0 ? s + " " : "") + CircuitElm.getShortUnitText(this.volts[0], "V");
        }
        this.drawValues(g, s, 4);
        this.drawPosts(g);
    }
    stamp(): void {
//	    sim.stampVoltageSource(nodes[0], nodes[1], voltSource, 0);
    }
    mustShowCurrent(): boolean {
        return (this.flags & WireElm.FLAG_SHOWCURRENT) != 0;
    }
    mustShowVoltage(): boolean {
        return (this.flags & WireElm.FLAG_SHOWVOLTAGE) != 0;
    }
    mustShowBusValue(): boolean {
        return (this.flags & WireElm.FLAG_SHOW_BUS_VALUE) != 0;
    }
    mustShowBusValueHex(): boolean {
        return (this.flags & WireElm.FLAG_SHOW_BUS_VALUE_HEX) != 0;
    }
//	int getVoltageSourceCount() { return 1; }
    getInfo(arr: string[]): void {
        arr[0] = (this.busWidth > 1) ? "bus wire (" + this.busWidth + ")" : "wire";
        if (this.busWidth > 1) {
            const value = this.getBusValue();
            arr[1] = "value = " + value;
            arr[2] = "hex = 0x" + value.toString(16).toUpperCase();
        } else {
            arr[1] = "I = " + CircuitElm.getCurrentDText(this.getCurrent());
            arr[2] = "V = " + CircuitElm.getVoltageText(this.volts[0]);
        }
    }
    getDumpType(): number { return 'w'.charCodeAt(0); }
    getPower(): number { return 0; }
    getVoltageDiff(): number { return this.volts[0]; }
    isWireEquivalent(): boolean { return true; }
    isRemovableWire(): boolean { return true; }
    isWireElm(): boolean { return true; }

    setWireCurrent(bit: number, c: number): void {
        if (this.currents != null)
            this.currents[bit] = c;
        else
            this.current = c;
    }

    getCurrentIntoNode(n: number): number {
        if (this.currents != null) {
            if (n < this.busWidth)
                return -this.currents[n];
            return this.currents[n - this.busWidth];
        }
        if (n == 0)
            return -this.current;
        return this.current;
    }
    getEditInfo(n: number): EditInfo | null {
        if (n == 0) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Show Current", this.mustShowCurrent());
            return ei;
        }
        if (n == 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Show Voltage", this.mustShowVoltage());
            return ei;
        }
        if (n == 2) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Show Bus Value", this.mustShowBusValue());
            return ei;
        }
        if (n == 3) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Show Bus Value (Hex)", this.mustShowBusValueHex());
            return ei;
        }
        return null;
    }
    setEditValue(n: number, ei: EditInfo): void {
        if (n == 0) {
            if (ei.checkbox.getState())
                this.flags |= WireElm.FLAG_SHOWCURRENT;
            else
                this.flags &= ~WireElm.FLAG_SHOWCURRENT;
        }
        if (n == 1) {
            if (ei.checkbox.getState())
                this.flags |= WireElm.FLAG_SHOWVOLTAGE;
            else
                this.flags &= ~WireElm.FLAG_SHOWVOLTAGE;
        }
        if (n == 2)
            this.flags = ei.changeFlag(this.flags, WireElm.FLAG_SHOW_BUS_VALUE);
        if (n == 3)
            this.flags = ei.changeFlag(this.flags, WireElm.FLAG_SHOW_BUS_VALUE_HEX);
    }
    getShortcut(): number { return 'w'.charCodeAt(0); }

    getMouseDistance(gx: number, gy: number): number {
        const thresh = 10;
        const d2 = this.lineDistanceSq(this.x, this.y, this.x2, this.y2, gx, gy);
        if (d2 <= thresh*thresh)
            return d2;
        return -1;
    }
}
