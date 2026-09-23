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
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { GateElm } from "./GateElm";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageSource } from "./VoltageSource";
import { parseFloatStrict } from "./NumberParse";

export class TriStateElm extends CircuitElm {
    resistance: number = 0;
    r_on: number;
    r_off: number;
    r_off_ground: number;
    highVoltage: number;
    busWidth: number = 1;
    voltageSources: VoltageSource[];

    readonly FLAG_FLIP   = 1;
    readonly FLAG_FLIP_X = 2;
    readonly FLAG_FLIP_Y = 4;

    open: boolean = false;
    ps: Point;
    point3: Point;
    lead3: Point;
    busLead1: Point;
    gatePoly: Polygon;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.r_on = 0.1; this.r_off = 1e10; this.r_off_ground = 0; this.highVoltage = 5;
            try {
                this.r_on = parseFloatStrict(st.nextToken());
                this.r_off = parseFloatStrict(st.nextToken());
                this.r_off_ground = parseFloatStrict(st.nextToken());
                this.highVoltage = parseFloatStrict(st.nextToken());
            } catch (e) {}
        } else {
            this.r_on = 0.1; this.r_off = 1e10; this.r_off_ground = 1e8;
            this.highVoltage = GateElm.lastHighVoltage;
        }
        this.noDiagonal = true;
        this.allocNodes();
    }

    dump(): string {
        return super.dump() + " " + this.r_on + " " + this.r_off + " " + this.r_off_ground + " " + this.highVoltage;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ron", this.r_on);
        CircuitXMLSerializer.dumpAttr(elem, "roff", this.r_off);
        CircuitXMLSerializer.dumpAttr(elem, "rog", this.r_off_ground);
        CircuitXMLSerializer.dumpAttr(elem, "hi", this.highVoltage);
        if (this.busWidth !== 1)
            CircuitXMLSerializer.dumpAttr(elem, "bw", this.busWidth);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.r_on = xml.parseDoubleAttr("ron", this.r_on);
        this.r_off = xml.parseDoubleAttr("roff", this.r_off);
        this.r_off_ground = xml.parseDoubleAttr("rog", this.r_off_ground);
        this.highVoltage = xml.parseDoubleAttr("hi", this.highVoltage);
        this.busWidth = xml.parseIntAttr("bw", 1);
        this.allocNodes();
    }

    getDumpType(): number { return 180; }
    getXmlDumpType(): string { return "ts"; }
    setHighVoltage(hv: number): void { this.highVoltage = hv; }

    setPoints(): void {
        super.setPoints();
        const len = 32;
        this.calcLeads(len);
        this.adjustLeadsToGrid((this.flags & this.FLAG_FLIP_X) !== 0, (this.flags & this.FLAG_FLIP_Y) !== 0);
        this.ps = new Point();
        const hs = 16;
        let ww = 16;
        if (ww > this.dn / 2) ww = Math.trunc(this.dn / 2);
        const triPoints = this.newPointArray(3);
        this.interpPoint2(this.lead1!, this.lead2!, triPoints[0], triPoints[1], 0, hs + 2);
        triPoints[2] = this.interpPoint(this.lead1!, this.lead2!, 0.5 + (ww - 2) / len);
        this.gatePoly = this.createPolygon(triPoints);
        this.busLead1 = this.interpPoint(this.point1, this.lead1!, 1 - 2 / this.dn);
        const sign = (this.flags & this.FLAG_FLIP) === 0 ? -1 : 1;
        this.point3 = this.interpPoint(this.lead1!, this.lead2!, 0.5, sign * hs);
        this.lead3  = this.interpPoint(this.lead1!, this.lead2!, 0.5, sign * (hs/2 + 2));
    }

    draw(g: Graphics): void {
        const hs = 16;
        this.setBbox(this.point1, this.point2, hs);
        this.setVoltageColor(g, this.nodes[2 * this.busWidth].v);
        CircuitElm.drawThickLine(g, this.point3, this.lead3);
        if (this.busWidth > 1) {
            this.setVoltageColor(g, this.nodes[0].v);
            CircuitElm.drawThickLine(g, this.point1, this.busLead1, 5);
            this.setVoltageColor(g, this.nodes[this.busWidth].v);
            CircuitElm.drawThickLine(g, this.lead2!, this.point2, 5);
        } else {
            this.draw2Leads(g);
        }
        g.setColor(CircuitElm.lightGrayColor);
        CircuitElm.drawThickPolygon(g, this.gatePoly);
        this.curcount = this.updateDotCountImpl(this.current, this.curcount);
        this.drawDots(g, this.lead2!, this.point2, this.curcount);
        this.drawPosts(g);
    }

    controlNode(): number { return 2 * this.busWidth; }
    internalNode(bit: number): number { return 2 * this.busWidth + 1 + bit; }

    calculateCurrent(): void {
        this.current = 0;
        for (let i = 0; i < this.busWidth; i++) {
            const intNode = this.internalNode(i);
            const outNode = this.busWidth + i;
            const current31 = (this.nodes[intNode].v - this.nodes[outNode].v) / this.resistance;
            const current10 = this.r_off_ground === 0 ? 0 : this.nodes[outNode].v / this.r_off_ground;
            this.current += current31 - current10;
        }
    }

    getCurrentIntoNode(n: number): number {
        if (n >= this.busWidth && n < 2 * this.busWidth) return this.current / this.busWidth;
        return 0;
    }

    nonLinear(): boolean { return true; }

    stamp(): void {
        for (let i = 0; i < this.busWidth; i++) {
            CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[this.internalNode(i)], this.voltageSources[i]);
            CircuitElm.sim.stampNonLinear(this.nodes[this.internalNode(i)]);
            CircuitElm.sim.stampNonLinear(this.nodes[this.busWidth + i]);
        }
    }

    doStep(): void {
        this.open = this.nodes[this.controlNode()].v < this.highVoltage * 0.5;
        this.resistance = this.open ? this.r_off : this.r_on;
        for (let i = 0; i < this.busWidth; i++) {
            const intNode = this.internalNode(i);
            const outNode = this.busWidth + i;
            CircuitElm.sim.stampResistor(this.nodes[intNode], this.nodes[outNode], this.resistance);
            if (this.r_off_ground > 0)
                CircuitElm.sim.stampResistor(this.nodes[outNode], CircuitNode.ground, this.r_off_ground);
            CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[intNode], this.voltageSources[i],
                this.nodes[i].v > this.highVoltage * 0.5 ? this.highVoltage : 0);
        }
    }

    drag(xx: number, yy: number): void {
        let flip = (xx < this.x) === (yy < this.y);
        xx = this.snapGrid(xx); yy = this.snapGrid(yy);
        if (Math.abs(this.x - xx) < Math.abs(this.y - yy)) xx = this.x;
        else { flip = !flip; yy = this.y; }
        this.flags = flip ? (this.flags | this.FLAG_FLIP) : (this.flags & ~this.FLAG_FLIP);
        super.drag(xx, yy);
    }

    getPostCount(): number { return 2 * this.busWidth + 1; }
    getInternalNodeCount(): number { return this.busWidth; }
    getVoltageSourceCount(): number { return this.busWidth; }

    setVoltageSource(n: number, v: VoltageSource): void {
        if (!this.voltageSources || this.voltageSources.length !== this.busWidth)
            this.voltageSources = new Array(this.busWidth);
        this.voltageSources[n] = v;
        v.setNodes(CircuitNode.ground, this.nodes[this.internalNode(n)]);
    }

    getMatrixConnection(n1: number, n2: number): boolean {
        for (let i = 0; i < this.busWidth; i++)
            if (this.comparePair(n1, n2, this.busWidth + i, this.internalNode(i))) return true;
        return false;
    }

    getPost(n: number): Point {
        if (n < this.busWidth)
            return this.busWidth > 1 ? new Point(this.point1.x, this.point1.y, n) : this.point1;
        if (n < 2 * this.busWidth)
            return this.busWidth > 1 ? new Point(this.point2.x, this.point2.y, n - this.busWidth) : this.point2;
        return this.point3;
    }

    getPostWidth(n: number): number { return n < 2 * this.busWidth ? this.busWidth : 1; }

    getInfo(arr: string[]): void {
        arr[0] = "tri-state buffer";
        if (this.busWidth > 1) arr[0] += " (" + this.busWidth + ")";
        arr[1] = this.open ? "open" : "closed";
        arr[2] = "Vd = " + CircuitElm.getVoltageDText(this.getVoltageDiff());
        arr[3] = "I = " + CircuitElm.getCurrentDText(this.getCurrent());
        arr[4] = "Vc = " + CircuitElm.getVoltageText(this.nodes[this.controlNode()].v);
    }

    getConnection(n1: number, n2: number): boolean { return false; }
    hasGroundConnection(n1: number): boolean { return n1 >= this.busWidth && n1 < 2 * this.busWidth; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("On Resistance (ohms)", this.r_on, 0, 0).setPositive();
        if (n === 1) return new EditInfo("Off Resistance (ohms)", this.r_off, 0, 0).setPositive();
        if (n === 2) return new EditInfo("Output Pulldown Resistance (ohms)", this.r_off_ground, 0, 0).setPositive();
        if (n === 3) return new EditInfo("High Logic Voltage", this.highVoltage, 1, 10).setUnitStep();
        if (n === 4) return new EditInfo("Bus Width", this.busWidth, 1, 32).setDimensionless();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0) this.r_on = ei.value;
        if (n === 1 && ei.value > 0) this.r_off = ei.value;
        if (n === 2 && ei.value > 0) this.r_off_ground = ei.value;
        if (n === 3) this.highVoltage = GateElm.lastHighVoltage = ei.value;
        if (n === 4) {
            if (ei.value >= 1) { this.busWidth = Math.trunc(ei.value); this.allocNodes(); }
            else ei.setError("must be >= 1");
        }
    }

    flipX(c2: number, count: number): void { this.flags ^= this.FLAG_FLIP | this.FLAG_FLIP_X; super.flipX(c2, count); }
    flipY(c2: number, count: number): void { this.flags ^= this.FLAG_FLIP | this.FLAG_FLIP_Y; super.flipY(c2, count); }
    flipXY(c2: number, count: number): void { this.flags ^= this.FLAG_FLIP; super.flipXY(c2, count); }
}
