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
import { Color } from "./Color";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { WireRouter } from "./WireRouter";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class SweepElm extends CircuitElm {
    maxV: number;
    maxF: number;
    minF: number;
    sweepTime: number;
    frequency: number;
    static readonly FLAG_LOG = 1;
    static readonly FLAG_BIDIR = 2;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.minF = 20; this.maxF = 4000;
            this.maxV = 5;
            this.sweepTime = .1;
            this.flags = SweepElm.FLAG_BIDIR;
            this.reset();
        } else {
            super(xa, ya, xb, yb!, f!);
            this.minF = parseFloat(st!.nextToken());
            this.maxF = parseFloat(st!.nextToken());
            this.maxV = parseFloat(st!.nextToken());
            this.sweepTime = parseFloat(st!.nextToken());
            this.reset();
        }
    }

    getDumpType(): number { return 170; }
    getXmlDumpType(): string { return "sw"; }
    getPostCount(): number { return 1; }
    readonly circleSize = 17;

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "mi", this.minF);
        CircuitXMLSerializer.dumpAttr(elem, "ma", this.maxF);
        CircuitXMLSerializer.dumpAttr(elem, "mv", this.maxV);
        CircuitXMLSerializer.dumpAttr(elem, "sw", this.sweepTime);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.minF = xml.parseDoubleAttr("mi", this.minF);
        this.maxF = xml.parseDoubleAttr("ma", this.maxF);
        this.maxV = xml.parseDoubleAttr("mv", this.maxV);
        this.sweepTime = xml.parseDoubleAttr("sw", this.sweepTime);
        this.reset();
    }

    setPoints(): void {
        super.setPoints();
        this.lead1 = this.interpPoint(this.point1, this.point2, 1 - this.circleSize/this.dn);
    }

    addRoutingObstacle(router: WireRouter): void {
        router.addWire(this.point1.x, this.point1.y, this.lead1!.x, this.lead1!.y);
        router.addObstacle(this.point2.x - this.circleSize, this.point2.y - this.circleSize,
                           this.point2.x + this.circleSize, this.point2.y + this.circleSize);
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.circleSize);
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : Color.gray);
        this.setPowerColor(g, false);
        const xc = this.point2.x; const yc = this.point2.y;
        CircuitElm.drawThickCircle(g, xc, yc, this.circleSize);
        const wl = 8;
        this.adjustBbox(xc - this.circleSize, yc - this.circleSize,
                        xc + this.circleSize, yc + this.circleSize);
        const xl = 10;
        let tm = Date.now();
        tm %= 2000;
        if (tm > 1000)
            tm = 2000 - tm;
        let w = 1 + tm * .002;
        if (CircuitElm.app.simIsRunning())
            w = 1 + 2*(this.frequency - this.minF)/(this.maxF - this.minF);

        g.context.beginPath();
        g.setLineWidth(3.0);
        for (let i = -xl; i <= xl; i++) {
            const yy = yc + Math.round(.95 * Math.sin(i * CircuitElm.pi * w / xl) * wl);
            if (i === -xl)
                g.context.moveTo(xc + i, yy);
            else
                g.context.lineTo(xc + i, yy);
        }
        g.context.stroke();
        g.setLineWidth(1.0);

        if (this.showValues()) {
            const s = CircuitElm.getShortUnitText(this.frequency, "Hz");
            if (this.dx === 0 || this.dy === 0)
                this.drawValues(g, s, this.circleSize);
        }

        this.drawPosts(g);
        this.curcount = this.updateDotCountImpl(-this.current, this.curcount);
        if (!this.isCreating())
            this.drawDots(g, this.point1, this.lead1!, this.curcount);
    }

    validate(): boolean { return this.validateRailNode(0); }

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[0], this.voltSource);
    }

    fadd: number = 0;
    fmul: number = 1;
    freqTime: number = 0;
    savedTimeStep: number = 0;
    dir: number = 1;
    v: number = 0;

    setParams(): void {
        if (this.frequency < this.minF || this.frequency > this.maxF) {
            this.frequency = this.minF;
            this.freqTime = 0;
            this.dir = 1;
        }
        if ((this.flags & SweepElm.FLAG_LOG) === 0) {
            this.fadd = this.dir * CircuitElm.sim.timeStep * (this.maxF - this.minF) / this.sweepTime;
            this.fmul = 1;
        } else {
            this.fadd = 0;
            this.fmul = Math.pow(this.maxF/this.minF, this.dir * CircuitElm.sim.timeStep / this.sweepTime);
        }
        this.savedTimeStep = CircuitElm.sim.timeStep;
    }

    reset(): void {
        this.frequency = this.minF;
        this.freqTime = 0;
        this.dir = 1;
        this.setParams();
    }

    startIteration(): void {
        // has timestep been changed?
        if (CircuitElm.sim.timeStep !== this.savedTimeStep)
            this.setParams();
        this.v = Math.sin(this.freqTime) * this.maxV;
        this.freqTime += this.frequency * 2 * CircuitElm.pi * CircuitElm.sim.timeStep;
        this.frequency = this.frequency * this.fmul + this.fadd;
        if (this.frequency >= this.maxF && this.dir === 1) {
            if ((this.flags & SweepElm.FLAG_BIDIR) !== 0) {
                this.fadd = -this.fadd;
                this.fmul = 1/this.fmul;
                this.dir = -1;
            } else
                this.frequency = this.minF;
        }
        if (this.frequency <= this.minF && this.dir === -1) {
            this.fadd = -this.fadd;
            this.fmul = 1/this.fmul;
            this.dir = 1;
        }
    }

    doStep(): void {
        CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[0], this.voltSource, this.v);
    }

    getVoltageDiff(): number { return this.nodes[0].v; }
    getVoltageSourceCount(): number { return 1; }
    hasGroundConnection(n1: number): boolean { return true; }
    isSweepElm(): boolean { return true; }
    getElmType(): string { return "sweep"; }

    getInfo(arr: string[]): void {
        arr[0] = "sweep " + (((this.flags & SweepElm.FLAG_LOG) === 0) ? "(linear)" : "(log)");
        arr[1] = "I = " + CircuitElm.getCurrentDText(this.getCurrent());
        arr[2] = "V = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[3] = "f = " + CircuitElm.getUnitText(this.frequency, "Hz");
        arr[4] = "range = " + CircuitElm.getUnitText(this.minF, "Hz") + " .. " +
            CircuitElm.getUnitText(this.maxF, "Hz");
        arr[5] = "time = " + CircuitElm.getUnitText(this.sweepTime, "s");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Min Frequency (Hz)", this.minF, 0, 0);
        if (n === 1)
            return new EditInfo("Max Frequency (Hz)", this.maxF, 0, 0);
        if (n === 2)
            return new EditInfo("Sweep Time (s)", this.sweepTime, 0, 0);
        if (n === 3) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Logarithmic", (this.flags & SweepElm.FLAG_LOG) !== 0);
            return ei;
        }
        if (n === 4)
            return new EditInfo("Max Voltage", this.maxV, 0, 0);
        if (n === 5) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Bidirectional", (this.flags & SweepElm.FLAG_BIDIR) !== 0);
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        const maxfreq = 1/(8 * CircuitElm.sim.timeStep);
        if (n === 0) {
            this.minF = ei.value;
            if (this.minF > maxfreq)
                this.minF = maxfreq;
        }
        if (n === 1) {
            this.maxF = ei.value;
            if (this.maxF > maxfreq)
                this.maxF = maxfreq;
        }
        if (n === 2)
            this.sweepTime = ei.value;
        if (n === 3) {
            this.flags &= ~SweepElm.FLAG_LOG;
            if (ei.checkbox.getState())
                this.flags |= SweepElm.FLAG_LOG;
        }
        if (n === 4)
            this.maxV = ei.value;
        if (n === 5) {
            this.flags &= ~SweepElm.FLAG_BIDIR;
            if (ei.checkbox.getState())
                this.flags |= SweepElm.FLAG_BIDIR;
        }
        this.setParams();
    }

    getPower(): number { return -this.getVoltageDiff() * this.current; }
}
