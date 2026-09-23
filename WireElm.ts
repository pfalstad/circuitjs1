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
import { CirSim } from "./CirSim";
import { LabeledNodeElm } from "./LabeledNodeElm";

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
            if (this.nodes[i].v > 2.5)
                value |= 1 << i;
        return value;
    }

    draw(g: Graphics): void {
        if (this.currents != null) {
            this.current = 0;
            for (let i = 0; i < this.currents.length; i++)
                this.current += this.currents[i];
        }
        this.setVoltageColor(g, this.nodes[0].v);
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
                s = (s.length > 0 ? s + " " : "") + CircuitElm.getShortUnitText(this.nodes[0].v, "V");
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
            let label = LabeledNodeElm.getLabelForNode(this.getNode(0));
            if (label != null) {
                for (let i = 1; i < this.busWidth; i++) {
                    if (label !== LabeledNodeElm.getLabelForNode(this.getNode(i))) {
                        label = null;
                        break;
                    }
                }
            }
            if (label != null)
                arr[3] = label;
        } else {
            arr[1] = "I = " + CircuitElm.getCurrentDText(this.getCurrent());
            arr[2] = "V = " + CircuitElm.getVoltageText(this.nodes[0].v);
            const label = LabeledNodeElm.getLabelForNode(this.getNode(0));
            if (label != null)
                arr[3] = label;
        }
    }
    getDumpType(): number { return 'w'.charCodeAt(0); }
    getPower(): number { return 0; }
    getVoltageDiff(): number { return this.nodes[0].v; }
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

    static pointOnWireInteriorForPoints(px: number, py: number, pts: Point[]): boolean {
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            if (CircuitElm.pointOnSegmentInterior(a.x, a.y, b.x, b.y, px, py)) return true;
        }
        // an interior bend vertex (not the wire's overall endpoints) is also a valid split point,
        // even though it's not "interior" to either of its adjacent segments
        for (let i = 1; i < pts.length - 1; i++) {
            const p = pts[i];
            if (p.x === px && p.y === py) return true;
        }
        return false;
    }

    pointOnWireInterior(px: number, py: number): boolean {
        const pts: Point[] = [this.point1, this.point2];
        return WireElm.pointOnWireInteriorForPoints(px, py, pts);
    }

    split(px: number, py: number): WireElm {
        const newWire = new WireElm(px, py);
        newWire.drag(this.x2, this.y2);
        this.drag(px, py);
        return newWire;
    }

    // True if some other 2-terminal element already connects (ax,ay) directly to
    // (bx,by). Used to avoid laying a redundant parallel wire segment on top of
    // an existing colinear element, which would create an electrical loop.
    hasDirectConnection(ax: number, ay: number, bx: number, by: number): boolean {
        for (const ce of CirSim.theApp.elmList) {
            if (ce === this || ce.getPostCount() !== 2)
                continue;
            const p0 = ce.getPost(0)!;
            const p1 = ce.getPost(1)!;
            if ((p0.x === ax && p0.y === ay && p1.x === bx && p1.y === by) ||
                (p0.x === bx && p0.y === by && p1.x === ax && p1.y === ay))
                return true;
        }
        return false;
    }

    // After a plain wire is newly drawn, split it at any point where another
    // element's post lies in its interior, so it connects there instead of just
    // crossing over it. (RoutedWireElm overrides this to do nothing, since it
    // routes around such posts instead of through them.) Any sub-segment that
    // would duplicate an existing colinear element (both endpoints of that
    // element lying on the new wire) is dropped instead of added, since adding
    // it would just create a parallel loop.
    draggingDone(): void {
        // postDrawList holds the points (as of the last analysis, i.e. before this wire)
        // where a dot is drawn: dead ends and real junctions, but not plain pass-through
        // connections between two elements. Only split at those, so we don't tap into
        // an already-connected pair that isn't meant to be a distinct node.
        const splitPoints: Point[] = [];
        for (const p of CirSim.theApp.postDrawList) {
            if (CircuitElm.pointOnSegmentInterior(this.x, this.y, this.x2, this.y2, p.x, p.y))
                splitPoints.push(p);
        }
        if (splitPoints.length === 0)
            return;
        const x0 = this.x, y0 = this.y;
        splitPoints.sort((a, b) => {
            const da = (a.x-x0)*(a.x-x0) + (a.y-y0)*(a.y-y0);
            const db = (b.x-x0)*(b.x-x0) + (b.y-y0)*(b.y-y0);
            return da - db;
        });
        // full ordered list of boundary points: original endpoints plus dedup'd splits
        const pts: Point[] = [new Point(this.x, this.y)];
        for (const p of splitPoints) {
            const last = pts[pts.length - 1];
            if (p.x !== last.x || p.y !== last.y)
                pts.push(p);
        }
        const last = pts[pts.length - 1];
        if (last.x !== this.x2 || last.y !== this.y2)
            pts.push(new Point(this.x2, this.y2));

        let first = true;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            if (this.hasDirectConnection(a.x, a.y, b.x, b.y))
                continue;
            if (first) {
                this.x = a.x; this.y = a.y;
                this.drag(b.x, b.y);
                first = false;
            } else {
                const seg = new WireElm(a.x, a.y);
                seg.drag(b.x, b.y);
                CirSim.theApp.elmList.push(seg);
            }
        }
        if (first) {
            const idx = CirSim.theApp.elmList.indexOf(this);
            if (idx >= 0)
                CirSim.theApp.elmList.splice(idx, 1);
            this.delete();
        }
    }

    getMouseDistance(gx: number, gy: number): number {
        const thresh = 10;
        const d2 = this.lineDistanceSq(this.x, this.y, this.x2, this.y2, gx, gy);
        if (d2 <= thresh*thresh)
            return d2;
        return -1;
    }
}
