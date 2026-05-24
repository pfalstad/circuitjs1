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
import { Inductor } from "./Inductor";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { XMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";

export class TransformerElm extends CircuitElm {
    inductance: number;
    ratio: number;
    couplingCoef: number;
    saturationCurrent: number; // 0 = disabled (linear core)
    ptEnds: Point[];
    ptCoil: Point[];
    ptCore: Point[];
    currents: number[];
    curcounts: number[];
    dots: Point[] | null;
    width: number;
    polarity: number;
    flip: number;
    static readonly FLAG_REVERSE = 4;
    static readonly FLAG_VERTICAL = 8;
    static readonly FLAG_FLIP = 16;

    a1: number;
    a2: number;
    a3: number;
    a4: number;
    curSourceValue1: number;
    curSourceValue2: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.inductance = 4;
            this.ratio = this.polarity = 1;
            this.width = 32;
            this.noDiagonal = true;
            this.couplingCoef = .999;
            this.currents  = new Array(2).fill(0);
            this.curcounts = new Array(2).fill(0);
	    this.curSourceValue1 = this.curSourceValue2 = this.a1 = this.a2 = this.a3 = this.a4 = 0;
        } else {
            super(xa, ya, xb, yb!, f!);
            if (this.hasFlag(TransformerElm.FLAG_VERTICAL))
                this.width = -Math.max(32, Math.abs(xb-xa));
            else
                this.width = Math.max(32, Math.abs(yb!-ya));
            this.inductance = parseFloat(st!.nextToken());
            this.ratio = parseFloat(st!.nextToken());
            this.currents  = new Array(2).fill(0);
            this.curcounts = new Array(2).fill(0);
            this.currents[0] = parseFloat(st!.nextToken());
            this.currents[1] = parseFloat(st!.nextToken());
            this.couplingCoef = .999;
	    this.curSourceValue1 = this.curSourceValue2 = this.a1 = this.a2 = this.a3 = this.a4 = 0;
            try {
                this.couplingCoef = parseFloat(st!.nextToken());
                this.saturationCurrent = parseFloat(st!.nextToken());
            } catch (e) { }
            this.noDiagonal = true;
            this.polarity = (this.hasFlag(TransformerElm.FLAG_REVERSE)) ? -1 : 1;
        }
    }

    getDumpType(): number { return 'T'.charCodeAt(0); }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        XMLSerializer.dumpAttr(elem, "in", this.inductance);
        XMLSerializer.dumpAttr(elem, "ra", this.ratio);
        XMLSerializer.dumpAttr(elem, "co", this.couplingCoef);
        XMLSerializer.dumpAttr(elem, "wi", this.width);
        if (this.saturationCurrent !== 0)
            XMLSerializer.dumpAttr(elem, "isat", this.saturationCurrent);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        XMLSerializer.dumpAttr(elem, "c0", this.currents[0]);
        XMLSerializer.dumpAttr(elem, "c1", this.currents[1]);
    }

    undumpXml(xml: XMLDeserializer): void {
        super.undumpXml(xml);

        if (this.hasFlag(TransformerElm.FLAG_VERTICAL))
            this.width = -Math.max(32, Math.abs(this.x2-this.x));
        else
            this.width = Math.max(32, Math.abs(this.y2-this.y));

        this.inductance = xml.parseDoubleAttr("in", this.inductance);
        this.ratio = xml.parseDoubleAttr("ra", this.ratio);
        this.couplingCoef = xml.parseDoubleAttr("co", this.couplingCoef);
        this.width = xml.parseIntAttr("wi", this.width);
        this.saturationCurrent = xml.parseDoubleAttr("isat", 0);
        this.currents[0] = xml.parseDoubleAttr("c0", 0);
        this.currents[1] = xml.parseDoubleAttr("c1", 0);
        this.polarity = (this.hasFlag(TransformerElm.FLAG_REVERSE)) ? -1 : 1;
    }

    nonLinear(): boolean { return this.saturationCurrent > 0; }
    isTrapezoidal(): boolean { return (this.flags & Inductor.FLAG_BACK_EULER) === 0; }

    draw(g: Graphics): void {
        let i: number;
        for (i = 0; i !== 4; i++) {
            this.setVoltageColor(g, this.volts[i]);
            CircuitElm.drawThickLine(g, this.ptEnds[i], this.ptCoil[i]);
        }
        for (i = 0; i !== 2; i++) {
            this.setPowerColor(g, this.currents[i]*(this.volts[i]-this.volts[i+2]));
            let csign = this.dsign*(i === 1 ? -6*this.polarity : 6)*this.flip;
            if (this.hasFlag(TransformerElm.FLAG_VERTICAL))
                csign *= -1;
            this.drawCoil(g, csign, this.ptCoil[i], this.ptCoil[i+2], this.volts[i], this.volts[i+2]);
        }
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        for (i = 0; i !== 2; i++) {
            CircuitElm.drawThickLine(g, this.ptCore[i], this.ptCore[i+2]);
            if (this.dots !== null)
                g.fillOval(this.dots[i].x-2, this.dots[i].y-2, 5, 5);
            this.curcounts[i] = this.updateDotCountImpl(this.currents[i], this.curcounts[i]);
        }
        for (i = 0; i !== 2; i++) {
            this.drawDots(g, this.ptEnds[i],   this.ptCoil[i],    this.curcounts[i]);
            this.drawDots(g, this.ptCoil[i],   this.ptCoil[i+2],  this.curcounts[i]);
            this.drawDots(g, this.ptEnds[i+2], this.ptCoil[i+2],  -this.curcounts[i]);
        }
        this.drawPosts(g);
        this.setBbox(this.ptEnds[0], this.ptEnds[this.polarity === 1 ? 3 : 1], 0);
    }

    setPoints(): void {
        super.setPoints();
        if (this.hasFlag(TransformerElm.FLAG_VERTICAL))
            this.point2.x = this.point1.x;
        else
            this.point2.y = this.point1.y;
        this.ptEnds = this.newPointArray(4);
        this.ptCoil = this.newPointArray(4);
        this.ptCore = this.newPointArray(4);
        this.ptEnds[0] = this.point1;
        this.ptEnds[1] = this.point2;
        this.flip = this.hasFlag(TransformerElm.FLAG_FLIP) ? -1 : 1;
        this.interpPoint(this.point1, this.point2, this.ptEnds[2], 0, -this.dsign*this.width*this.flip);
        this.interpPoint(this.point1, this.point2, this.ptEnds[3], 1, -this.dsign*this.width*this.flip);
        const ce = .5-12/this.dn;
        const cd = .5-2/this.dn;
        let i: number;
        for (i = 0; i !== 4; i += 2) {
            this.interpPoint(this.ptEnds[i], this.ptEnds[i+1], this.ptCoil[i],   ce);
            this.interpPoint(this.ptEnds[i], this.ptEnds[i+1], this.ptCoil[i+1], 1-ce);
            this.interpPoint(this.ptEnds[i], this.ptEnds[i+1], this.ptCore[i],   cd);
            this.interpPoint(this.ptEnds[i], this.ptEnds[i+1], this.ptCore[i+1], 1-cd);
        }
        if (this.polarity === -1) {
            const vsign = (this.hasFlag(TransformerElm.FLAG_VERTICAL)) ? -1 : 1;
            this.dots = new Array(2);
            const dotp = Math.abs(7./this.width);
            this.dots[0] = this.interpPoint(this.ptCoil[0], this.ptCoil[2], dotp, -7*this.dsign*vsign*this.flip);
            this.dots[1] = this.interpPoint(this.ptCoil[3], this.ptCoil[1], dotp, -7*this.dsign*vsign*this.flip);
            let x = this.ptEnds[1]; this.ptEnds[1] = this.ptEnds[3]; this.ptEnds[3] = x;
            x = this.ptCoil[1]; this.ptCoil[1] = this.ptCoil[3]; this.ptCoil[3] = x;
        } else
            this.dots = null;
    }

    getPost(n: number): Point { return this.ptEnds[n]; }
    getPostCount(): number { return 4; }

    reset(): void {
        // need to set current-source values here in case one of the nodes is node 0.  In that case
        // calculateCurrent() may get called (from setNodeVoltage()) when analyzing circuit, before
        // startIteration() gets called
        this.currents[0] = this.currents[1] = this.volts[0] = this.volts[1] = this.volts[2] =
            this.volts[3] = this.curcounts[0] = this.curcounts[1] = this.curSourceValue1 = this.curSourceValue2 = 0;
    }

    // compute effective inductance with saturation: L(I) = L0 / (1 + (I/Isat)^2)
    calcEffectiveInductance(l0: number, i: number, isat: number): number {
        if (isat <= 0) return l0;
        const ratio = i / isat;
        return l0 / (1 + ratio * ratio);
    }

    // compute a1-a4 companion model coefficients from effective inductances
    computeCoefficients(l1: number, l2: number, m: number): void {
        const deti = 1/(l1*l2-m*m);
        const ts = this.isTrapezoidal() ? CircuitElm.sim.timeStep/2 : CircuitElm.sim.timeStep;
        this.a1 = l2*deti*ts;
        this.a2 = -m*deti*ts;
        this.a3 = -m*deti*ts;
        this.a4 = l1*deti*ts;
    }

    stamp(): void {
        // equations for transformer:
        //   v1 = L1 di1/dt + M  di2/dt
        //   v2 = M  di1/dt + L2 di2/dt
        // we invert that to get:
        //   di1/dt = a1 v1 + a2 v2
        //   di2/dt = a3 v1 + a4 v2
        // integrate di1/dt using trapezoidal approx and we get:
        //   i1(t2) = i1(t1) + dt/2 (i1(t1) + i1(t2))
        //          = i1(t1) + a1 dt/2 v1(t1) + a2 dt/2 v2(t1) +
        //                     a1 dt/2 v1(t2) + a2 dt/2 v2(t2)
        // the norton equivalent of this for i1 is:
        //  a. current source, I = i1(t1) + a1 dt/2 v1(t1) + a2 dt/2 v2(t1)
        //  b. resistor, G = a1 dt/2
        //  c. current source controlled by voltage v2, G = a2 dt/2
        // and for i2:
        //  a. current source, I = i2(t1) + a3 dt/2 v1(t1) + a4 dt/2 v2(t1)
        //  b. resistor, G = a3 dt/2
        //  c. current source controlled by voltage v2, G = a4 dt/2
        //
        // For backward euler,
        //
        //   i1(t2) = i1(t1) + a1 dt v1(t2) + a2 dt v2(t2)
        //
        // So the current source value is just i1(t1) and we use
        // dt instead of dt/2 for the resistor and VCCS.
        //
        // first winding goes from node 0 to 2, second is from 1 to 3
        const l1 = this.inductance;
        const l2 = this.inductance*this.ratio*this.ratio;
        const m = this.couplingCoef*Math.sqrt(l1*l2);
        this.computeCoefficients(l1, l2, m);
        if (this.saturationCurrent > 0) {
            // nonlinear: conductances will be stamped in doStep()
            CircuitElm.sim.stampNonLinear(this.nodes[0]);
            CircuitElm.sim.stampNonLinear(this.nodes[1]);
            CircuitElm.sim.stampNonLinear(this.nodes[2]);
            CircuitElm.sim.stampNonLinear(this.nodes[3]);
        } else {
            // linear: stamp fixed conductances and VCCSes
            CircuitElm.sim.stampConductance(this.nodes[0], this.nodes[2], this.a1);
            CircuitElm.sim.stampVCCurrentSource(this.nodes[0], this.nodes[2], this.nodes[1], this.nodes[3], this.a2);
            CircuitElm.sim.stampVCCurrentSource(this.nodes[1], this.nodes[3], this.nodes[0], this.nodes[2], this.a3);
            CircuitElm.sim.stampConductance(this.nodes[1], this.nodes[3], this.a4);
        }
        CircuitElm.sim.stampRightSide(this.nodes[0]);
        CircuitElm.sim.stampRightSide(this.nodes[1]);
        CircuitElm.sim.stampRightSide(this.nodes[2]);
        CircuitElm.sim.stampRightSide(this.nodes[3]);
    }

    startIteration(): void {
        if (this.saturationCurrent > 0) {
            // recompute coefficients with current-dependent inductances
            const l1 = this.calcEffectiveInductance(this.inductance, this.currents[0], this.saturationCurrent);
            const l2 = this.calcEffectiveInductance(this.inductance*this.ratio*this.ratio, this.currents[1],
                this.saturationCurrent*this.ratio);
            const m = this.couplingCoef*Math.sqrt(l1*l2);
            this.computeCoefficients(l1, l2, m);
        }
        const voltdiff1 = this.volts[0]-this.volts[2];
        const voltdiff2 = this.volts[1]-this.volts[3];
        if (this.isTrapezoidal()) {
            this.curSourceValue1 = voltdiff1*this.a1+voltdiff2*this.a2+this.currents[0];
            this.curSourceValue2 = voltdiff1*this.a3+voltdiff2*this.a4+this.currents[1];
        } else {
            this.curSourceValue1 = this.currents[0];
            this.curSourceValue2 = this.currents[1];
        }
    }

    doStep(): void {
        if (this.saturationCurrent > 0) {
            // stamp conductances and VCCSes (matrix was restored to origMatrix)
            CircuitElm.sim.stampConductance(this.nodes[0], this.nodes[2], this.a1);
            CircuitElm.sim.stampVCCurrentSource(this.nodes[0], this.nodes[2], this.nodes[1], this.nodes[3], this.a2);
            CircuitElm.sim.stampVCCurrentSource(this.nodes[1], this.nodes[3], this.nodes[0], this.nodes[2], this.a3);
            CircuitElm.sim.stampConductance(this.nodes[1], this.nodes[3], this.a4);
        }
        CircuitElm.sim.stampCurrentSource(this.nodes[0], this.nodes[2], this.curSourceValue1);
        CircuitElm.sim.stampCurrentSource(this.nodes[1], this.nodes[3], this.curSourceValue2);
    }

    calculateCurrent(): void {
        const voltdiff1 = this.volts[0]-this.volts[2];
        const voltdiff2 = this.volts[1]-this.volts[3];
        this.currents[0] = voltdiff1*this.a1 + voltdiff2*this.a2 + this.curSourceValue1;
        this.currents[1] = voltdiff1*this.a3 + voltdiff2*this.a4 + this.curSourceValue2;
    }

    getCurrentIntoNode(n: number): number {
        if (n < 2)
            return -this.currents[n];
        return this.currents[n-2];
    }

    getInfo(arr: string[]): void {
        arr[0] = (this.saturationCurrent > 0) ? "transformer (sat)" : "transformer";
        arr[1] = "L = " + CircuitElm.getUnitText(this.inductance, "H");
        arr[2] = "Ratio = 1:" + this.ratio;
        arr[3] = "Vd1 = " + CircuitElm.getVoltageText(this.volts[0]-this.volts[2]);
        arr[4] = "Vd2 = " + CircuitElm.getVoltageText(this.volts[1]-this.volts[3]);
        arr[5] = "I1 = " + CircuitElm.getCurrentText(this.currents[0]);
        arr[6] = "I2 = " + CircuitElm.getCurrentText(this.currents[1]);
        if (this.saturationCurrent > 0) {
            const l1Eff = this.calcEffectiveInductance(this.inductance, this.currents[0], this.saturationCurrent);
            arr[7] = "L1eff = " + CircuitElm.getUnitText(l1Eff, "H");
        }
    }

    getConnection(n1: number, n2: number): boolean {
        if (this.comparePair(n1, n2, 0, 2))
            return true;
        if (this.comparePair(n1, n2, 1, 3))
            return true;
        return false;
    }

    // VCCS stamps couple all nodes, so they must all be in the same matrix
    getMatrixConnection(n1: number, n2: number): boolean { return true; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Primary Inductance (H)", this.inductance, .01, 5).setPositive();
        if (n === 1)
            return new EditInfo("Ratio (N1/N2)", 1/this.ratio, 1, 10).setDimensionless().setPositive();
        if (n === 2)
            return new EditInfo("Coupling Coefficient", this.couplingCoef, 0, 1).
                setDimensionless().setPositive();
        if (n === 3) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Trapezoidal Approximation",
                                       this.isTrapezoidal());
            return ei;
        }
        if (n === 4) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Swap Secondary Polarity",
                                       this.polarity === -1);
            return ei;
        }
        if (n === 5)
            return new EditInfo("Saturation Current (A) (0=none)", this.saturationCurrent);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0)
            this.inductance = ei.value;
        if (n === 1 && ei.value > 0)
            this.ratio = 1/ei.value;
        if (n === 2) {
            if (ei.value > 0 && ei.value < 1)
                this.couplingCoef = ei.value;
            else
                ei.setError("must be > 0 and < 1");
        }
        if (n === 3) {
            if (ei.checkbox!.getState())
                this.flags &= ~Inductor.FLAG_BACK_EULER;
            else
                this.flags |= Inductor.FLAG_BACK_EULER;
        }
        if (n === 4) {
            this.polarity = (ei.checkbox!.getState()) ? -1 : 1;
            if (ei.checkbox!.getState())
                this.flags |= TransformerElm.FLAG_REVERSE;
            else
                this.flags &= ~TransformerElm.FLAG_REVERSE;
            this.setPoints();
        }
        if (n === 5) {
            if (ei.value >= 0)
                this.saturationCurrent = ei.value;
            else
                ei.setError("must be >= 0");
        }
    }

    getShortcut(): number { return 'T'.charCodeAt(0); }

    drag(xx: number, yy: number): void {
        xx = this.snapGrid(xx);
        yy = this.snapGrid(yy);
        if (Math.abs(xx-this.x) > Math.abs(yy-this.y)) {
            this.flags &= ~TransformerElm.FLAG_VERTICAL;
        } else
            this.flags |= TransformerElm.FLAG_VERTICAL;
        if (this.hasFlag(TransformerElm.FLAG_VERTICAL))
            this.width = -Math.max(32, Math.abs(xx-this.x));
        else
            this.width = Math.max(32, Math.abs(yy-this.y));
        if (xx === this.x)
            yy = this.y;
        this.x2 = xx; this.y2 = yy;
        this.setPoints();
    }

    flipX(c2: number, count: number): void {
        if (this.hasFlag(TransformerElm.FLAG_VERTICAL))
            this.flags ^= TransformerElm.FLAG_FLIP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        if (!this.hasFlag(TransformerElm.FLAG_VERTICAL))
            this.flags ^= TransformerElm.FLAG_FLIP;
        super.flipY(c2, count);
    }

    flipXY(xmy: number, count: number): void {
        this.flags ^= TransformerElm.FLAG_VERTICAL;
        this.width *= -1;
        super.flipXY(xmy, count);
    }
}
