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
import { parseIntStrict } from "./NumberParse";

export class WattmeterElm extends CircuitElm {
    width: number = 0;
    voltSources: VoltageSource[];
    currents: number[];
    curcounts: number[];
    meter: number = 0;
    readonly PM_INST = 0;
    readonly PM_AVG = 1;
    avgPower: number = 0;
    totalEnergy: number = 0;
    cycleTime: number = 0;
    lastCycleTime: number = 0;
    runEnergy: number = 0;
    runTime: number = 0;
    zeroTime: number = 0;
    peak: number = 0;
    trough: number = 0;
    wasAboveMid: boolean = false;
    haveFullCycle: boolean = false;

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
            this.width = parseIntStrict(st.nextToken());
            try { this.meter = parseIntStrict(st.nextToken()); } catch (e) {}
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
        const dt = CircuitElm.sim.timeStep;
        this.cycleTime += dt;
        this.totalEnergy += p * dt;
        this.runTime += dt;
        this.runEnergy += p * dt;

        // Average over whole cycles, delimited by rising crossings of the long-run mean.
        // The previous code delimited them by the local extremes of the power waveform,
        // which is half a period for a sine wave, and for a waveform with a flat section -
        // such as the output of a half-wave rectifier - gives a window that falls either
        // side of the conducting part instead of spanning a period.
        const mid = this.runEnergy / this.runTime;

        // Compare against the threshold with hysteresis. While the power is constant it
        // equals its own running mean, and a bare p > mid then chatters on rounding noise
        // alone, manufacturing crossings a fraction of a timestep apart. Those leave a
        // period estimate orders of magnitude too short behind, which the timeout and the
        // zero check below would then act on.
        if (p > this.peak)
            this.peak = p;
        if (p < this.trough)
            this.trough = p;
        const band = (this.peak - this.trough) * .05 + Math.abs(this.peak) * 1e-9;
        const above = this.wasAboveMid ? p > mid - band : p > mid + band;

        if (above && !this.wasAboveMid) {
            if (this.haveFullCycle) {
                this.avgPower = this.totalEnergy / this.cycleTime;
                if (isNaN(this.avgPower))
                    this.avgPower = 0;
                this.lastCycleTime = this.cycleTime;
            } else {
                // The run up to the first crossing is a partial cycle. Measuring it would
                // leave a period estimate far shorter than the real one.
                this.haveFullCycle = true;
            }
            this.totalEnergy = 0;
            this.cycleTime = 0;
        } else if (this.lastCycleTime > 0 && this.cycleTime > this.lastCycleTime * 8) {
            // the waveform stopped or changed shape; don't freeze on a stale reading
            this.avgPower = this.totalEnergy / this.cycleTime;
            if (isNaN(this.avgPower))
                this.avgPower = 0;
            this.totalEnergy = 0;
            this.cycleTime = 0;
        }
        this.wasAboveMid = above;

        // Constant power never crosses its own mean, so no period is ever measured. Report
        // the running mean until one is, which is the right answer for DC anyway.
        if (this.lastCycleTime === 0)
            this.avgPower = mid;

        // Clear the reading once the power has been off for longer than a period. The
        // previous code cleared after five zero samples, which a rectified waveform reaches
        // during every cycle; tying it to the measured period does not.
        if (p === 0) {
            this.zeroTime += dt;
            if (this.lastCycleTime > 0 && this.zeroTime > this.lastCycleTime * 1.5) {
                this.avgPower = 0;
                this.totalEnergy = 0;
                this.cycleTime = 0;
            }
        } else {
            this.zeroTime = 0;
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
        arr[0] = "wattmeter (old)";
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
