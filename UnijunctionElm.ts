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

import { CompositeElm } from "./CompositeElm";
import { CircuitElm } from "./CircuitElm";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";

export class UnijunctionElm extends CompositeElm {
    // node 0 = E
    // node 1 = B1
    // node 2 = B2

    static readonly FLAG_FLIP = 2;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
        }
        this.setup();
    }

    private static ujtModelString = "DiodeElm 1 4\rVoltageElm 4 5\rCCVSElm 4 5 6 0\rResistorElm 0 6\rVCCSElm 5 7 5 7 6 7 5\rCapacitorElm 5 7\rResistorElm 7 2\rResistorElm 3 5";
    private static ujtExternalNodes = [1, 2, 3];
    private static ujtModelDump = "2 x2n2646-emitter/0 0 0 0 0 0 0/2 2 1000*a/0 1000000/0 5 0.00028*(a-b)\\p0.00575*(c-d)*e/2 3.5e-11 0 0/0 38.15/0 2518";

    setup(): void {
        this.noDiagonal = true;
        this.flags |= CompositeElm.FLAG_ESCAPE;
        const st = new StringTokenizer(UnijunctionElm.ujtModelDump, "/");
        this.loadComposite(st, UnijunctionElm.ujtModelString, UnijunctionElm.ujtExternalNodes);
        CircuitElm.sim.adjustTimeStep = true;
    }

    dump(): string {
        // don't want model details dumped, takes up space and will make it hard to change
        return this.dumpWithMask(0);
    }

    reset(): void {
        super.reset();
        this.curcountb1 = this.curcountb2 = this.curcounte = 0;
    }

    getDumpType(): number { return 417; }

    b1!: Point[];
    b2!: Point[];
    emitterPoly!: Polygon;
    emitter!: Point[];
    curcountb1: number = 0;
    curcountb2: number = 0;
    curcounte:  number = 0;
    arrowPoly!: Polygon;
    readonly hs = 16;

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.b1[0], 0);
        this.setVoltageColor(g, this.volts[1]);
        CircuitElm.drawThickLine(g, this.b1[0], this.b1[1]);
        CircuitElm.drawThickLine(g, this.b1[1], this.b1[2]);
        this.setVoltageColor(g, this.volts[2]);
        CircuitElm.drawThickLine(g, this.b2[0], this.b2[1]);
        CircuitElm.drawThickLine(g, this.b2[1], this.b2[2]);
        this.setVoltageColor(g, this.volts[0]);
        CircuitElm.drawThickLine(g, this.emitter[0], this.emitter[1]);
        CircuitElm.drawThickLine(g, this.emitter[1], this.emitter[2]);
        g.fillPolygon(this.arrowPoly);
        this.setPowerColor(g, true);
        g.fillPolygon(this.emitterPoly);
        const ib2 = -this.getCurrentIntoNode(2);
        const ib1 = -this.getCurrentIntoNode(1);
        this.curcountb2 = this.updateDotCountImpl(ib2, this.curcountb2);
        this.curcountb1 = this.updateDotCountImpl(ib1, this.curcountb1);
        this.curcounte  = this.updateDotCountImpl(-ib1 - ib2, this.curcounte);
        if (this.curcountb1 !== 0 || this.curcountb2 !== 0) {
            this.drawDots(g, this.b1[0], this.b1[1], this.curcountb1);
            this.drawDots(g, this.b1[1], this.b1[2], this.addCurCount(this.curcountb1, 8));
            this.drawDots(g, this.b2[0], this.b2[1], this.curcountb2);
            this.drawDots(g, this.b2[1], this.b2[2], this.addCurCount(this.curcountb2, 8));
            this.drawDots(g, this.emitter[0], this.emitter[1], this.curcounte);
            this.drawDots(g, this.emitter[1], this.emitter[2], this.curcounte);
        }
        this.drawPosts(g);
    }

    setPoints(): void {
        super.setPoints();
        const flip = this.hasFlag(UnijunctionElm.FLAG_FLIP) ? -1 : 1;
        const hs2  = this.hs * this.dsign * flip;
        this.b1      = this.newPointArray(3);
        this.b2      = this.newPointArray(3);
        this.emitter = this.newPointArray(3);
        const p1 = this.interpPoint(this.point1, this.point2, 0, -hs2);
        const p2 = this.interpPoint(this.point1, this.point2, 1, -hs2);
        this.interpPoint2(p1, p2, this.b1[0], this.b2[0], 1,         -hs2);
        this.interpPoint2(p1, p2, this.b1[1], this.b2[1], 1,         -hs2 / 2);
        this.interpPoint2(p1, p2, this.b1[2], this.b2[2], 1 - 10 / this.dn, -hs2 / 2);

        this.emitter[0] = this.interpPoint(p1, p2, 0, hs2);
        this.emitter[1] = this.interpPoint(p1, p2, 1 - 28 / this.dn, hs2);
        this.emitter[2] = this.interpPoint(p1, p2, 1 - 14 / this.dn);

        const ra = this.newPointArray(4);
        this.interpPoint2(p1, p2, ra[0], ra[1], 1 - 13 / this.dn, this.hs);
        this.interpPoint2(p1, p2, ra[2], ra[3], 1 - 10 / this.dn, this.hs);
        this.emitterPoly = this.createPolygon(ra[0], ra[1], ra[3], ra[2]);
        this.arrowPoly   = this.calcArrow(this.emitter[1], this.emitter[2], 8, 3);
    }

    getPost(n: number): Point {
        return (n === 0) ? this.emitter[0] : (n === 1) ? this.b1[0] : this.b2[0];
    }

    getPostCount(): number { return 3; }

    getInfo(arr: string[]): void {
        arr[0] = "unijunction transistor";
        arr[1] = "Ie = "    + CircuitElm.getCurrentText(-this.getCurrentIntoNode(0));
        arr[2] = "Ib2 = "   + CircuitElm.getCurrentText(-this.getCurrentIntoNode(2));
        arr[3] = "Veb1 = "  + CircuitElm.getVoltageText(this.volts[0] - this.volts[1]);
        arr[4] = "Vb2b1 = " + CircuitElm.getVoltageText(this.volts[2] - this.volts[1]);
        arr[5] = "P = "     + CircuitElm.getUnitText(this.getPower(), "W");
    }

    flipX(c2: number, count: number): void {
        if (this.dx === 0)
            this.flags ^= UnijunctionElm.FLAG_FLIP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        if (this.dy === 0)
            this.flags ^= UnijunctionElm.FLAG_FLIP;
        super.flipY(c2, count);
    }

    flipXY(xmy: number, count: number): void {
        this.flags ^= UnijunctionElm.FLAG_FLIP;
        super.flipXY(xmy, count);
    }

    getXmlDumpType(): string { return "ujt"; }
}
