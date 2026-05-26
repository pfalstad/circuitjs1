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
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export abstract class GateElm extends CircuitElm {
    static readonly FLAG_SMALL = 1<<0;
    static readonly FLAG_SCHMITT = 1<<1;
    static readonly FLAG_INVERT_INPUTS = 1<<2;
    inputCount: number = 2;
    lastOutput: boolean = false;
    justLoaded: boolean = false;
    highVoltage: number;
    propagationDelay: number = 0; // seconds; 0 = instant (default)
    delayEndTime: number = 0;     // time at which pending output change takes effect
    static lastHighVoltage: number = 5;
    static lastSchmitt: boolean = false;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.noDiagonal = true;
            this.inputCount = 2;
            this.allocNodes();
            this.setupVolts();
            this.highVoltage = GateElm.lastHighVoltage;
            if (GateElm.lastSchmitt)
                this.flags |= GateElm.FLAG_SCHMITT;
            this.setSize(this.useSmallGrid() ? 1 : 2);
        } else {
            super(xa, ya, xb, yb!, f!);
            this.inputCount = parseInt(st!.nextToken());
            const lastOutputVoltage = parseFloat(st!.nextToken());
            this.noDiagonal = true;
            this.highVoltage = 5;
            try {
                this.highVoltage = parseFloat(st!.nextToken());
            } catch (e) {}
            this.lastOutput = lastOutputVoltage > this.highVoltage * .5;
            this.setSize((f! & GateElm.FLAG_SMALL) !== 0 ? 1 : 2);
            this.allocNodes();
            this.setupVolts();
        }
    }

    isInverting(): boolean { return false; }
    isXorGateElm(): boolean { return false; }

    gsize: number = 0;
    gwidth: number = 0;
    gwidth2: number = 0;
    gheight: number = 0;
    hs2: number = 0;

    setSize(s: number): void {
        this.gsize = s;
        this.gwidth = 7*s;
        this.gwidth2 = 14*s;
        this.gheight = 8*s;
        this.flags &= ~GateElm.FLAG_SMALL;
        this.flags |= (s === 1) ? GateElm.FLAG_SMALL : 0;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        if (this.highVoltage !== 5)
            CircuitXMLSerializer.dumpAttr(elem, "hi", this.highVoltage);
        if (this.inputCount !== 2)
            CircuitXMLSerializer.dumpAttr(elem, "in", this.inputCount);
        if (this.propagationDelay !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "pd", this.propagationDelay);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        if (this.nodes[this.inputCount].v !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "o", this.nodes[this.inputCount].v);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.flags = 0; // SMALL might have gotten set
        super.undumpXml(xml);
        this.highVoltage = xml.parseDoubleAttr("hi", this.highVoltage);
        this.inputCount = xml.parseIntAttr("in", this.inputCount);
        this.propagationDelay = xml.parseDoubleAttr("pd", 0);
        const lastOutputVoltage = xml.parseDoubleAttr("o", 0);
        this.lastOutput = lastOutputVoltage > this.highVoltage * .5;
        this.setSize((this.flags & GateElm.FLAG_SMALL) !== 0 ? 1 : 2);
        this.allocNodes();
        this.setupVolts();
    }

    addRoutingObstacle(router: WireRouter): void {
        // add wires from each input post to gate body
        for (let i = 0; i < this.inputCount; i++)
            router.addWire(this.inPosts[i].x, this.inPosts[i].y, this.inGates[i].x, this.inGates[i].y);
        // add output wire
        router.addWire(this.lead2!.x, this.lead2!.y, this.point2.x, this.point2.y);

        const leadDist = CircuitElm.distance(this.lead1!, this.lead2!);
        const hs2 = this.gwidth * (this.inputCount/2 + 1);
        const pa = this.interpPoint(this.lead1!, this.lead2!, -8/leadDist, hs2) as Point;
        const pb = this.interpPoint(this.lead1!, this.lead2!, 1, -hs2) as Point;
        router.addObstacle(pa.x, pa.y, pb.x, pb.y);
    }

    getXmlDumpType(): string { return this.getClassName().replace("GateElm", ""); }

    inPosts: Point[];
    inGates: Point[];
    inputStates: boolean[];
    ww: number = 0;

    setPoints(): void {
        super.setPoints();
        this.inputStates = new Array(this.inputCount).fill(false);
        if (this.dn > 150 && this.isCreating())
            this.setSize(2);
        const hs = this.gheight;
        this.ww = this.gwidth2;
        if (this.ww > this.dn/2)
            this.ww = Math.trunc(this.dn/2);
        if (this.isInverting() && this.ww + 8 > this.dn/2)
            this.ww = Math.trunc(this.dn/2 - 8);
        this.calcLeads(this.ww*2);
        this.inPosts = this.newPointArray(this.inputCount);
        this.inGates = this.newPointArray(this.inputCount);
        let i0 = -Math.trunc(this.inputCount/2);
        if (this.hasFlag(GateElm.FLAG_INVERT_INPUTS))
            this.icircles = this.newPointArray(this.inputCount);
        else
            this.icircles = null;
        for (let i = 0; i !== this.inputCount; i++, i0++) {
            if (i0 === 0 && (this.inputCount & 1) === 0)
                i0++;
            const adj = this.getLeadAdjustment(i);
            this.interpPoint(this.point1, this.point2, this.inPosts[i], 0, hs*i0);
            this.interpPoint(this.lead1!, this.lead2!, this.inGates[i],
                this.icircles !== null ? -8/(this.ww*2.) + adj : adj, hs*i0);
            if (this.icircles !== null)
                this.interpPoint(this.lead1!, this.lead2!, this.icircles[i], -4/(this.ww*2.), hs*i0);
        }
        this.hs2 = this.gwidth * (Math.trunc(this.inputCount/2) + 1);
        this.setBbox(this.point1, this.point2, this.hs2);
        if (this.hasSchmittInputs())
            this.schmittPoly = this.getSchmittPolygon(this.gsize, .47);
    }

    setupVolts(): void {
        this.justLoaded = true;
	console.log('setupvolts', this.lastOutput);
    }

    getLeadAdjustment(ix: number): number { return 0; }

    createEuroGatePolygon(): void {
        const pts = this.newPointArray(4);
        this.interpPoint2(this.lead1!, this.lead2!, pts[0], pts[1], 0, this.hs2);
        this.interpPoint2(this.lead1!, this.lead2!, pts[3], pts[2], 1, this.hs2);
        this.gatePoly = this.createPolygon(pts);
    }

    getGateText(): string | null { return null; }
    static useEuroGates(): boolean { return CircuitElm.app.menus.euroGatesCheckItem.getState(); }

    drawGatePolygon(g: Graphics): void {
        CircuitElm.drawThickPolygon(g, this.gatePoly);
    }

    draw(g: Graphics): void {
        for (let i = 0; i !== this.inputCount; i++) {
            this.setVoltageColor(g, this.nodes[i].v);
            CircuitElm.drawThickLine(g, this.inPosts[i], this.inGates[i]);
        }
        this.setVoltageColor(g, this.nodes[this.inputCount].v);
        CircuitElm.drawThickLine(g, this.lead2!, this.point2);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        if (GateElm.useEuroGates()) {
            CircuitElm.drawThickPolygon(g, this.gatePoly);
            const center = this.interpPoint(this.point1, this.point2, .5) as Point;
            this.drawCenteredText(g, this.getGateText()!, center.x, center.y - 6*this.gsize, true);
        } else
            this.drawGatePolygon(g);
        g.setLineWidth(2);
        if (this.hasSchmittInputs())
            CircuitElm.drawPolygon(g, this.schmittPoly);
        g.setLineWidth(1);
        if (this.linePoints !== null)
            for (let i = 0; i !== this.linePoints!.length - 1; i++)
                CircuitElm.drawThickLine(g, this.linePoints![i], this.linePoints![i+1]);
        if (this.isInverting())
            CircuitElm.drawThickCircle(g, this.pcircle!.x, this.pcircle!.y, 3);
        if (this.icircles !== null)
            for (let i = 0; i !== this.inputCount; i++)
                CircuitElm.drawThickCircle(g, this.icircles[i].x, this.icircles[i].y, 3);
        this.curcount = this.updateDotCountImpl(this.current, this.curcount);
        this.drawDots(g, this.lead2!, this.point2, this.curcount);
        this.drawPosts(g);
    }

    gatePoly: Polygon;
    schmittPoly: Polygon;
    pcircle: Point | null = null;
    linePoints: Point[] | null = null;
    icircles: Point[] | null = null;

    getPostCount(): number { return this.inputCount + 1; }
    getPost(n: number): Point | null {
        if (n === this.inputCount)
            return this.point2;
        return this.inPosts[n];
    }
    getVoltageSourceCount(): number { return 1; }

    abstract getGateName(): string;
    abstract calcFunction(): boolean;

    getInfo(arr: string[]): void {
        arr[0] = this.getGateName();
        arr[1] = "Vout = " + CircuitElm.getVoltageText(this.nodes[this.inputCount].v);
        arr[2] = "Iout = " + CircuitElm.getCurrentText(this.getCurrent());
        if (this.propagationDelay > 0)
            arr[3] = "delay = " + CircuitElm.getUnitText(this.propagationDelay, "s");
    }

    setHighVoltage(hv: number): void { this.highVoltage = hv; }

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[this.inputCount], this.voltSource);
    }

    hasSchmittInputs(): boolean { return (this.flags & GateElm.FLAG_SCHMITT) !== 0; }

    getInput(x: number): boolean {
        const high = !this.hasFlag(GateElm.FLAG_INVERT_INPUTS);
        if (!this.hasSchmittInputs())
            return (this.nodes[x].v > this.highVoltage * .5) ? high : !high;
        const res = this.nodes[x].v > this.highVoltage * (this.inputStates[x] ? .35 : .55);
        this.inputStates[x] = res;
	console.log('node', x, this.nodes[x].index, res);
        return res ? high : !high;
    }

    oscillationCount: number = 0;
    lastTime: number = 0;

    doStep(): void {
        if (this.justLoaded) {
            this.justLoaded = false;
            CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[this.inputCount], this.voltSource,
                this.lastOutput ? this.highVoltage : 0);
	    console.log('updated voltage', this.lastOutput, this);
            return;
        }

        let f = this.calcFunction();
        if (this.isInverting())
            f = !f;

        if (this.propagationDelay === 0 && this.lastTime !== CircuitElm.sim.t) {
            // detect oscillation (using same strategy as Atanua)
            if (this.lastOutput === !f) {
                if (this.oscillationCount++ > 50) {
                    // output is oscillating too much, randomly leave output the same
                    this.oscillationCount = 0;
                    if (CircuitElm.app.getrand(10) > 5)
                        f = this.lastOutput;
                }
            } else
                this.oscillationCount = 0;

            this.lastTime = CircuitElm.sim.t;
        }

        // apply propagation delay if configured
        if (this.propagationDelay > 0) {
            if (f !== this.lastOutput) {
                // desired output differs from current output
                if (this.delayEndTime === 0)
                    // start the delay timer on first detection of change
                    this.delayEndTime = CircuitElm.sim.t + this.propagationDelay;
                else if (CircuitElm.sim.t >= this.delayEndTime) {
                    // delay has elapsed, apply the change
                    this.lastOutput = f;
                    this.delayEndTime = 0;
                }
            } else {
                // output matches desired; cancel any pending delay
                this.delayEndTime = 0;
            }
        } else {
            this.lastOutput = f;
        }

        const res = this.lastOutput ? this.highVoltage : 0;
	console.log('res = ', this, this.nodes[0].v, this.nodes[1].v, res);
        CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[this.inputCount], this.voltSource, res);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Inputs", this.inputCount, 1, 8).setDimensionless();
        if (n === 1)
            return new EditInfo("High Logic Voltage", this.highVoltage, 1, 10);
        if (n === 2)
            return EditInfo.createCheckbox("Schmitt Inputs", this.hasSchmittInputs());
        if (n === 3)
            return EditInfo.createCheckbox("Invert Inputs", this.hasFlag(GateElm.FLAG_INVERT_INPUTS));
        if (n === 4)
            return new EditInfo("Propagation Delay (s)", this.propagationDelay, 0, 0);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 1) {
                this.inputCount = Math.trunc(ei.value);
                this.allocNodes();
                this.setupVolts();
                this.setPoints();
            } else
                ei.setError("must be >= 1");
        }
        if (n === 1)
            this.highVoltage = GateElm.lastHighVoltage = ei.value;
        if (n === 2) {
            if (ei.checkbox.getState())
                this.flags |= GateElm.FLAG_SCHMITT;
            else
                this.flags &= ~GateElm.FLAG_SCHMITT;
            GateElm.lastSchmitt = this.hasSchmittInputs();
            this.setPoints();
        }
        if (n === 3) {
            this.flags = ei.changeFlag(this.flags, GateElm.FLAG_INVERT_INPUTS);
            this.setPoints();
        }
        if (n === 4)
            this.propagationDelay = ei.value;
    }

    validate(): boolean { return this.validateRailNode(this.inputCount); }
    getConnection(n1: number, n2: number): boolean { return false; }
    hasGroundConnection(n1: number): boolean { return (n1 === this.inputCount); }

    getCurrentIntoNode(n: number): number {
        if (n === this.inputCount)
            return this.current;
        return 0;
    }
}

