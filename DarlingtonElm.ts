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

// Iain Sharp, Feb 2017

import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CompositeElm } from "./CompositeElm";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";
import { TransistorElm } from "./TransistorElm";

export class DarlingtonElm extends CompositeElm {
    private rectPoly: Polygon;
    private arrowPoly: Polygon;
    private rect: Point[];
    private coll: Point[];
    private emit: Point[];
    private base: Point;
    private coll2: Point[];

    pnp: number; // +1 for NPN, -1 for PNP
    private curcount_c: number = 0;
    private curcount_e: number = 0;
    private curcount_b: number = 0;

    private static modelString = "NTransistorElm 1 2 4\rNTransistorElm 4 2 3";
    private static modelExternalNodes = [1, 2, 3];

    constructor(xx: number, yy: number, pnpflag?: boolean);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xbOrPnp?: number | boolean, yb?: number, f?: number, st?: StringTokenizer) {
        if (st !== undefined) {
            super(xa, ya, xbOrPnp as number, yb!, f!);
            this.loadComposite(st, DarlingtonElm.modelString, DarlingtonElm.modelExternalNodes);
            this.pnp = parseInt(st.nextToken());
            this.noDiagonal = true;
        } else {
            super(xa, ya);
            this.loadComposite(null, DarlingtonElm.modelString, DarlingtonElm.modelExternalNodes);
            this.pnp = (xbOrPnp === true) ? -1 : 1;
            this.noDiagonal = true;
        }
        (this.compElmList[0] as TransistorElm).pnp = this.pnp;
        (this.compElmList[1] as TransistorElm).pnp = this.pnp;
    }

    reset(): void {
        super.reset();
        this.curcount_c = this.curcount_e = this.curcount_b = 0;
    }

    getDumpType(): number { return 400; }

    dump(): string { return super.dump() + " " + this.pnp; }

    getXmlDumpType(): string { return "dar"; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "pnp", this.pnp);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.pnp = xml.parseIntAttr("pnp", this.pnp);
        (this.compElmList[0] as TransistorElm).pnp = this.pnp;
        (this.compElmList[1] as TransistorElm).pnp = this.pnp;
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, 16);
        this.setPowerColor(g, true);
        // draw collector
        this.setVoltageColor(g, this.nodes[1].v);
        CircuitElm.drawThickLine(g, this.coll[0], this.coll[1]);
        CircuitElm.drawThickLine(g, this.coll2[0], this.coll2[1]);
        CircuitElm.drawThickLine(g, this.coll[0], this.coll2[0]);
        // draw emitter
        this.setVoltageColor(g, this.nodes[2].v);
        CircuitElm.drawThickLine(g, this.emit[0], this.emit[1]);
        // draw arrow
        g.setColor(CircuitElm.lightGrayColor);
        g.fillPolygon(this.arrowPoly);
        // draw base
        this.setVoltageColor(g, this.nodes[0].v);
        if (this.showPower())
            g.setColor(CircuitElm.lightGrayColor);
        CircuitElm.drawThickLine(g, this.point1, this.base);
        // draw dots
        this.curcount_b = this.updateDotCountImpl(this.getCurrentIntoNode(0), this.curcount_b);
        this.drawDots(g, this.base, this.point1, this.curcount_b);
        this.curcount_c = this.updateDotCountImpl(this.getCurrentIntoNode(1), this.curcount_c);
        this.drawDots(g, this.coll[1], this.coll[0], this.curcount_c);
        this.curcount_e = this.updateDotCountImpl(this.getCurrentIntoNode(2), this.curcount_e);
        this.drawDots(g, this.emit[1], this.emit[0], this.curcount_e);
        // draw base rectangle
        this.setVoltageColor(g, this.nodes[0].v);
        this.setPowerColor(g, true);
        g.fillPolygon(this.rectPoly);

        if ((this.needsHighlight() || this.isCreating()) && this.dy === 0) {
            g.setColor(CircuitElm.whiteColor);
            const ds = CircuitElm.sign(this.dx);
            g.drawString("B", this.base.x - 10 * ds, this.base.y - 5);
            g.drawString("C", this.coll[0].x - 3 + 9 * ds, this.coll[0].y + 4);
            g.drawString("E", this.emit[0].x - 3 + 9 * ds, this.emit[0].y + 4);
        }
        this.drawPosts(g);
    }

    getElmType(): string { return "darlington pair"; }

    getInfo(arr: string[]): void {
        arr[0] = Locale.LS("darlington pair") + " (" + (this.pnp === -1 ? "PNP)" : "NPN)");
        const vbc = this.nodes[0].v - this.nodes[1].v;
        const vbe = this.nodes[0].v - this.nodes[2].v;
        const vce = this.nodes[1].v - this.nodes[2].v;
        arr[1] = "Ic = " + CircuitElm.getCurrentText(-this.getCurrentIntoNode(1));
        arr[2] = "Ib = " + CircuitElm.getCurrentText(-this.getCurrentIntoNode(0));
        arr[3] = "Vbe = " + CircuitElm.getVoltageText(vbe);
        arr[4] = "Vbc = " + CircuitElm.getVoltageText(vbc);
        arr[5] = "Vce = " + CircuitElm.getVoltageText(vce);
    }

    setPoints(): void {
        super.setPoints();
        const hs = 16;
        const hs2 = hs * this.dsign * this.pnp;
        this.coll = this.newPointArray(2);
        this.coll2 = this.newPointArray(2);
        this.emit = this.newPointArray(2);
        this.interpPoint2(this.point1, this.point2, this.coll[0], this.emit[0], 1, hs2);
        this.coll2[0] = this.interpPoint(this.point1, this.point2, 1, hs2 - 5 * this.dsign * this.pnp);
        this.rect = this.newPointArray(4);
        this.interpPoint2(this.point1, this.point2, this.rect[0], this.rect[1], 1 - 16 / this.dn, hs);
        this.interpPoint2(this.point1, this.point2, this.rect[2], this.rect[3], 1 - 13 / this.dn, hs);
        this.interpPoint2(this.point1, this.point2, this.coll[1], this.emit[1], 1 - 13 / this.dn, 6 * this.dsign * this.pnp);
        this.coll2[1] = this.interpPoint(this.point1, this.point2, 1 - 13 / this.dn, this.dsign * this.pnp);
        this.base = new Point();
        this.interpPoint(this.point1, this.point2, this.base, 1 - 16 / this.dn);
        this.rectPoly = this.createPolygon(this.rect[0], this.rect[2], this.rect[3], this.rect[1]);
        if (this.pnp === 1)
            this.arrowPoly = this.calcArrow(this.emit[1], this.emit[0], 8, 4);
        else {
            const pt = this.interpPoint(this.point1, this.point2, 1 - 11 / this.dn, -5 * this.dsign * this.pnp);
            this.arrowPoly = this.calcArrow(this.emit[0], pt, 8, 4);
        }
        this.setPost(0, this.point1);
        this.setPost(1, this.coll[0]);
        this.setPost(2, this.emit[0]);
    }

    canFlipY(): boolean { return false; }
}
