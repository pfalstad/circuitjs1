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
import { VoltageSource } from "./VoltageSource";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Color } from "./Color";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Locale } from "./Locale";

export class TransLineElm extends CircuitElm {
    delay: number;
    imped: number;
    voltageL: Float64Array | null = null;
    voltageR: Float64Array | null = null;
    lenSteps: number = 0;
    ptr: number = 0;
    width: number = 0;
    lastStepCount: number = 0;

    posts: Point[] = [];
    inner: Point[] = [];

    voltSource1: VoltageSource | null = null;
    voltSource2: VoltageSource | null = null;
    current1: number = 0;
    current2: number = 0;
    curCount1: number = 0;
    curCount2: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.delay = 1000 * CircuitElm.sim.maxTimeStep;
            this.imped = 75;
            this.noDiagonal = true;
            this.reset();
        } else {
            super(xa, ya, xb, yb!, f!);
            this.delay = parseFloat(st!.nextToken());
            this.imped = parseFloat(st!.nextToken());
            this.width = parseInt(st!.nextToken());
            // next slot is for resistance (losses), not implemented
            st!.nextToken();
            this.noDiagonal = true;
            this.reset();
        }
    }

    getDumpType(): number { return 171; }
    getPostCount(): number { return 4; }
    getInternalNodeCount(): number { return 2; }
    getXmlDumpType(): string { return "tl"; }

    dump(): string {
        return super.dump() + " " + this.delay + " " + this.imped + " " + this.width + " " + 0.;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "de", this.delay);
        CircuitXMLSerializer.dumpAttr(elem, "im", this.imped);
        CircuitXMLSerializer.dumpAttr(elem, "wi", this.width);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.delay = xml.parseDoubleAttr("de", this.delay);
        this.imped = xml.parseDoubleAttr("im", this.imped);
        this.width = xml.parseIntAttr("wi", this.width);
        this.reset();
    }

    drag(xx: number, yy: number): void {
        xx = this.snapGrid(xx);
        yy = this.snapGrid(yy);
        const w1 = CircuitElm.max(CircuitElm.app.gridSize, CircuitElm.abs(yy - this.y));
        const w2 = CircuitElm.max(CircuitElm.app.gridSize, CircuitElm.abs(xx - this.x));
        if (w1 > w2) {
            xx = this.x;
            this.width = w2;
        } else {
            yy = this.y;
            this.width = w1;
        }
        this.x2 = xx;
        this.y2 = yy;
        this.setPoints();
    }

    reset(): void {
        if (CircuitElm.sim.maxTimeStep === 0)
            return;
        this.lenSteps = Math.trunc(this.delay / CircuitElm.sim.maxTimeStep);
        if (this.lenSteps > 100000) {
            this.voltageL = this.voltageR = null;
        } else {
            this.voltageL = new Float64Array(this.lenSteps);
            this.voltageR = new Float64Array(this.lenSteps);
        }
        this.ptr = 0;
        super.reset();
        this.lastStepCount = 0;
    }

    setPoints(): void {
        super.setPoints();
        const ds = (this.dy === 0) ? CircuitElm.sign(this.dx) : -CircuitElm.sign(this.dy);
        const p3 = this.interpPoint(this.point1, this.point2, 0, -this.width * ds);
        const p4 = this.interpPoint(this.point1, this.point2, 1, -this.width * ds);
        const sep = CircuitElm.app.gridSize / 2;
        const p5 = this.interpPoint(this.point1, this.point2, 0, -(this.width / 2 - sep) * ds);
        const p6 = this.interpPoint(this.point1, this.point2, 1, -(this.width / 2 - sep) * ds);
        const p7 = this.interpPoint(this.point1, this.point2, 0, -(this.width / 2 + sep) * ds);
        const p8 = this.interpPoint(this.point1, this.point2, 1, -(this.width / 2 + sep) * ds);

        // we number the posts like this because we want the lower-numbered
        // points to be on the bottom, so that if some of them are unconnected
        // (which is often true) then the bottom ones will get automatically
        // attached to ground.
        this.posts = [p3, p4, this.point1, this.point2];
        this.inner = [p7, p8, p5, p6];
    }

    draw(g: Graphics): void {
        this.setBbox(this.posts[0], this.posts[3], 0);
        const segments = Math.trunc(this.dn / 2);
        const ix0 = this.ptr - 1 + this.lenSteps;
        const segf = 1 / segments;

        g.setColor(Color.darkGray);
        g.fillRect(this.inner[2].x, this.inner[2].y,
                   this.inner[1].x - this.inner[2].x + 2,
                   this.inner[1].y - this.inner[2].y + 2);

        for (let i = 0; i !== 4; i++) {
            this.setVoltageColor(g, this.volts[i]);
            CircuitElm.drawThickLine(g, this.posts[i], this.inner[i]);
        }

        if (this.voltageL != null) {
            for (let i = 0; i !== segments; i++) {
                const ix1 = (ix0 - Math.trunc(this.lenSteps * i / segments)) % this.lenSteps;
                const ix2 = (ix0 - Math.trunc(this.lenSteps * (segments - 1 - i) / segments)) % this.lenSteps;
                const v = (this.voltageL[ix1] + this.voltageR[ix2]) / 2;
                this.setVoltageColor(g, v);
                this.interpPoint(this.inner[0], this.inner[1], CircuitElm.ps1, i * segf);
                this.interpPoint(this.inner[2], this.inner[3], CircuitElm.ps2, i * segf);
                g.drawLine(CircuitElm.ps1.x, CircuitElm.ps1.y, CircuitElm.ps2.x, CircuitElm.ps2.y);
                this.interpPoint(this.inner[2], this.inner[3], CircuitElm.ps1, (i + 1) * segf);
                CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
            }
        }

        this.setVoltageColor(g, this.volts[0]);
        CircuitElm.drawThickLine(g, this.inner[0], this.inner[1]);
        this.drawPosts(g);

        this.curCount1 = this.updateDotCountImpl(-this.current1, this.curCount1);
        this.curCount2 = this.updateDotCountImpl(this.current2, this.curCount2);
        if (!this.isCreating()) {
            this.drawDots(g, this.posts[0], this.inner[0], this.curCount1);
            this.drawDots(g, this.posts[2], this.inner[2], -this.curCount1);
            this.drawDots(g, this.posts[1], this.inner[1], -this.curCount2);
            this.drawDots(g, this.posts[3], this.inner[3], this.curCount2);
        }
    }

    setVoltageSource(n: number, v: VoltageSource): void {
        if (n === 0) {
            this.voltSource1 = v;
            v.setNodes(this.nodes[4], this.nodes[0]);
        } else {
            this.voltSource2 = v;
            v.setNodes(this.nodes[5], this.nodes[1]);
        }
    }

    setCurrent(vs: VoltageSource, c: number): void {
        if (vs === this.voltSource1)
            this.current1 = c;
        else
            this.current2 = c;
    }

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(this.nodes[4], this.nodes[0], this.voltSource1);
        CircuitElm.sim.stampVoltageSource(this.nodes[5], this.nodes[1], this.voltSource2);
        CircuitElm.sim.stampResistor(this.nodes[2], this.nodes[4], this.imped);
        CircuitElm.sim.stampResistor(this.nodes[3], this.nodes[5], this.imped);
    }

    startIteration(): void {
        if (this.voltageL == null) {
            CircuitElm.sim.stop("Transmission line delay too large!", this);
            return;
        }
        this.voltageL[this.ptr] = this.volts[2] - this.volts[0] + this.volts[2] - this.volts[4];
        this.voltageR[this.ptr] = this.volts[3] - this.volts[1] + this.volts[3] - this.volts[5];
    }

    doStep(): void {
        if (this.voltageL == null) {
            CircuitElm.sim.stop("Transmission line delay too large!", this);
            return;
        }
        const nextPtr = (this.ptr + 1) % this.lenSteps;
        CircuitElm.sim.updateVoltageSource(this.nodes[4], this.nodes[0], this.voltSource1, -this.voltageR![nextPtr]);
        CircuitElm.sim.updateVoltageSource(this.nodes[5], this.nodes[1], this.voltSource2, -this.voltageL[nextPtr]);
        if (Math.abs(this.volts[0]) > 1e-5 || Math.abs(this.volts[1]) > 1e-5) {
            CircuitElm.sim.stop("Need to ground transmission line!", this);
            return;
        }
    }

    stepFinished(): void {
        if (CircuitElm.sim.timeStepCount === this.lastStepCount)
            return;
        this.lastStepCount = CircuitElm.sim.timeStepCount;
        this.ptr = (this.ptr + 1) % this.lenSteps;
    }

    getPost(n: number): Point { return this.posts[n]; }

    getVoltageSourceCount(): number { return 2; }
    hasGroundConnection(n1: number): boolean { return false; }
    getConnection(n1: number, n2: number): boolean { return false; }

    getMatrixConnection(n1: number, n2: number): boolean {
        // odd nodes == right side, even nodes == left side
        return (n1 % 2) === (n2 % 2);
    }

    getInfo(arr: string[]): void {
        arr[0] = "transmission line";
        arr[1] = CircuitElm.getUnitText(this.imped, Locale.ohmString);
        // use velocity factor for RG-58 cable (65%)
        arr[2] = "length = " + CircuitElm.getUnitText(0.65 * 2.9979e8 * this.delay, "m");
        arr[3] = "delay = " + CircuitElm.getUnitText(this.delay, "s");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Delay (s)", this.delay, 0, 0).setPositive();
        if (n === 1)
            return new EditInfo("Impedance (ohms)", this.imped, 0, 0).setPositive();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0) {
            this.delay = ei.value;
            this.reset();
        }
        if (n === 1 && ei.value > 0) {
            this.imped = ei.value;
            this.reset();
        }
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0) return this.current1;
        if (n === 2) return -this.current1;
        if (n === 3) return -this.current2;
        return this.current2;
    }

    canFlipX(): boolean { return this.dy === 0; }
    canFlipY(): boolean { return this.dx === 0; }
}