export class AndGateElm extends GateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }

    getGateText(): string { return "&"; }

    drawGatePolygon(g: Graphics): void {
        g.setLineWidth(3.0);
        g.context.beginPath();
        g.context.moveTo(this.gatePoly.xpoints[0], this.gatePoly.ypoints[0]);
        let ang1 = -Math.PI/2 * CircuitElm.sign(this.dx);
        let ang2 =  Math.PI/2 * CircuitElm.sign(this.dx);
        const ccw = false;
        let rx = this.ww;
        let ry = this.hs2;
        if (this.dx === 0) {
            ang1 = (this.dy > 0) ? 0 : Math.PI;
            ang2 = (this.dy > 0) ? Math.PI : 0;
            rx = this.hs2;
            ry = this.ww;
        }
        g.context.ellipse(this.gatePoly.xpoints[2], this.gatePoly.ypoints[2], rx, ry, 0, ang1, ang2, ccw);
        g.context.lineTo(this.gatePoly.xpoints[4], this.gatePoly.ypoints[4]);
        g.context.closePath();
        g.context.stroke();
        g.setLineWidth(1.0);
    }

    setPoints(): void {
        super.setPoints();
        if (GateElm.useEuroGates()) {
            this.createEuroGatePolygon();
        } else {
            // 0=topleft, 1=top of curve, 2=center, 3=bottom of curve, 4=bottom left
            const triPoints = this.newPointArray(5);
            this.interpPoint2(this.lead1!, this.lead2!, triPoints[0], triPoints[4], 0, this.hs2);
            this.interpPoint2(this.lead1!, this.lead2!, triPoints[1], triPoints[3], .5, this.hs2);
            this.interpPoint(this.lead1!, this.lead2!, triPoints[2], .5);
            this.gatePoly = this.createPolygon(triPoints);
        }
        if (this.isInverting()) {
            this.pcircle = this.interpPoint(this.point1, this.point2, .5 + (this.ww+4)/this.dn) as Point;
            this.lead2 = this.interpPoint(this.point1, this.point2, .5 + (this.ww+8)/this.dn);
        }
    }

    getGateName(): string { return "AND gate"; }
    calcFunction(): boolean {
        let f = true;
        for (let i = 0; i !== this.inputCount; i++)
            f = f && this.getInput(i);
        return f;
    }
    getDumpType(): number { return 150; }
    getShortcut(): number { return '2'.charCodeAt(0); }
}

