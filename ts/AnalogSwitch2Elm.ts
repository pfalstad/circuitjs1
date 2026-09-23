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

import { AnalogSwitchElm } from "./AnalogSwitchElm";
import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";

export class AnalogSwitch2Elm extends AnalogSwitchElm {
    swposts: Point[] = [];
    swpoles: Point[] = [];
    ctlPoint: Point = new Point(0, 0);
    labelPts: Point[] = [];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb !== undefined) {
            super(xa, ya, xb, yb!, f!, st!);
        } else {
            super(xa, ya);
        }
    }

    setPoints(): void {
        super.setPoints();
        this.calcLeads(32);
        this.adjustLeadsToGrid(this.isFlippedX(), this.isFlippedY());
        this.swposts = this.newPointArray(2);
        this.swpoles = this.newPointArray(2);
        this.labelPts = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, this.swpoles[0], this.swpoles[1], 1, this.openhs);
        this.interpPoint2(this.point1, this.point2, this.swposts[0], this.swposts[1], 1, this.openhs);
        this.interpPoint2(this.point1, this.point2, this.labelPts[0], this.labelPts[1], 1 - 10 / this.dn,
            this.openhs + (this.openhs > 0 ? 10 : -10));
        this.ctlPoint = this.interpPoint(this.lead1!, this.lead2!, 0.5, this.openhs);
    }

    getPostCount(): number { return 4; }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.openhs);

        // draw first lead
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);

        // draw second lead
        this.setVoltageColor(g, this.nodes[1].v);
        CircuitElm.drawThickLine(g, this.swpoles[0], this.swposts[0]);

        // draw third lead
        this.setVoltageColor(g, this.nodes[2].v);
        CircuitElm.drawThickLine(g, this.swpoles[1], this.swposts[1]);

        // draw switch arm
        g.setColor(CircuitElm.lightGrayColor);
        const position = this.open ? 1 : 0;
        CircuitElm.drawThickLine(g, this.lead1!, this.swpoles[position]);

        this.updateDotCount();
        this.drawDots(g, this.point1, this.lead1!, this.curcount);
        this.drawDots(g, this.swpoles[position], this.swposts[position], this.curcount);
        this.drawPosts(g);

        // label the two throw terminals when selected. At rest (control
        // below threshold) swposts[1] is connected, i.e. NC, and swposts[0]
        // is NO -- unless FLAG_INVERT ("Swap NO/NC") swaps that.
        if (this.needsHighlight()) {
            const inverted = this.hasFlag(this.FLAG_INVERT);
            g.setColor(CircuitElm.selectColor);
            this.drawCenteredText(g, inverted ? "NC" : "NO", this.labelPts[0].x, this.labelPts[0].y, true);
            this.drawCenteredText(g, inverted ? "NO" : "NC", this.labelPts[1].x, this.labelPts[1].y, true);
        }
    }

    getPost(n: number): Point {
        if (n === 0) return this.point1;
        if (n === 3) return this.ctlPoint;
        return this.swposts[n - 1];
    }

    getDumpType(): number { return 160; }
    getXmlDumpType(): string { return "as2"; }

    calculateCurrent(): void {
        this.current = this.open
            ? (this.nodes[0].v - this.nodes[2].v) / this.r_on
            : (this.nodes[0].v - this.nodes[1].v) / this.r_on;
    }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[0]);
        CircuitElm.sim.stampNonLinear(this.nodes[1]);
        CircuitElm.sim.stampNonLinear(this.nodes[2]);
        if (this.needsPulldown()) {
            CircuitElm.sim.stampResistor(this.nodes[1], CircuitNode.ground, this.r_off);
            CircuitElm.sim.stampResistor(this.nodes[2], CircuitNode.ground, this.r_off);
        }
    }

    doStep(): void {
        this.open = this.nodes[3].v < this.threshold;
        if (this.hasFlag(this.FLAG_INVERT))
            this.open = !this.open;
        if (this.open) {
            CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[2], this.r_on);
            if (!this.needsPulldown())
                CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.r_off);
        } else {
            CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.r_on);
            if (!this.needsPulldown())
                CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[2], this.r_off);
        }
    }

    // we have to just assume current will flow either way (regardless of
    // switch position), since getConnection() is used to determine the
    // matrix closures, and that can't depend on "open," which changes
    // every step -- see comment in AnalogSwitchElm.getConnection()
    getConnection(n1: number, n2: number): boolean {
        return n1 !== 3 && n2 !== 3;
    }

    hasGroundConnection(n: number): boolean {
        return this.needsPulldown() && (n === 1 || n === 2);
    }

    getInfo(arr: string[]): void {
        arr[0] = "analog switch (SPDT)";
        arr[1] = "I = " + CircuitElm.getCurrentDText(this.getCurrent());
    }

    // for SPDT the switch is never fully open, so "Normally closed" doesn't
    // apply; the flag instead swaps which throw terminal is NO vs NC
    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Swap NO/NC", this.hasFlag(this.FLAG_INVERT));
            return ei;
        }
        return super.getEditInfo(n);
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.flags = ei.checkbox!.getState() ? (this.flags | this.FLAG_INVERT) : (this.flags & ~this.FLAG_INVERT);
            return;
        }
        super.setEditValue(n, ei);
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0) return -this.current;
        const position = this.open ? 1 : 0;
        if (n === position + 1) return this.current;
        return 0;
    }
}
