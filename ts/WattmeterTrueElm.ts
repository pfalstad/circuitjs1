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

// "True" wattmeter: measures P = V*I directly from separate potential and current
// coils, like a real electrodynamometer wattmeter, rather than reusing the two
// terminal pairs of the (old) WattmeterElm for both purposes.
export class WattmeterTrueElm extends CircuitElm {
    width: number = 0;
    voltSources: VoltageSource[];
    currents: number[];
    curcounts: number[];

    meter: number = 0;
    readonly PM_INST = 0;
    readonly PM_AVG = 1;
    selectedValue: number = 0;
    avgPower: number = 0;
    totalEnergy: number = 0;
    cycleTime: number = 0;
    lastCycleTime: number = 0;
    runEnergy: number = 0;
    runTime: number = 0;
    zeroTime: number = 0;
    peak: number = 0;
    trough: number = 0;
    curPeak: number = 0;
    curTrough: number = 0;
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
        this.setup();
    }

    setup(): void {
        this.voltSources = new Array(2);
        this.currents = [0, 0];
        this.curcounts = [0, 0];
    }

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

    getVoltageSourceCount(): number { return 1; }
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

        // get 2 more terminals
        const p3 = this.interpPoint(this.point1, this.point2, 0, -this.width * ds);
        const p4 = this.interpPoint(this.point1, this.point2, 1, -this.width * ds);

        // get stubs
        const sep = CircuitElm.app.gridSize;
        const p5 = this.interpPoint(this.point1, this.point2, sep / this.dn);
        const p6 = this.interpPoint(this.point1, this.point2, 1 - sep / this.dn);
        const p7 = this.interpPoint(p3, p4, sep / this.dn);
        const p8 = this.interpPoint(p3, p4, 1 - sep / this.dn);

        // we number the posts like this because we want the lower-numbered
        // points to be on the bottom, so that if some of them are unconnected
        // (which is often true) then the bottom ones will get automatically
        // attached to ground.
        // bottom 2 terminals (potential coil) are swapped so that the marked
        // (C) terminal lines up under the marked (M) current coil terminal,
        // matching the standard wattmeter terminal layout: M L / C V
        this.posts = [p4, p3, this.point1, this.point2];
        this.inner = [p8, p7, p5, p6];

        // get rectangle
        const r1 = this.interpPoint(this.point1, this.point2, sep / this.dn, ds * sep);
        const r2 = this.interpPoint(this.point1, this.point2, 1 - sep / this.dn, ds * sep);
        const r3 = this.interpPoint(this.point1, this.point2, sep / this.dn, -ds * (sep + this.width));
        const r4 = this.interpPoint(this.point1, this.point2, 1 - sep / this.dn, -ds * (sep + this.width));
        this.rectPointsX = [r1.x, r2.x, r4.x, r3.x];
        this.rectPointsY = [r1.y, r2.y, r4.y, r3.y];

        this.center = this.interpPoint(r1, r4, .5);
        this.maxTextLen = Math.max(Math.abs(r1.x - r4.x) - 5, 5);
    }

    getPost(n: number): Point { return this.posts[n]; }

    stamp(): void {
        // 2  3
        // 0  1
        // zero-valued voltage source from 2 to 3, so we can measure current
        CircuitElm.sim.stampVoltageSource(this.nodes[2], this.nodes[3], this.voltSources[0], 0);
        // but turn nodes 0 to 1 into a resistor, so we can measure voltage
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], 1e8);
    }

    setVoltageSource(j: number, vs: VoltageSource): void {
        this.voltSources[j] = vs;
    }

    draw(g: Graphics): void {
        for (let i = 0; i !== 2; i++)
            this.curcounts[i] = this.updateDotCountImpl(this.currents[i], this.curcounts[i]);
        let flip = 1;
        for (let i = 0; i !== 4; i++) {
            this.setVoltageColor(g, this.nodes[i].v);
            CircuitElm.drawThickLine(g, this.posts[i], this.inner[i]);
            if (i === 2 || i === 3)
                this.drawDots(g, this.posts[i], this.inner[i], this.curcounts[Math.trunc(i/2)] * flip);
            // current coil terminals are labeled M (marked) and L, potential coil
            // terminals are labeled C (marked) and V, matching standard wattmeter
            // terminal markings: M L / C V.  Labels sit just inside the box edge,
            // like pin labels on a ChipElm.
            {
                let label: string;
                if (i === 2) label = "M";
                else if (i === 3) label = "L";
                else if (i === 1) label = "C";
                else label = "V";
                g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.whiteColor);
                const w = Math.trunc(g.context.measureText(label).width);
                const labelPoint = this.interpPoint(this.posts[i], this.inner[i], 1.5) as Point;
                g.drawString(label, labelPoint.x - Math.trunc(w/2), labelPoint.y + 4);
            }
            flip *= -1;
        }

        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickPolygon(g, this.rectPointsX, this.rectPointsY, 4);

        // set bounding box to be full wattmeter box
        this.setBbox(this.rectPointsX[0], this.rectPointsY[0], this.rectPointsX[2], this.rectPointsY[2]);
        this.drawPosts(g);

        const str = CircuitElm.getUnitText(this.getMeterPower(), "W");
        g.save();
        let fsize = 15;
        let w;
        // adjust font size to fit
        while (true) {
            g.setFont(new Font("SansSerif", 0, fsize));
            w = Math.trunc(g.context.measureText(str).width);
            if (w < this.maxTextLen)
                break;
            fsize--;
        }
        g.setColor(CircuitElm.whiteColor);
        g.context.textBaseline = "middle";
        g.drawString(str, this.center.x - Math.trunc(w/2), this.center.y);
        g.restore();
    }

    // Average over whole cycles, delimited by rising crossings of the long-run mean
    // (ported from WattmeterElm.stepFinished(), which fixed the same averaging
    // against local extrema of the power waveform that this element used to do).
    stepFinished(): void {
        const p = this.getPower();
        const dt = CircuitElm.sim.timeStep;
        this.cycleTime += dt;
        this.totalEnergy += p * dt;
        this.runTime += dt;
        this.runEnergy += p * dt;

        const mid = this.runEnergy / this.runTime;

        // Track this cycle's power swing to size next cycle's hysteresis band, instead
        // of an all-time peak/trough. A resistor's instantaneous power settles near its
        // steady-state range almost immediately, but a capacitor charging from an
        // initial condition goes through a startup transient far outside its steady-state
        // swing; an all-time extreme would get stuck there and oversize the band forever,
        // so the detector would stop triggering cleanly once the load is reactive.
        if (p > this.curPeak)
            this.curPeak = p;
        if (p < this.curTrough)
            this.curTrough = p;

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
            this.peak = this.curPeak;
            this.trough = this.curTrough;
            this.curPeak = p;
            this.curTrough = p;
        } else if (this.lastCycleTime > 0 && this.cycleTime > this.lastCycleTime * 8) {
            // the waveform stopped or changed shape; don't freeze on a stale reading
            this.avgPower = this.totalEnergy / this.cycleTime;
            if (isNaN(this.avgPower))
                this.avgPower = 0;
            this.totalEnergy = 0;
            this.cycleTime = 0;
            this.peak = this.curPeak;
            this.trough = this.curTrough;
            this.curPeak = p;
            this.curTrough = p;
        }
        this.wasAboveMid = above;

        // Constant power never crosses its own mean, so no period is ever measured. Report
        // the running mean until one is, which is the right answer for DC anyway.
        if (this.lastCycleTime === 0)
            this.avgPower = mid;

        // Clear the reading once the power has been off for longer than a period.
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

    setCurrent(vn: VoltageSource, c: number): void {
        this.currents[vn === this.voltSources[1] ? 0 : 1] = c;
    }
    getCurrentIntoNode(n: number): number {
        if (n % 2 === 0)
            return -this.currents[Math.trunc(n/2)];
        else
            return this.currents[Math.trunc(n/2)];
    }

    getConnection(n1: number, n2: number): boolean { return Math.trunc(n1/2) === Math.trunc(n2/2); }
    hasGroundConnection(n1: number): boolean { return false; }

    getInfo(arr: string[]): void {
        arr[0] = "wattmeter";
        this.getBasicInfo(arr);
        arr[3] = "P = " + CircuitElm.getUnitText(this.getVoltageDiff() * this.getCurrent(), "W");
        arr[4] = "P = " + CircuitElm.getUnitText(this.getAveragePower(), "W");
    }

    getPower(): number { return this.getVoltageDiff() * this.getCurrent(); }

    getMeterPower(): number {
        let value: number;
        switch (this.meter) {
        case this.PM_INST:
            value = this.getVoltageDiff() * this.getCurrent();
            break;
        case this.PM_AVG:
            value = this.getAveragePower();
            break;
        default:
            value = -1;
        }
        return value;
    }

    canViewInScope(): boolean { return true; }
    getCurrent(): number { return this.currents[1]; }
    getVoltageDiff(): number { return this.nodes[1].v - this.nodes[0].v; }
    getAveragePower(): number { return this.avgPower; }

    canFlipX(): boolean { return false; }
    canFlipY(): boolean { return false; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Value", this.selectedValue, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Instantaneous Power");
            ei.choice.add("Average Power");
            ei.choice.select(this.meter);
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.meter = ei.choice!.getSelectedIndex();
    }
}