export class NandGateElm extends AndGateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }
    isInverting(): boolean { return true; }
    getGateName(): string { return "NAND gate"; }
    getDumpType(): number { return 151; }
    getShortcut(): number { return '@'.charCodeAt(0); }
}

export class OrGateElm extends GateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }

    getGateName(): string { return "OR gate"; }

    drawGatePolygon(g: Graphics): void {
        g.setLineWidth(3.0);
        g.context.beginPath();
        g.context.moveTo(this.gatePoly.xpoints[0], this.gatePoly.ypoints[0]);
        g.context.lineTo(this.gatePoly.xpoints[1], this.gatePoly.ypoints[1]);
        g.context.bezierCurveTo(
            this.gatePoly.xpoints[2], this.gatePoly.ypoints[2],
            this.gatePoly.xpoints[2], this.gatePoly.ypoints[2],
            this.gatePoly.xpoints[3], this.gatePoly.ypoints[3]);
        g.context.bezierCurveTo(
            this.gatePoly.xpoints[4], this.gatePoly.ypoints[4],
            this.gatePoly.xpoints[4], this.gatePoly.ypoints[4],
            this.gatePoly.xpoints[5], this.gatePoly.ypoints[5]);
        g.context.lineTo(this.gatePoly.xpoints[6], this.gatePoly.ypoints[6]);
        g.context.bezierCurveTo(
            this.gatePoly.xpoints[7], this.gatePoly.ypoints[7],
            this.gatePoly.xpoints[7], this.gatePoly.ypoints[7],
            this.gatePoly.xpoints[0], this.gatePoly.ypoints[0]);
        g.context.closePath();

        if (this.isXorGateElm()) {
            g.context.moveTo(this.gatePoly.xpoints[8], this.gatePoly.ypoints[8]);
            g.context.bezierCurveTo(
                this.gatePoly.xpoints[10], this.gatePoly.ypoints[10],
                this.gatePoly.xpoints[10], this.gatePoly.ypoints[10],
                this.gatePoly.xpoints[9], this.gatePoly.ypoints[9]);
        }

        g.context.stroke();
        g.setLineWidth(1.0);
    }

    getLeadAdjustment(ix: number): number {
        if (GateElm.useEuroGates())
            return 0;
        if (this.inputCount > 3 && (ix === 0 || ix === this.inputCount-1))
            return -.05;
        if (this.inputCount > 7 && (ix === 1 || ix === this.inputCount-2))
            return -.05;
        if (this.inputCount >= 12 && (ix === 2 || ix === this.inputCount-3))
            return -.05;
        return 0;
    }

    setPoints(): void {
        super.setPoints();
        if (GateElm.useEuroGates()) {
            this.createEuroGatePolygon();
            this.linePoints = null;
        } else {
            // 0=top left, 1=start of top curve, 2=control point for top curve
            // 3=right, 4=control point for bottom curve, 5=start of bottom curve,
            // 6=bottom left, 7=control point for left curve
            const triPoints = this.newPointArray(11);
            this.interpPoint2(this.lead1!, this.lead2!, triPoints[0], triPoints[6], -.05, this.hs2);
            this.interpPoint2(this.lead1!, this.lead2!, triPoints[1], triPoints[5], .3, this.hs2);
            triPoints[3] = this.lead2!;
            this.interpPoint2(this.lead1!, this.lead2!, triPoints[2], triPoints[4], .7, this.hs2*.81);
            this.interpPoint(this.lead1!, this.lead2!, triPoints[7], .08);

            if (this.isXorGateElm()) {
                const ww2 = (this.ww === 0) ? this.dn*2 : this.ww*2;
                this.interpPoint2(this.lead1!, this.lead2!, triPoints[8], triPoints[9], -.05 - 5/ww2, this.hs2);
                this.interpPoint(this.lead1!, this.lead2!, triPoints[10], .08 - 5/ww2);
            }

            this.gatePoly = this.createPolygon(triPoints);
        }
        if (this.isInverting()) {
            this.pcircle = this.interpPoint(this.point1, this.point2, .5 + (this.ww+4)/this.dn) as Point;
            this.lead2 = this.interpPoint(this.point1, this.point2, .5 + (this.ww+8)/this.dn);
        }
    }

    getGateText(): string { return "≥1"; }

    calcFunction(): boolean {
        let f = false;
        for (let i = 0; i !== this.inputCount; i++)
            f = f || this.getInput(i);
        return f;
    }
    getDumpType(): number { return 152; }
    getShortcut(): number { return '3'.charCodeAt(0); }
}

