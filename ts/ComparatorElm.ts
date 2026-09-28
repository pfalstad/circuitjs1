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
import { CompositeElm } from "./CompositeElm";
import { EditInfo } from "./EditInfo";
import { Font } from "./Font";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";

export class ComparatorElm extends CompositeElm {
    private static modelString = "OpAmpElm 1 2 3\rAnalogSwitchElm 4 5 3\rGroundElm 5";
    private static modelExternalNodes = [2, 1, 4];

    readonly FLAG_SMALL = 2;
    readonly FLAG_SWAP = 4;
    opsize: number;
    opheight: number;
    opwidth: number;
    in1p: Point[];
    in2p: Point[];
    textp: Point[];
    triangle: Polygon;
    plusFont: Font;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (st !== undefined) {
            super(xa, ya, xb!, yb!, f!);
            this.loadComposite(st, ComparatorElm.modelString, ComparatorElm.modelExternalNodes);
            this.noDiagonal = true;
            this.setSize((f! & this.FLAG_SMALL) !== 0 ? 1 : 2);
        } else {
            super(xa, ya);
            this.loadComposite(null, ComparatorElm.modelString, ComparatorElm.modelExternalNodes);
            this.noDiagonal = true;
            this.setSize(this.useSmallGrid() ? 1 : 2);
        }
    }

    getDumpType(): number { return 401; }

    setSize(s: number): void {
        this.opsize = s;
        this.opheight = 8 * s;
        this.opwidth = 13 * s;
        this.flags = (this.flags & ~this.FLAG_SMALL) | (s === 1 ? this.FLAG_SMALL : 0);
    }

    getConnection(n1: number, n2: number): boolean { return false; }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.opheight * 2);
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.in1p[0], this.in1p[1]);
        this.setVoltageColor(g, this.nodes[1].v);
        CircuitElm.drawThickLine(g, this.in2p[0], this.in2p[1]);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        this.setPowerColor(g, true);
        CircuitElm.drawThickPolygon(g, this.triangle);
        g.setFont(this.plusFont);
        this.drawCenteredText(g, "-", this.textp[0].x, this.textp[0].y - 2, true);
        this.drawCenteredText(g, "+", this.textp[1].x, this.textp[1].y, true);
        this.drawCenteredText(g, "≥?", this.textp[2].x, this.textp[2].y, true);
        this.setVoltageColor(g, this.nodes[2].v);
        CircuitElm.drawThickLine(g, this.lead2!, this.point2);
        this.curcount = this.updateDotCountImpl(-this.getCurrentIntoNode(2), this.curcount);
        this.drawDots(g, this.point2, this.lead2!, this.curcount);
        this.drawPosts(g);
    }

    setPoints(): void {
        super.setPoints();
        if (this.dn > 150 && this.isCreating())
            this.setSize(2);
        let ww = this.opwidth;
        if (ww > this.dn / 2)
            ww = Math.trunc(this.dn / 2);
        this.calcLeads(ww * 2);
        const hs = this.opheight * this.dsign;
        this.in1p = this.newPointArray(2);
        this.in2p = this.newPointArray(2);
        this.textp = this.newPointArray(3);
        const sgn = this.hasFlag(this.FLAG_SWAP) ? -1 : 1;
        this.interpPoint2(this.point1, this.point2, this.in1p[0],  this.in2p[0], 0, hs * sgn);
        this.interpPoint2(this.lead1!,  this.lead2!,  this.in1p[1],  this.in2p[1], 0, hs * sgn);
        this.interpPoint2(this.lead1!,  this.lead2!,  this.textp[0], this.textp[1], 0.2, hs * sgn);
        this.interpPoint(this.lead1!, this.lead2!, this.textp[2], 0.5, 0);
        const tris = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, tris[0], tris[1], 0, hs * 2);
        this.triangle = this.createPolygon(tris[0], tris[1], this.lead2!);
        this.plusFont = new Font("SansSerif", 0, this.opsize === 2 ? 14 : 10);
        this.setPost(0, this.in1p[0]);
        this.setPost(1, this.in2p[0]);
        this.setPost(2, this.point2);
    }

    getInfo(arr: string[]): void {
        arr[0] = "Comparator";
        arr[1] = "V+ = " + CircuitElm.getVoltageText(this.nodes[1].v);
        arr[2] = "V- = " + CircuitElm.getVoltageText(this.nodes[0].v);
    }

    flipX(c2: number, count: number): void {
        if (this.dx === 0)
            this.flags ^= this.FLAG_SWAP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        if (this.dy === 0)
            this.flags ^= this.FLAG_SWAP;
        super.flipY(c2, count);
    }

    flipXY(xmy: number, count: number): void {
        this.flags ^= this.FLAG_SWAP;
        super.flipXY(xmy, count);
    }
}
