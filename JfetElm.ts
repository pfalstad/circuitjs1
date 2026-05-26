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

import { MosfetElm } from "./MosfetElm";
import { Diode } from "./Diode";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { CircuitElm } from "./CircuitElm";
import { Locale } from "./Locale";
import { SimulationManager } from "./SimulationManager";

export class JfetElm extends MosfetElm {
    diode: Diode;
    gateCurrent: number = 0;

    gatePoly: Polygon;
    declare arrowPoly: Polygon;
    gatePt: Point;
    curcountg: number = 0;
    curcounts: number = 0;
    curcountd: number = 0;

    constructor(xx: number, yy: number, pnpflag: boolean);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xbOrPnp?: number | boolean, yb?: number, f?: number, st?: StringTokenizer) {
        if (typeof xbOrPnp === "boolean") {
            super(xa, ya, xbOrPnp);
        } else if (xbOrPnp !== undefined) {
            super(xa, ya, xbOrPnp, yb!, f!, st!);
        } else {
            super(xa, ya, false);
        }
        this.noDiagonal = true;
        this.diode = new Diode(SimulationManager.theSim);
        this.diode.setupForDefaultModel();
    }

    reset(): void {
        super.reset();
        this.diode.reset();
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.hs);
        this.setVoltageColor(g, this.nodes[1].v);
        CircuitElm.drawThickLine(g, this.src[0], this.src[1]);
        CircuitElm.drawThickLine(g, this.src[1], this.src[2]);
        this.setVoltageColor(g, this.nodes[2].v);
        CircuitElm.drawThickLine(g, this.drn[0], this.drn[1]);
        CircuitElm.drawThickLine(g, this.drn[1], this.drn[2]);
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.point1, this.gatePt);
        g.fillPolygon(this.arrowPoly);
        this.setPowerColor(g, true);
        g.fillPolygon(this.gatePoly);
        this.curcountd = this.updateDotCountImpl(-this.ids, this.curcountd);
        this.curcountg = this.updateDotCountImpl(this.gateCurrent, this.curcountg);
        this.curcounts = this.updateDotCountImpl(-this.gateCurrent - this.ids, this.curcounts);
        if (this.curcountd !== 0 || this.curcounts !== 0) {
            this.drawDots(g, this.src[0], this.src[1], this.curcounts);
            this.drawDots(g, this.src[1], this.src[2], this.addCurCount(this.curcounts, 8));
            this.drawDots(g, this.drn[0], this.drn[1], -this.curcountd);
            this.drawDots(g, this.drn[1], this.drn[2], -this.addCurCount(this.curcountd, 8));
            this.drawDots(g, this.point1, this.gatePt, this.curcountg);
        }
        this.drawPosts(g);
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0) return -this.gateCurrent;
        if (n === 1) return this.gateCurrent + this.ids;
        return -this.ids;
    }

    setPoints(): void {
        super.setPoints();

        // find the coordinates of the various points we need to draw the JFET
        const hs2 = this.hs * this.dsign;
        this.src = this.newPointArray(3);
        this.drn = this.newPointArray(3);
        this.interpPoint2(this.point1, this.point2, this.src[0], this.drn[0], 1, -hs2);
        this.interpPoint2(this.point1, this.point2, this.src[1], this.drn[1], 1, -hs2 / 2);
        this.interpPoint2(this.point1, this.point2, this.src[2], this.drn[2], 1 - 10 / this.dn, -hs2 / 2);

        this.gatePt = this.interpPoint(this.point1, this.point2, 1 - 14 / this.dn);

        const ra = this.newPointArray(4);
        this.interpPoint2(this.point1, this.point2, ra[0], ra[1], 1 - 13 / this.dn, this.hs);
        this.interpPoint2(this.point1, this.point2, ra[2], ra[3], 1 - 10 / this.dn, this.hs);
        this.gatePoly = this.createPolygon(ra[0], ra[1], ra[3], ra[2]);
        if (this.pnp === -1) {
            const x = this.interpPoint(this.gatePt, this.point1, 18 / this.dn);
            this.arrowPoly = this.calcArrow(this.gatePt, x, 8, 3);
        } else {
            this.arrowPoly = this.calcArrow(this.point1, this.gatePt, 8, 3);
        }
    }

    stamp(): void {
        super.stamp();
        if (this.pnp < 0)
            this.diode.stamp(this.nodes[1], this.nodes[0]);
        else
            this.diode.stamp(this.nodes[0], this.nodes[1]);
    }

    doStep(): void {
        super.doStep();
        this.diode.doStep(this.pnp * (this.nodes[0].v - this.nodes[1].v));
    }

    calculateCurrent(): void {
        this.gateCurrent = this.pnp * this.diode.calculateCurrent(this.pnp * (this.nodes[0].v - this.nodes[1].v));
    }

    showBulk(): boolean { return false; }

    getDumpType(): number { return 'j'.charCodeAt(0); }

    // these values are taken from Hayes+Horowitz p155
    getDefaultThreshold(): number { return -4; }
    getDefaultBeta(): number { return .00125; }
    getBackwardCompatibilityBeta(): number { return this.getDefaultBeta(); }
    getElmType(): string { return "JFET"; }

    getInfo(arr: string[]): void {
        this.getFetInfo(arr, "JFET");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n < 2)
            return super.getEditInfo(n);
        return null;
    }

    getConnection(n1: number, n2: number): boolean {
        return true;
    }

    getScopeText(v: number): string {
        return Locale.LS((this.pnp === -1 ? "p-" : "n-") + "JFET");
    }
}

export class NJfetElm extends JfetElm {
    constructor(xx: number, yy: number) { super(xx, yy, false); }
    getDumpClass(): typeof JfetElm { return JfetElm; }
}

export class PJfetElm extends JfetElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb !== undefined)
            super(xa, ya, xb, yb!, f!, st!);
        else
            super(xa, ya, true);
    }
    getDumpClass(): typeof JfetElm { return JfetElm; }
}
