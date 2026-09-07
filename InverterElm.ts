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
import { WireRouter } from "./WireRouter";
import { GateElm } from "./GateElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class InverterElm extends CircuitElm {
    static readonly FLAG_DEMORGAN = 1<<3;
    slewRate: number; // V/ns
    highVoltage: number;
    gatePoly: Polygon;
    pcircle: Point;
    center: Point;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.noDiagonal = true;
            this.slewRate = .5;
            this.highVoltage = GateElm.lastHighVoltage;
        } else {
            super(xa, ya, xb, yb!, f!);
            this.noDiagonal = true;
            this.slewRate = .5;
            this.highVoltage = 5;
            try {
                this.slewRate = parseFloat(st!.nextToken());
                this.highVoltage = parseFloat(st!.nextToken());
            } catch (e) {}
        }
    }

    dump(): string {
        return super.dump() + " " + this.slewRate + " " + this.highVoltage;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "sl", this.slewRate);
        CircuitXMLSerializer.dumpAttr(elem, "hi", this.highVoltage);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.slewRate = xml.parseDoubleAttr("sl", this.slewRate);
        this.highVoltage = xml.parseDoubleAttr("hi", this.highVoltage);
    }

    getDumpType(): number { return 'I'.charCodeAt(0); }

    draw(g: Graphics): void {
        this.drawPosts(g);
        this.draw2Leads(g);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickPolygon(g, this.gatePoly);
        if (GateElm.useEuroGates())
            this.drawCenteredText(g, "1", this.center.x, this.center.y - 6, true);
        CircuitElm.drawThickCircle(g, this.pcircle.x, this.pcircle.y, 3);
        this.curcount = this.updateDotCountImpl(this.current, this.curcount);
        this.drawDots(g, this.lead2!, this.point2, this.curcount);
    }

    addRoutingObstacle(router: WireRouter): void {
        this.addRoutingObstacleWithLeads(router, 16);
    }

    setPoints(): void {
        super.setPoints();
        const hs = 16;
        let ww = 16;
        if (ww > this.dn / 2)
            ww = Math.floor(this.dn / 2);
        this.lead1 = this.interpPoint(this.point1, this.point2, .5 - ww / this.dn);
        this.lead2 = this.interpPoint(this.point1, this.point2, .5 + (ww + 2) / this.dn);

        let start: Point;
        let end: number;
        if (this.hasFlag(InverterElm.FLAG_DEMORGAN)) {
            this.pcircle = this.interpPoint(this.point1, this.point2, .5 - (ww - 4) / this.dn);   // Move circle to front
            start = this.interpPoint(this.point1, this.point2, .5 - (ww - 8) / this.dn);          // Shift triangle so overall
            end = .5 + (ww + 2) / this.dn;                                                        // symbol takes up same space
        } else {
            this.pcircle = this.interpPoint(this.point1, this.point2, .5 + (ww - 1) / this.dn);   // Normal symbol circle
            start = this.lead1!;
            end = .5 + (ww - 5) / this.dn;
        }

        if (GateElm.useEuroGates()) {
            const pts = this.newPointArray(4);
            const l2 = this.interpPoint(this.point1, this.point2, .5 + (ww - 5) / this.dn);
            this.interpPoint2(this.lead1!, l2, pts[0], pts[1], 0, hs);
            this.interpPoint2(this.lead1!, l2, pts[3], pts[2], 1, hs);
            this.gatePoly = this.createPolygon(pts);
            this.center = this.interpPoint(this.lead1!, l2, .5);
        } else {
            const triPoints = this.newPointArray(3);
            this.interpPoint2(start, this.lead2!, triPoints[0], triPoints[1], 0, hs);
            triPoints[2] = this.interpPoint(this.point1, this.point2, end);
            this.gatePoly = this.createPolygon(triPoints);
        }
        this.setBbox(this.point1, this.point2, hs);
    }

    getVoltageSourceCount(): number { return 1; }
    setHighVoltage(hv: number): void { this.highVoltage = hv; }

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[1], this.voltSource);
    }

    lastOutputVoltage: number = 0;

    startIteration(): void {
        this.lastOutputVoltage = this.nodes[1].v;
    }

    doStep(): void {
        let out = this.nodes[0].v > this.highVoltage * .5 ? 0 : this.highVoltage;
        const maxStep = this.slewRate * CircuitElm.sim.timeStep * 1e9;
        out = Math.max(Math.min(this.lastOutputVoltage + maxStep, out), this.lastOutputVoltage - maxStep);
        CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[1], this.voltSource, out);
    }

    getVoltageDiff(): number { return this.nodes[0].v; }

    getInfo(arr: string[]): void {
        arr[0] = "inverter";
        arr[1] = "Vi = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[2] = "Vo = " + CircuitElm.getVoltageText(this.nodes[1].v);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Slew Rate (V/ns)", this.slewRate, 0, 0);
        if (n === 1)
            return new EditInfo("High Logic Voltage", this.highVoltage, 1, 10).setUnitStep();
        if (n === 2)
            return EditInfo.createCheckbox("DeMorgan's Symbol", this.hasFlag(InverterElm.FLAG_DEMORGAN));
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.slewRate = ei.value;
        if (n === 1)
            this.highVoltage = GateElm.lastHighVoltage = ei.value;
        if (n === 2) {
            if (ei.checkbox!.getState())
                this.flags |= InverterElm.FLAG_DEMORGAN;
            else
                this.flags &= ~InverterElm.FLAG_DEMORGAN;
            this.setPoints();
        }
    }

    // no current path through inverter input, but indirect path through output to ground
    validate(): boolean { return this.validateRailNode(1); }
    getConnection(n1: number, n2: number): boolean { return false; }
    hasGroundConnection(n1: number): boolean { return n1 === 1; }
    getShortcut(): number { return '1'.charCodeAt(0); }

    getCurrentIntoNode(n: number): number {
        if (n === 1)
            return this.current;
        return 0;
    }
}
