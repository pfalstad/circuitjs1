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
import { CircuitNode } from "./CircuitNode";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { GateElm } from "./GateElm";
import { Locale } from "./Locale";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { parseFloatStrict } from "./NumberParse";

export class DelayBufferElm extends CircuitElm {
    delay: number = 0;
    threshold: number = 2.5;
    highVoltage: number = 5;
    center: Point;
    gatePoly: Polygon;
    delayEndTime: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.noDiagonal = true;
            this.threshold = 2.5;
            this.highVoltage = 5;
        } else {
            super(xa, ya, xb, yb!, f!);
            this.noDiagonal = true;
            this.delay = parseFloatStrict(st!.nextToken());
            this.threshold = 2.5;
            this.highVoltage = 5;
            try {
                this.threshold = parseFloatStrict(st!.nextToken());
                this.highVoltage = parseFloatStrict(st!.nextToken());
            } catch (e) {}
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "dl", this.delay);
        CircuitXMLSerializer.dumpAttr(elem, "th", this.threshold);
        CircuitXMLSerializer.dumpAttr(elem, "hv", this.highVoltage);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.delay = xml.parseDoubleAttr("dl", this.delay);
        this.threshold = xml.parseDoubleAttr("th", this.threshold);
        this.highVoltage = xml.parseDoubleAttr("hv", this.highVoltage);
    }

    getDumpType(): number { return 422; }
    setHighVoltage(hv: number): void { this.highVoltage = hv; }

    draw(g: Graphics): void {
        this.drawPosts(g);
        this.draw2Leads(g);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickPolygon(g, this.gatePoly);
        if (GateElm.useEuroGates())
            this.drawCenteredText(g, "1", this.center.x, this.center.y - 6, true);
        this.curcount = this.updateDotCountImpl(this.current, this.curcount);
        this.drawDots(g, this.lead2!, this.point2, this.curcount);
    }

    setPoints(): void {
        super.setPoints();
        const hs = 16;
        let ww = 16 - 2;
        if (ww > this.dn / 2)
            ww = Math.floor(this.dn / 2);
        this.lead1 = this.interpPoint(this.point1, this.point2, .5 - ww / this.dn);
        this.lead2 = this.interpPoint(this.point1, this.point2, .5 + ww / this.dn);

        if (GateElm.useEuroGates()) {
            const pts = this.newPointArray(4);
            const l2 = this.interpPoint(this.point1, this.point2, .5 + (ww - 5) / this.dn);
            this.interpPoint2(this.lead1!, l2, pts[0], pts[1], 0, hs);
            this.interpPoint2(this.lead1!, l2, pts[3], pts[2], 1, hs);
            this.gatePoly = this.createPolygon(pts);
            this.center = this.interpPoint(this.lead1!, l2, .5);
        } else {
            const triPoints = this.newPointArray(3);
            this.interpPoint2(this.lead1!, this.lead2!, triPoints[0], triPoints[1], 0, hs);
            triPoints[2] = this.interpPoint(this.point1, this.point2, .5 + ww / this.dn);
            this.gatePoly = this.createPolygon(triPoints);
        }
        this.setBbox(this.point1, this.point2, hs);
    }

    getVoltageSourceCount(): number { return 1; }

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[1], this.voltSource);
    }

    doStep(): void {
        let inState = this.nodes[0].v > this.threshold;
        let outState = this.nodes[1].v > this.threshold;
        if (inState !== outState) {
            if (CircuitElm.sim.t >= this.delayEndTime)
                outState = inState;
        } else
            this.delayEndTime = CircuitElm.sim.t + this.delay;
        CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[1], this.voltSource, outState ? this.highVoltage : 0);
    }

    getVoltageDiff(): number { return this.nodes[0].v; }

    getInfo(arr: string[]): void {
        arr[0] = Locale.LS("buffer");
        arr[1] = Locale.LS("delay = ") + CircuitElm.getUnitText(this.delay, "s");
        arr[2] = "Vi = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[3] = "Vo = " + CircuitElm.getVoltageText(this.nodes[1].v);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Delay (s)", this.delay, 0, 0);
        if (n === 1)
            return new EditInfo("Threshold (V)", this.threshold, 0, 0);
        if (n === 2)
            return new EditInfo("High Logic Voltage", this.highVoltage, 0, 0).setUnitStep();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.delay = ei.value;
        if (n === 1)
            this.threshold = ei.value;
        if (n === 2)
            this.highVoltage = ei.value;
    }

    // there is no current path through the inverter input, but there
    // is an indirect path through the output to ground.
    getConnection(n1: number, n2: number): boolean { return false; }
    hasGroundConnection(n1: number): boolean { return n1 === 1; }

    getCurrentIntoNode(n: number): number {
        if (n === 1)
            return this.current;
        return 0;
    }
}