export class NorGateElm extends OrGateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }
    getGateName(): string { return "NOR gate"; }
    isInverting(): boolean { return true; }
    getDumpType(): number { return 153; }
    getShortcut(): number { return '#'.charCodeAt(0); }
}

export class XorGateElm extends OrGateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }
    getGateName(): string { return "XOR gate"; }
    getGateText(): string { return "=1"; }
    isXorGateElm(): boolean { return true; }
    calcFunction(): boolean {
        let f = false;
        for (let i = 0; i !== this.inputCount; i++)
            f = f !== this.getInput(i);
        return f;
    }
    // skip "Invert Inputs" (index 3 in GateElm); shift higher indices down
    getEditInfo(n: number): EditInfo | null {
        if (n >= 3) return super.getEditInfo(n + 1);
        return super.getEditInfo(n);
    }
    setEditValue(n: number, ei: EditInfo): void {
        if (n >= 3) super.setEditValue(n + 1, ei);
        else super.setEditValue(n, ei);
    }
    getDumpType(): number { return 154; }
    getShortcut(): number { return '4'.charCodeAt(0); }
}

export class XnorGateElm extends XorGateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }
    getGateName(): string { return "XNOR gate"; }
    isInverting(): boolean { return true; }
    getDumpType(): number { return 431; }
    getShortcut(): number { return '$'.charCodeAt(0); }
}
