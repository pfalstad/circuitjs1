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

import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { Graphics } from "./Graphics";
import { Polygon } from "./Polygon";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { parseFloatStrict } from "./NumberParse";

export class InvertingSchmittElm extends CircuitElm {
    slewRate: number; // V/ns
    lowerTrigger: number;
    upperTrigger: number;
    state: boolean;
    logicOnLevel: number;
    logicOffLevel: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.noDiagonal = true;
            this.slewRate = .5;
            this.state = false;
            this.lowerTrigger = 1.66;
            this.upperTrigger = 3.33;
            this.logicOnLevel = 5;
            this.logicOffLevel = 0;
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.noDiagonal = true;
            this.slewRate = .5;
            this.lowerTrigger = 1.66;
            this.upperTrigger = 3.33;
            this.logicOnLevel = 5;
            this.logicOffLevel = 0;
            try {
                this.slewRate = parseFloatStrict(st!.nextToken());
                this.lowerTrigger = parseFloatStrict(st!.nextToken());
                this.upperTrigger = parseFloatStrict(st!.nextToken());
                this.logicOnLevel = parseFloatStrict(st!.nextToken());
                this.logicOffLevel = parseFloatStrict(st!.nextToken());
            } catch (e) {
            }
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "slr", this.slewRate);
        CircuitXMLSerializer.dumpAttr(elem, "lt", this.lowerTrigger);
        CircuitXMLSerializer.dumpAttr(elem, "ut", this.upperTrigger);
        CircuitXMLSerializer.dumpAttr(elem, "lon", this.logicOnLevel);
        CircuitXMLSerializer.dumpAttr(elem, "loff", this.logicOffLevel);
    }
    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.slewRate = xml.parseDoubleAttr("slr", this.slewRate);
        this.lowerTrigger = xml.parseDoubleAttr("lt", this.lowerTrigger);
        this.upperTrigger = xml.parseDoubleAttr("ut", this.upperTrigger);
        this.logicOnLevel = xml.parseDoubleAttr("lon", this.logicOnLevel);
        this.logicOffLevel = xml.parseDoubleAttr("loff", this.logicOffLevel);
    }

    getDumpType(): number { return 183; }

    draw(g: Graphics): void {
        this.drawPosts(g);
        this.draw2Leads(g);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickPolygon(g, this.gatePoly);
        g.setLineWidth(2);
        CircuitElm.drawPolygon(g, this.symbolPoly);
        g.setLineWidth(1);
        CircuitElm.drawThickCircle(g, this.pcircle.x, this.pcircle.y, 3);
        this.curcount = this.updateDotCountImpl(this.current, this.curcount);
        this.drawDots(g, this.lead2, this.point2, this.curcount);
    }
    gatePoly: Polygon = null!;
    symbolPoly: Polygon = null!;
    pcircle: Point = null!;
    setPoints(): void {
        super.setPoints();
        const hs = 16;
        let ww = 16;
        if (ww > this.dn / 2)
            ww = Math.floor(this.dn / 2);
        this.lead1 = this.interpPoint(this.point1, this.point2, .5 - ww / this.dn);
        this.lead2 = this.interpPoint(this.point1, this.point2, .5 + (ww + 2) / this.dn);
        this.pcircle = this.interpPoint(this.point1, this.point2, .5 + (ww - 2) / this.dn);
        const triPoints = this.newPointArray(3);
        this.interpPoint2(this.lead1, this.lead2, triPoints[0], triPoints[1], 0, hs);
        triPoints[2] = this.interpPoint(this.point1, this.point2, .5 + (ww - 5) / this.dn);

        this.gatePoly = this.createPolygon(triPoints);
        this.symbolPoly = this.getSchmittPolygon(1, .3);
        this.setBbox(this.point1, this.point2, hs);
    }
    getVoltageSourceCount(): number { return 1; }
    stamp(): void {
        CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[1], this.voltSource!);
    }
    doStep(): void {
        const v0 = this.nodes[1].v;
        let out: number;
        if (this.state) {
            // Output is high
            if (this.nodes[0].v > this.upperTrigger) {
                // Input voltage high enough to set output low
                this.state = false;
                out = this.logicOffLevel;
            } else {
                out = this.logicOnLevel;
            }
        } else {
            // Output is low
            if (this.nodes[0].v < this.lowerTrigger) {
                // Input voltage low enough to set output high
                this.state = true;
                out = this.logicOnLevel;
            } else {
                out = this.logicOffLevel;
            }
        }

        const maxStep = this.slewRate * CircuitElm.sim.timeStep * 1e9;
        out = Math.max(Math.min(v0 + maxStep, out), v0 - maxStep);
        CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[1], this.voltSource, out);
    }
    getVoltageDiff(): number { return this.nodes[0].v; }

    getInfo(arr: string[]): void {
        arr[0] = "inverting Schmitt trigger";
        arr[1] = "Vi = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[2] = "Vo = " + CircuitElm.getVoltageText(this.nodes[1].v);
    }
    dlt: number = 0;
    dut: number = 0;
    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            this.dlt = this.lowerTrigger;
            return new EditInfo("Lower threshold (V)", this.lowerTrigger, 0.01, 5);
        }
        if (n === 1) {
            this.dut = this.upperTrigger;
            return new EditInfo("Upper threshold (V)", this.upperTrigger, 0.01, 5);
        }
        if (n === 2)
            return new EditInfo("Slew Rate (V/ns)", this.slewRate, 0, 0);
        if (n === 3)
            return new EditInfo("High Logic Voltage", this.logicOnLevel, 0, 0).setUnitStep();
        if (n === 4)
            return new EditInfo("Low Voltage (V)", this.logicOffLevel, 0, 0).setUnitStep();

        return null;
    }
    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.dlt = ei.value;
        if (n === 1)
            this.dut = ei.value;
        if (n === 2)
            this.slewRate = ei.value;
        if (n === 3)
            this.logicOnLevel = ei.value;
        if (n === 4)
            this.logicOffLevel = ei.value;

        if (this.dlt > this.dut) {
            this.upperTrigger = this.dlt;
            this.lowerTrigger = this.dut;
        } else {
            this.upperTrigger = this.dut;
            this.lowerTrigger = this.dlt;
        }
    }
    // there is no current path through the InvertingSchmitt input, but there
    // is an indirect path through the output to ground.
    getConnection(n1: number, n2: number): boolean { return false; }
    hasGroundConnection(n1: number): boolean {
        return (n1 === 1);
    }

    getCurrentIntoNode(n: number): number {
        if (n === 1)
            return this.current;
        return 0;
    }
}
