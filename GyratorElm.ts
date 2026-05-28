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
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";

export class GyratorElm extends CircuitElm {
    gyrResistance: number;
    ptEnds: Point[];
    ptStub: Point[];
    boxTL: Point;
    boxTR: Point;
    boxBL: Point;
    boxBR: Point;
    arrowTail: Point;
    arrowHead: Point;
    arrowPoly: Polygon;
    currents: number[];
    curcounts: number[];
    width: number;
    flip: number;

    static readonly FLAG_VERTICAL = 8;
    static readonly FLAG_FLIP = 16;

    constructor(xx: number, yy: number) {
        super(xx, yy);
        this.gyrResistance = 1000;
        this.width = 32;
        this.noDiagonal = true;
        this.currents = [0, 0];
        this.curcounts = [0, 0];
    }

    drag(xx: number, yy: number): void {
        xx = this.snapGrid(xx);
        yy = this.snapGrid(yy);
        if (Math.abs(xx - this.x) > Math.abs(yy - this.y))
            this.flags &= ~GyratorElm.FLAG_VERTICAL;
        else
            this.flags |= GyratorElm.FLAG_VERTICAL;
        if (this.hasFlag(GyratorElm.FLAG_VERTICAL))
            this.width = -Math.max(32, Math.abs(xx - this.x));
        else
            this.width = Math.max(32, Math.abs(yy - this.y));
        if (xx === this.x)
            yy = this.y;
        this.x2 = xx; this.y2 = yy;
        this.setPoints();
    }

    // Wikipedia gyrator symbol: rectangular box with the Greek letter pi
    // (denoting the 180-degree phase shift in the gyration direction)
    // and an arrow showing the gyration direction.
    draw(g: Graphics): void {
        // Stubs from each terminal toward the box
        for (let i = 0; i !== 4; i++) {
            this.setVoltageColor(g, this.nodes[i].v);
            CircuitElm.drawThickLine(g, this.ptEnds[i], this.ptStub[i]);
        }
        // Box outline
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickLine(g, this.boxTL, this.boxTR);
        CircuitElm.drawThickLine(g, this.boxTR, this.boxBR);
        CircuitElm.drawThickLine(g, this.boxBR, this.boxBL);
        CircuitElm.drawThickLine(g, this.boxBL, this.boxTL);

        // Pi character and gyration arrow inside the box
        const cx = Math.floor((this.boxTL.x + this.boxBR.x) / 2);
        const cy = Math.floor((this.boxTL.y + this.boxBR.y) / 2);
        g.setFont(CircuitElm.unitsFont);
        g.drawString("π", cx - 4, cy - 1);
        g.drawLine(this.arrowTail, this.arrowHead);
        g.fillPolygon(this.arrowPoly);

        // Current animation along the stubs
        for (let i = 0; i !== 2; i++) {
            this.curcounts[i] = this.updateDotCountImpl(this.currents[i], this.curcounts[i]);
            this.drawDots(g, this.ptEnds[i], this.ptStub[i], this.curcounts[i]);
            this.drawDots(g, this.ptEnds[i + 2], this.ptStub[i + 2], -this.curcounts[i]);
        }

        this.drawPosts(g);
        this.setBbox(this.ptEnds[0], this.ptEnds[3], 0);
    }

    setPoints(): void {
        super.setPoints();
        if (this.hasFlag(GyratorElm.FLAG_VERTICAL))
            this.point2.x = this.point1.x;
        else
            this.point2.y = this.point1.y;
        this.ptEnds = this.newPointArray(4);
        this.ptStub = this.newPointArray(4);
        this.ptEnds[0] = this.point1;
        this.ptEnds[1] = this.point2;
        this.flip = this.hasFlag(GyratorElm.FLAG_FLIP) ? -1 : 1;
        this.interpPoint(this.point1, this.point2, this.ptEnds[2], 0, -this.dsign * this.width * this.flip);
        this.interpPoint(this.point1, this.point2, this.ptEnds[3], 1, -this.dsign * this.width * this.flip);
        // Stubs end 12px in from each terminal toward the center
        const cs = 0.5 - 12 / this.dn;
        for (let i = 0; i !== 4; i += 2) {
            this.interpPoint(this.ptEnds[i],     this.ptEnds[i + 1], this.ptStub[i],     cs);
            this.interpPoint(this.ptEnds[i + 1], this.ptEnds[i],     this.ptStub[i + 1], cs);
        }
        // Box corners coincide with the stub endpoints
        this.boxTL = this.ptStub[0];
        this.boxTR = this.ptStub[1];
        this.boxBL = this.ptStub[2];
        this.boxBR = this.ptStub[3];
        // Gyration arrow lives inside the box, below the pi character.
        // In horizontal orientation: arrow points from port 1 (left) to port 2 (right).
        const cx = Math.floor((this.boxTL.x + this.boxBR.x) / 2);
        const cy = Math.floor((this.boxTL.y + this.boxBR.y) / 2);
        if (this.hasFlag(GyratorElm.FLAG_VERTICAL)) {
            this.arrowTail = new Point(cx, cy + 6);
            this.arrowHead = new Point(cx, cy + 14);
        } else {
            this.arrowTail = new Point(cx - 8, cy + 8);
            this.arrowHead = new Point(cx + 8, cy + 8);
        }
        this.arrowPoly = this.calcArrow(this.arrowTail, this.arrowHead, 4, 3);
    }

