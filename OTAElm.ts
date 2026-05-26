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
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Font } from "./Font";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { RailElm } from "./RailElm";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageElm } from "./VoltageElm";

export class OTAElm extends CompositeElm {
    private static modelString = "RailElm 4\rRailElm 10\rNTransistorElm 1 2 3\rNTransistorElm 3 1 4\rNTransistorElm 3 3 4\rNTransistorElm 5 6 2\rNTransistorElm 7 8 2\rPTransistorElm 9 6 10\rPTransistorElm 9 9 10\rPTransistorElm 6 12 9\rPTransistorElm 11 8 10\rPTransistorElm 11 11 10\rPTransistorElm 8 13 11\rNTransistorElm 14 14 4\rNTransistorElm 14 12 4\rNTransistorElm 12 13 14\rNTransistorElm 15 15 5\rNTransistorElm 15 15 7";
    private static modelExternalNodes = [7, 5, 15, 1, 13];

    arrowPoly1!: Polygon;
    arrowPoly2!: Polygon;

    readonly opheight  = 32;
    readonly opwidth   = 32;
    readonly circDiam  = 19;
    readonly circOverlap = 8;
    in1p!: Point[];
    in2p!: Point[];
    in3p!: Point[];
    in4p!: Point[];
    textp!: Point[];
    bar1!: Point[];
    bar2!: Point[];
    circCent!: Point[];
    point2bis!: Point;
    triangle!: Polygon;
    plusFont!: Font;
    curCount0: number = 0;
    curCount1: number = 0;
    curCount2: number = 0;
    curCount3: number = 0;
    posVolt: number = 9.0;
    negVolt: number = -9.0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.noDiagonal = true;
            this.loadComposite(null, OTAElm.modelString, OTAElm.modelExternalNodes);
            this.initOTA();
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.noDiagonal = true;
            this.loadComposite(st!, OTAElm.modelString, OTAElm.modelExternalNodes);
            this.negVolt = (this.compElmList[0] as RailElm).maxVoltage;
            this.posVolt = (this.compElmList[1] as RailElm).maxVoltage;
        }
    }

    private initOTA(): void {
        (this.compElmList[0] as RailElm).maxVoltage = this.negVolt;
        (this.compElmList[1] as RailElm).maxVoltage = this.posVolt;
    }

    reset(): void {
        super.reset();
        this.curCount0 = this.curCount1 = this.curCount2 = this.curCount3 = 0;
    }

    getConnection(n1: number, n2: number): boolean { return false; }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, 3 * this.opheight / 2);
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.in1p[0], this.in1p[1]);
        this.setVoltageColor(g, this.nodes[1].v);
        CircuitElm.drawThickLine(g, this.in2p[0], this.in2p[1]);
        this.setVoltageColor(g, this.nodes[2].v);
        CircuitElm.drawThickLine(g, this.in3p[0], this.in3p[1]);
        this.setVoltageColor(g, this.nodes[3].v);
        CircuitElm.drawThickLine(g, this.in4p[0], this.in4p[1]);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        this.setPowerColor(g, true);
        CircuitElm.drawThickPolygon(g, this.triangle);
        g.fillPolygon(this.arrowPoly1);
        g.fillPolygon(this.arrowPoly2);
        CircuitElm.drawThickLine(g, this.bar1[0], this.bar1[1]);
        CircuitElm.drawThickLine(g, this.bar2[0], this.bar2[1]);
        CircuitElm.drawThickCircle(g, this.circCent[0].x, this.circCent[0].y, this.circDiam / 2);
        CircuitElm.drawThickCircle(g, this.circCent[1].x, this.circCent[1].y, this.circDiam / 2);
        g.setFont(this.plusFont);
        this.drawCenteredText(g, "+", this.textp[0].x, this.textp[0].y - 2, true);
        this.drawCenteredText(g, "-", this.textp[1].x, this.textp[1].y, true);
        this.curCount0 = this.updateDotCountImpl(-this.getCurrentIntoNode(0), this.curCount0);
        this.drawDots(g, this.in1p[0], this.in1p[1], this.curCount0);
        this.curCount1 = this.updateDotCountImpl(-this.getCurrentIntoNode(1), this.curCount1);
        this.drawDots(g, this.in2p[0], this.in2p[1], this.curCount0);
        this.curCount2 = this.updateDotCountImpl(-this.getCurrentIntoNode(2), this.curCount2);
        this.drawDots(g, this.in3p[0], this.in3p[1], this.curCount2);
        this.curCount3 = this.updateDotCountImpl(-this.getCurrentIntoNode(3), this.curCount3);
        this.drawDots(g, this.in4p[0], this.in4p[1], this.curCount3);
        this.drawPosts(g);
    }

    setPoints(): void {
        super.setPoints();
        const ww = this.opwidth;
        const wtot = ww * 2 + 2 * this.circDiam - this.circOverlap;

        if (this.dn > wtot) {
            this.lead1 = this.interpPoint(this.point1, this.point2, 1.0 - wtot / this.dn, 0);
            this.lead2 = this.point2;
            this.point2bis = this.point2;
        } else {
            this.lead1 = this.point1;
            this.lead2 = this.interpPoint(this.point1, this.point2, wtot / this.dn, 0);
            this.point2bis = this.lead2;
        }
        const hs = this.opheight * this.dsign;
        this.in1p = this.newPointArray(2);
        this.in2p = this.newPointArray(2);
        this.in3p = this.newPointArray(2);
        this.in4p = this.newPointArray(2);
        this.textp  = this.newPointArray(2);
        this.bar1   = this.newPointArray(2);
        this.bar2   = this.newPointArray(2);
        this.circCent = this.newPointArray(2);
        this.interpPoint2(this.point1,  this.point2bis, this.in1p[0], this.in2p[0], 0, hs);
        this.interpPoint2(this.lead1!,  this.lead2!,   this.in1p[1], this.in2p[1], 0, hs);
        this.interpPoint2(this.lead1!,  this.lead2!,   this.textp[0], this.textp[1], .1, hs);
        this.in3p[0] = this.point1;
        this.in3p[1] = this.lead1!;
        this.in4p[0] = this.interpPoint(this.lead1!, this.lead2!, 1.0 - (16.0 / wtot), 32);
        this.in4p[1] = this.interpPoint(this.lead1!, this.lead2!, 1.0 - (16.0 / wtot), 8);
        const tris = this.newPointArray(3);
        this.interpPoint2(this.lead1!, this.lead2!, tris[0], tris[1], 0, 3 * hs / 2);
        tris[2] = this.interpPoint(this.lead1!, this.lead2!, (2.0 * ww) / wtot);
        this.triangle = this.createPolygon(tris[0], tris[1], tris[2]);
        this.circCent[0] = this.interpPoint(this.lead1!, this.lead2!, 1.0 - (this.circDiam / (2.0 * wtot)), 0);
        this.circCent[1] = this.interpPoint(this.lead1!, this.lead2!, 1.0 - (3 * this.circDiam / 2.0 - this.circOverlap) / wtot, 0);
        let d1 = this.interpPoint(this.in3p[1], this.in1p[1], 0.3333);
        let d2 = this.interpPoint(this.in3p[1], this.in1p[1], 0.6666);
        this.arrowPoly1 = this.calcArrow(d1, d2, 8, 4);
        this.interpPoint2(d1, d2, this.bar1[0], this.bar1[1], 1.0, 4);
        d1 = this.interpPoint(this.in3p[1], this.in2p[1], 0.3333);
        d2 = this.interpPoint(this.in3p[1], this.in2p[1], 0.6666);
        this.arrowPoly2 = this.calcArrow(d1, d2, 8, 4);
        this.interpPoint2(d1, d2, this.bar2[0], this.bar2[1], 1.0, 4);
        this.plusFont = new Font("SansSerif", 0, 14);
        this.setPost(0, this.in1p[0]);
        this.setPost(1, this.in2p[0]);
        this.setPost(2, this.in3p[0]);
        this.setPost(3, this.in4p[0]);
        this.setPost(4, this.point2bis);
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "pv", this.posVolt);
        CircuitXMLSerializer.dumpAttr(elem, "nv", this.negVolt);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.posVolt = xml.parseDoubleAttr("pv", this.posVolt);
        this.negVolt = xml.parseDoubleAttr("nv", this.negVolt);
        this.initOTA();
    }

    getDumpType(): number { return 402; }

    getInfo(arr: string[]): void {
        arr[0] = "OTA (LM13700 style)";
        arr[1] = "Iabc = " + CircuitElm.getCurrentText(-this.getCurrentIntoNode(3));
        arr[2] = "V+ - V- = " + CircuitElm.getVoltageText(this.nodes[0].v - this.nodes[1].v);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("Positive Supply Voltage (5-20V)", this.posVolt, 5, 20);
        if (n === 1) return new EditInfo("Negative Supply Voltage (V)",     this.negVolt, -20, -5);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.posVolt = ei.value;
        if (n === 1) this.negVolt = ei.value;
        this.initOTA();
    }

    canFlipX(): boolean { return false; }
    canFlipY(): boolean { return false; }

    getXmlDumpType(): string { return "ota"; }
}
