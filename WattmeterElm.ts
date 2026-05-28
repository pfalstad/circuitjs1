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
import { Choice } from "./Choice";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Font } from "./Font";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageSource } from "./VoltageSource";

export class WattmeterElm extends CircuitElm {
    width: number = 0;
    voltSources: VoltageSource[];
    currents: number[];
    curcounts: number[];
    meter: number = 0;
    readonly PM_INST = 0;
    readonly PM_AVG = 1;
    avgPower: number = 0;
    totalPower: number = 0;
    count: number = 0;
    zerocount: number = 0;
    maxP: number = 0;
    lastMaxP: number = 0;
    minP: number = 0;
    lastMinP: number = 0;
    increasingP: boolean = true;
    decreasingP: boolean = true;

    posts: Point[];
    inner: Point[];
    rectPointsX: number[];
    rectPointsY: number[];
    center: Point;
    maxTextLen: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.width = parseInt(st.nextToken());
            try { this.meter = parseInt(st.nextToken()); } catch (e) {}
        }
        this.setup();
    }

    setup(): void {
        this.voltSources = new Array(2);
        this.currents = [0, 0];
        this.curcounts = [0, 0];
    }

    dump(): string { return super.dump() + " " + this.width + " " + this.meter; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "w", this.width);
        CircuitXMLSerializer.dumpAttr(elem, "meter", this.meter);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.width = xml.parseIntAttr("w", this.width);
        this.meter = xml.parseIntAttr("meter", this.meter);
        this.setup();
    }

    getVoltageSourceCount(): number { return 2; }
    getDumpType(): number { return 420; }
    getPostCount(): number { return 4; }

    drag(xx: number, yy: number): void {
        xx = this.snapGrid(xx);
        yy = this.snapGrid(yy);
        const w1 = Math.max(CircuitElm.app.gridSize, CircuitElm.abs(yy - this.y));
        const w2 = Math.max(CircuitElm.app.gridSize, CircuitElm.abs(xx - this.x));
        if (w1 > w2) { xx = this.x; this.width = w2; }
        else { yy = this.y; this.width = w1; }
        this.x2 = xx; this.y2 = yy;
        this.setPoints();
    }

    setPoints(): void {
        super.setPoints();
        const ds = (this.dy === 0) ? CircuitElm.sign(this.dx) : -CircuitElm.sign(this.dy);
        const p3 = this.interpPoint(this.point1, this.point2, 0, -this.width * ds);
        const p4 = this.interpPoint(this.point1, this.point2, 1, -this.width * ds);
        const sep = CircuitElm.app.gridSize;
        const p5 = this.interpPoint(this.point1, this.point2, sep / this.dn);
        const p6 = this.interpPoint(this.point1, this.point2, 1 - sep / this.dn);
        const p7 = this.interpPoint(p3, p4, sep / this.dn);
        const p8 = this.interpPoint(p3, p4, 1 - sep / this.dn);
        this.posts = [p3, p4, this.point1, this.point2];
        this.inner = [p7, p8, p5, p6];
        const r1 = this.interpPoint(this.point1, this.point2, sep / this.dn, ds * sep);
        const r2 = this.interpPoint(this.point1, this.point2, 1 - sep / this.dn, ds * sep);
        const r3 = this.interpPoint(this.point1, this.point2, sep / this.dn, -ds * (sep + this.width));
        const r4 = this.interpPoint(this.point1, this.point2, 1 - sep / this.dn, -ds * (sep + this.width));
        this.rectPointsX = [r1.x, r2.x, r4.x, r3.x];
        this.rectPointsY = [r1.y, r2.y, r4.y, r3.y];
        this.center = this.interpPoint(r1, r4, 0.5);
        this.maxTextLen = Math.max(Math.abs(r1.x - r4.x) - 5, 5);
    }

    getPost(n: number): Point { return this.posts[n]; }

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(this.nodes[0], this.nodes[1], this.voltSources[0], 0);
        CircuitElm.sim.stampVoltageSource(this.nodes[2], this.nodes[3], this.voltSources[1], 0);
    }

    setVoltageSource(j: number, vs: VoltageSource): void {
        this.voltSources[j] = vs;
        vs.setNodes(this.nodes[j*2], this.nodes[j*2+1]);
    }

    stepFinished(): void {
        const p = this.getPower();
        this.count++;
        this.totalPower += p;
        if (p > this.maxP && this.increasingP) {
            this.maxP = p;
            this.increasingP = true;
            this.decreasingP = false;
        }
        if (p < this.maxP && this.increasingP) {
            this.lastMaxP = this.maxP;
            this.minP = p;
            this.increasingP = false;
            this.decreasingP = true;
            this.avgPower = this.totalPower / this.count;
            if (isNaN(this.avgPower)) this.avgPower = 0;
            this.count = 0; this.totalPower = 0;
        }
        if (p < this.minP && this.decreasingP) {
            this.minP = p;
            this.increasingP = false;
            this.decreasingP = true;
        }
        if (p > this.minP && this.decreasingP) {
            this.lastMinP = this.minP;
            this.maxP = p;
            this.increasingP = true;
            this.decreasingP = false;
            this.avgPower = this.totalPower / this.count;
            if (isNaN(this.avgPower)) this.avgPower = 0;
            this.count = 0; this.totalPower = 0;
        }
        if (p === 0) {
            this.zerocount++;
            if (this.zerocount > 5) { this.totalPower = 0; this.avgPower = 0; this.maxP = 0; this.minP = 0; }
        } else {
            this.zerocount = 0;
        }
    }

    draw(g: Graphics): void {
        for (let i = 0; i !== 2; i++)
            this.curcounts[i] = this.updateDotCountImpl(this.currents[i], this.curcounts[i]);
        let flip = 1;
        for (let i = 0; i !== 4; i++) {
            this.setVoltageColor(g, this.nodes[i].v);
            CircuitElm.drawThickLine(g, this.posts[i], this.inner[i]);
            this.drawDots(g, this.posts[i], this.inner[i], this.curcounts[Math.trunc(i/2)] * flip);
            flip *= -1;
        }
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickPolygon(g, this.rectPointsX, this.rectPointsY, 4);
        this.setBbox(this.posts[0].x, this.posts[0].y, this.posts[3].x, this.posts[3].y);
        this.drawPosts(g);

        const str = this.meter === this.PM_AVG
            ? CircuitElm.getUnitText(this.avgPower, "W(avg)")
            : CircuitElm.getUnitText(this.getPower(), "W");
        g.save();
        let fsize = 15;
        let w;
        while (true) {
            g.setFont(new Font("SansSerif", 0, fsize));
            w = Math.trunc(g.context.measureText(str).width);
            if (w < this.maxTextLen) break;
            fsize--;
        }
        g.setColor(CircuitElm.whiteColor);
        g.context.textBaseline = "middle";
        g.drawString(str, this.center.x - Math.trunc(w/2), this.center.y);
        g.restore();
    }

    getPower(): number { return this.getVoltageDiff() * this.getCurrent(); }

    setCurrent(vs: VoltageSource, c: number): void {
        this.currents[vs === this.voltSources[0] ? 0 : 1] = c;
    }

    getCurrentIntoNode(n: number): number {
        return n % 2 === 0 ? -this.currents[Math.trunc(n/2)] : this.currents[Math.trunc(n/2)];
    }

    getConnection(n1: number, n2: number): boolean { return Math.trunc(n1/2) === Math.trunc(n2/2); }
    hasGroundConnection(n1: number): boolean { return false; }

    getInfo(arr: string[]): void {
        arr[0] = "wattmeter";
        this.getBasicInfo(arr);
        arr[3] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
        if (this.meter === this.PM_AVG)
            arr[4] = "Pavg = " + CircuitElm.getUnitText(this.avgPower, "W");
    }

    canViewInScope(): boolean { return true; }
    getCurrent(): number { return this.currents[1]; }
    getVoltageDiff(): number { return this.nodes[2].v - this.nodes[0].v; }
    canFlipX(): boolean { return false; }
    canFlipY(): boolean { return false; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Value", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Instantaneous");
            ei.choice.add("Average");
            ei.choice.select(this.meter);
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.meter = ei.choice!.getSelectedIndex();
    }
}
