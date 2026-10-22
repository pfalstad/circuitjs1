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

// contributed by Edward Calver

import { InvertingSchmittElm } from "./InvertingSchmittElm";
import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { Graphics } from "./Graphics";
import { StringTokenizer } from "./StringTokenizer";

export class SchmittElm extends InvertingSchmittElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
        }
    }

    getDumpType(): number { return 182; }

    lastOutputVoltage: number = 0;

    startIteration(): void {
        this.lastOutputVoltage = this.nodes[1].v;
    }
    doStep(): void {
        let out: number;
        if (this.state) {
            // Output is high
            if (this.nodes[0].v > this.upperTrigger) {
                // Input voltage high enough to set output high
                this.state = false;
                out = this.logicOnLevel;
            } else {
                out = this.logicOffLevel;
            }
        } else {
            // Output is low
            if (this.nodes[0].v < this.lowerTrigger) {
                // Input voltage low enough to set output low
                this.state = true;
                out = this.logicOffLevel;
            } else {
                out = this.logicOnLevel;
            }
        }

        const maxStep = this.slewRate * CircuitElm.sim.timeStep * 1e9;
        out = Math.max(Math.min(this.lastOutputVoltage + maxStep, out), this.lastOutputVoltage - maxStep);
        CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[1], this.voltSource, out);
    }

    draw(g: Graphics): void {
        this.drawPosts(g);
        this.draw2Leads(g);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickPolygon(g, this.gatePoly);
        g.setLineWidth(2);
        CircuitElm.drawPolygon(g, this.symbolPoly);
        g.setLineWidth(1);
        this.curcount = this.updateDotCountImpl(this.current, this.curcount);
        this.drawDots(g, this.lead2, this.point2, this.curcount);
    }
    setPoints(): void {
        super.setPoints();
        const hs = 16;
        let ww = 16;
        if (ww > this.dn / 2)
            ww = Math.floor(this.dn / 2);
        this.lead1 = this.interpPoint(this.point1, this.point2, .5 - ww / this.dn);
        this.lead2 = this.interpPoint(this.point1, this.point2, .5 + (ww - 3) / this.dn);
        const triPoints = this.newPointArray(3);
        this.interpPoint2(this.lead1, this.lead2, triPoints[0], triPoints[1], 0, hs);
        triPoints[2] = this.interpPoint(this.point1, this.point2, .5 + (ww - 5) / this.dn);
        this.gatePoly = this.createPolygon(triPoints);
    }
    getInfo(arr: string[]): void {
        arr[0] = "Schmitt Trigger~"; // ~ is for localization
    }

    getCurrentIntoNode(n: number): number {
        if (n === 1)
            return this.current;
        return 0;
    }
}