    getPost(n: number): Point {
        return this.ptEnds[n];
    }

    getPostCount(): number { return 4; }

    reset(): void {
        this.currents[0] = this.currents[1] = 0;
        this.nodes[0].v = this.nodes[1].v = this.nodes[2].v = this.nodes[3].v = 0;
        this.curcounts[0] = this.curcounts[1] = 0;
    }

    // Gyrator equations (admittance form):
    //   I1 =  G * V2
    //   I2 = -G * V1
    // where G = 1/R is the gyration conductance.  Linear, memoryless: the
    // entire behavior is captured by stamping two voltage-controlled current
    // sources -- no doStep().
    stamp(): void {
        const g = 1.0 / this.gyrResistance;
        CircuitElm.sim.stampVCCurrentSource(this.nodes[0], this.nodes[2], this.nodes[1], this.nodes[3],  g);
        CircuitElm.sim.stampVCCurrentSource(this.nodes[1], this.nodes[3], this.nodes[0], this.nodes[2], -g);
    }

    calculateCurrent(): void {
        const g = 1.0 / this.gyrResistance;
        const v1 = this.nodes[0].v - this.nodes[2].v;
        const v2 = this.nodes[1].v - this.nodes[3].v;
        this.currents[0] =  g * v2;
        this.currents[1] = -g * v1;
    }

    getCurrent(): number { return this.currents[0]; }  // for scope

    getCurrentIntoNode(n: number): number {
        if (n < 2)
            return -this.currents[n];
        return this.currents[n - 2];
    }

    // VCCS stamps couple all nodes, so they must all be in the same matrix
    getMatrixConnection(n1: number, n2: number): boolean { return true; }

    getConnection(n1: number, n2: number): boolean {
        // Port-1 terminals connect to each other; port-2 terminals connect
        // to each other; the two ports are coupled only via the VCCS, not
        // galvanically.
        if (this.comparePair(n1, n2, 0, 2))
            return true;
        if (this.comparePair(n1, n2, 1, 3))
            return true;
        return false;
    }

    getInfo(arr: string[]): void {
        arr[0] = "gyrator";
        arr[1] = "R = " + CircuitElm.getUnitText(this.gyrResistance, "Ω");
        arr[2] = "Vd1 = " + CircuitElm.getVoltageText(this.nodes[0].v - this.nodes[2].v);
        arr[3] = "Vd2 = " + CircuitElm.getVoltageText(this.nodes[1].v - this.nodes[3].v);
        arr[4] = "I1 = " + CircuitElm.getCurrentText(this.currents[0]);
        arr[5] = "I2 = " + CircuitElm.getCurrentText(this.currents[1]);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Gyration Resistance (Ω)", this.gyrResistance, 1, 0);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0)
            this.gyrResistance = ei.value;
    }

    flipX(c2: number, count: number): void {
        if (this.hasFlag(GyratorElm.FLAG_VERTICAL))
            this.flags ^= GyratorElm.FLAG_FLIP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        if (!this.hasFlag(GyratorElm.FLAG_VERTICAL))
            this.flags ^= GyratorElm.FLAG_FLIP;
        super.flipY(c2, count);
    }

    flipXY(xmy: number, count: number): void {
        this.flags ^= GyratorElm.FLAG_VERTICAL;
        this.width *= -1;
        super.flipXY(xmy, count);
    }
}
