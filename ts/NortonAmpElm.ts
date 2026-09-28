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

/*

model:

  <ccm nm="nortonamp" f="0" sx="2" sy="2" bcs="1">
    <ext nm="in+" nd="3" ps="1" sd="2"/>
    <ext nm="in-" nd="1" ps="0" sd="2"/>
    <ext nm="out" nd="4" ps="0" sd="3"/>
    <d nn="1 0" f="2" mo="default"/>
    <d nn="2 0" f="2" mo="default"/>
    <CCCS nn="3 2 1 0" f="0" ic="2" ex="-a"/>
    <a nn="1 0 4" f="8" ma="12" mi="0" ga="100000"/>
  </ccm>

*/

import { CompositeElm } from "./CompositeElm";
import { CircuitElm } from "./CircuitElm";
import { Font } from "./Font";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";
import { WireRouter } from "./WireRouter";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class NortonAmpElm extends CompositeElm {
    opsize: number = 0;
    opheight: number = 0;
    opwidth: number = 0;
    static readonly FLAG_SWAP = 1;
    static readonly FLAG_SMALL = 2;

    // External nodes in model order: in+ (nd=3), in- (nd=1), out (nd=4)
    static readonly modelExternalNodes = [3, 1, 4];

    // Child elements with node assignments ("nn" attribute)
    static readonly modelXmlStr =
        "<elms>" +
        "<d nn=\"1 0\" f=\"2\" mo=\"default\"/>" +
        "<d nn=\"2 0\" f=\"2\" mo=\"default\"/>" +
        "<CCCS nn=\"3 2 1 0\" f=\"0\" ic=\"2\" ex=\"-a\"/>" +
        "<a nn=\"1 0 4\" f=\"8\" ma=\"12\" mi=\"0\" ga=\"100000\"/>" +
        "</elms>";

    static modelElements: Element[] | null = null;

    static initModel(): void {
        const modelDoc = new DOMParser().parseFromString(NortonAmpElm.modelXmlStr, "text/xml");
        NortonAmpElm.modelElements = [];
        const children = modelDoc.documentElement.childNodes;
        for (let i = 0; i < children.length; i++) {
            const node = children.item(i);
            if (node.nodeType === Node.ELEMENT_NODE)
                NortonAmpElm.modelElements.push(node as Element);
        }
    }

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined)
            super(xa, ya);
        else
            super(xa, ya, xb, yb!, f!);

        if (NortonAmpElm.modelElements === null)
            NortonAmpElm.initModel();
        this.loadCompositeXml(NortonAmpElm.modelElements!, NortonAmpElm.modelExternalNodes);
        this.buildCompNodeList();
        this.allocNodes();
        this.noDiagonal = true;
        this.setSize(this.useSmallGrid() ? 1 : 2);
    }

    getXmlDumpType(): string { return "nor"; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.setSize((this.flags & NortonAmpElm.FLAG_SMALL) !== 0 ? 1 : 2);
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.opheight * 2);
        this.setVoltageColor(g, this.nodes[0].v);   // post 0 = in+
        CircuitElm.drawThickLine(g, this.in1p[0], this.in1p[1]);
        this.setVoltageColor(g, this.nodes[1].v);   // post 1 = in-
        CircuitElm.drawThickLine(g, this.in2p[0], this.in2p[1]);
        this.setVoltageColor(g, this.nodes[2].v);   // post 2 = out
        CircuitElm.drawThickLine(g, this.lead2!, this.point2);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        this.setPowerColor(g, true);
        CircuitElm.drawThickPolygon(g, this.triangle);
        g.setFont(this.plusFont);
        this.drawCenteredText(g, "+", this.textp[0].x, this.textp[0].y - 2, true);
        this.drawCenteredText(g, "-", this.textp[1].x, this.textp[1].y, true);
        CircuitElm.drawThickCircle(g, this.nortonCenter.x, this.nortonCenter.y, this.nortonRadius);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        g.fillPolygon(this.nortonTriangle);
        this.curcount0 = this.updateDotCountImpl(-this.getCurrentIntoNode(0), this.curcount0);
        this.drawDots(g, this.in1p[0], this.in1p[1], this.curcount0);
        this.curcount1 = this.updateDotCountImpl(-this.getCurrentIntoNode(1), this.curcount1);
        this.drawDots(g, this.in2p[0], this.in2p[1], this.curcount1);
        this.curcount = this.updateDotCountImpl(-this.getCurrentIntoNode(2), this.curcount);
        this.drawDots(g, this.point2, this.lead2!, this.curcount);
        this.drawPosts(g);
    }

    in1p!: Point[];
    in2p!: Point[];
    textp!: Point[];
    triangle!: Polygon;
    nortonCenter!: Point;
    nortonRadius: number = 0;
    nortonTriangle!: Polygon;
    plusFont!: Font;
    curcount0: number = 0;
    curcount1: number = 0;

    setSize(s: number): void {
        this.opsize = s;
        this.opheight = 8 * s;
        this.opwidth = 13 * s;
        this.flags = (this.flags & ~NortonAmpElm.FLAG_SMALL) | ((s === 1) ? NortonAmpElm.FLAG_SMALL : 0);
    }

    setPoints(): void {
        super.setPoints();
        if (this.dn > 150 && this.isCreating())
            this.setSize(2);
        let ww = this.opwidth;
        if (ww > this.dn / 2)
            ww = Math.trunc(this.dn / 2);
        this.calcLeads(ww * 2);
        let hs = this.opheight * this.dsign;
        if ((this.flags & NortonAmpElm.FLAG_SWAP) !== 0)
            hs = -hs;
        this.in1p = this.newPointArray(2);
        this.in2p = this.newPointArray(2);
        this.textp = this.newPointArray(2);
        this.interpPoint2(this.point1, this.point2, this.in1p[0], this.in2p[0], 0, hs);
        this.interpPoint2(this.lead1!, this.lead2!, this.in1p[1], this.in2p[1], 0, hs);
        this.interpPoint2(this.lead1!, this.lead2!, this.textp[0], this.textp[1], .2, hs);
        const tris = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, tris[0], tris[1], 0, hs * 2);
        this.triangle = this.createPolygon(tris[0], tris[1], this.lead2!);
        this.plusFont = new Font("SansSerif", 0, this.opsize === 2 ? 14 : 10);

        this.nortonCenter = new Point(this.lead1!.x, this.lead1!.y);
        this.nortonRadius = Math.trunc(this.opheight * .5);

        const innerTip = new Point(0, 0);
        const innerBase = this.newPointArray(2);
        this.interpPoint(this.in1p[1], this.in2p[1], innerTip, 1.2 / 3);
        this.interpPoint2(this.in1p[1], this.in2p[1], innerBase[0], innerBase[1], 1.8 / 3, this.opheight * 0.3);
        this.nortonTriangle = this.createPolygon(innerTip, innerBase[0], innerBase[1]);

        this.setPost(0, this.in1p[0]);  // in+
        this.setPost(1, this.in2p[0]);  // in-
        this.setPost(2, this.point2);   // out
    }

    reset(): void {
        super.reset();
        this.curcount0 = this.curcount1 = 0;
    }

    getInfo(arr: string[]): void {
        arr[0] = "norton amp";
        arr[1] = "V+ = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[2] = "V- = " + CircuitElm.getVoltageText(this.nodes[1].v);
        arr[3] = "Vout = " + CircuitElm.getVoltageText(this.nodes[2].v);
        arr[4] = "Iout = " + CircuitElm.getCurrentText(-this.getCurrentIntoNode(2));
    }

    flipX(c2: number, count: number): void {
        if (this.dx === 0)
            this.flags ^= NortonAmpElm.FLAG_SWAP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        if (this.dy === 0)
            this.flags ^= NortonAmpElm.FLAG_SWAP;
        super.flipY(c2, count);
    }

    flipXY(xmy: number, count: number): void {
        this.flags ^= NortonAmpElm.FLAG_SWAP;
        super.flipXY(xmy, count);
    }

    addRoutingObstacle(router: WireRouter): void { this.addRoutingObstacleWithLeads(router, this.opwidth); }
}
