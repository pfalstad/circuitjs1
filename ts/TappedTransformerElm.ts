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
import { Checkbox } from "./Checkbox";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Inductor } from "./Inductor";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { parseFloatStrict } from "./NumberParse";

export class TappedTransformerElm extends CircuitElm {
    inductance: number;
    ratio: number;
    couplingCoef: number;
    flip: number;
    static readonly FLAG_FLIP = 1;
    ptEnds: Point[];
    ptCoil: Point[];
    ptCore: Point[];
    currents: number[];
    curcounts: number[];
    voltdiff: number[];
    curSourceValue: number[];
    a: number[];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        this.currents  = [0, 0, 0, 0];
        this.curcounts = [0, 0, 0, 0];
        this.voltdiff = [0, 0, 0];
        this.curSourceValue = [0, 0, 0];
        this.a = new Array(9).fill(0);
        if (st !== undefined) {
            this.inductance = parseFloatStrict(st.nextToken());
            this.ratio = parseFloatStrict(st.nextToken());
            this.currents[0] = parseFloatStrict(st.nextToken());
            this.currents[1] = parseFloatStrict(st.nextToken());
            try {
                this.currents[2] = parseFloatStrict(st.nextToken());
            } catch (e) {}
            this.couplingCoef = 0.99;
            try {
                this.couplingCoef = parseFloatStrict(st.nextToken());
            } catch (e) {}
        } else {
            this.inductance = 4;
            this.ratio = 1;
            this.couplingCoef = 0.99;
        }
        this.noDiagonal = true;
    }

    getDumpType(): number { return 169; }
    getXmlDumpType(): string { return "tt"; }

    dump(): string {
        return super.dump() + " " + this.inductance + " " + this.ratio + " " +
            this.currents[0] + " " + this.currents[1] + " " + this.currents[2] + " " + this.couplingCoef;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "in", this.inductance);
        CircuitXMLSerializer.dumpAttr(elem, "ra", this.ratio);
        CircuitXMLSerializer.dumpAttr(elem, "co", this.couplingCoef);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        CircuitXMLSerializer.dumpAttr(elem, "c0", this.currents[0]);
        CircuitXMLSerializer.dumpAttr(elem, "c1", this.currents[1]);
        CircuitXMLSerializer.dumpAttr(elem, "c2", this.currents[2]);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.inductance = xml.parseDoubleAttr("in", this.inductance);
        this.ratio = xml.parseDoubleAttr("ra", this.ratio);
        this.couplingCoef = xml.parseDoubleAttr("co", this.couplingCoef);
        this.currents[0] = xml.parseDoubleAttr("c0", 0);
        this.currents[1] = xml.parseDoubleAttr("c1", 0);
        this.currents[2] = xml.parseDoubleAttr("c2", 0);
    }

    draw(g: Graphics): void {
        for (let i = 0; i !== 5; i++) {
            this.setVoltageColor(g, this.nodes[i].v);
            CircuitElm.drawThickLine(g, this.ptEnds[i], this.ptCoil[i]);
        }
        for (let i = 0; i !== 4; i++) {
            if (i === 1)
                continue;
            this.setPowerColor(g, this.currents[i] * (this.nodes[i].v - this.nodes[i + 1].v));
            this.drawCoil(g, i > 1 ? -6 * this.flip : 6 * this.flip,
                this.ptCoil[i], this.ptCoil[i + 1], this.nodes[i].v, this.nodes[i + 1].v);
        }
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        for (let i = 0; i !== 4; i += 2) {
            CircuitElm.drawThickLine(g, this.ptCore[i], this.ptCore[i + 1]);
        }
        for (let i = 0; i !== 4; i++)
            this.curcounts[i] = this.updateDotCountImpl(this.currents[i], this.curcounts[i]);

        // primary dots
        this.drawDots(g, this.ptEnds[0], this.ptCoil[0], this.curcounts[0]);
        this.drawDots(g, this.ptCoil[0], this.ptCoil[1], this.curcounts[0]);
        this.drawDots(g, this.ptCoil[1], this.ptEnds[1], this.curcounts[0]);

        // secondary dots
        this.drawDots(g, this.ptEnds[2], this.ptCoil[2], this.curcounts[1]);
        this.drawDots(g, this.ptCoil[2], this.ptCoil[3], this.curcounts[1]);
        this.drawDots(g, this.ptCoil[3], this.ptEnds[3], this.curcounts[3]);
        this.drawDots(g, this.ptCoil[3], this.ptCoil[4], this.curcounts[2]);
        this.drawDots(g, this.ptCoil[4], this.ptEnds[4], this.curcounts[2]);

        this.drawPosts(g);
        this.setBbox(this.ptEnds[0], this.ptEnds[4], 0);
    }

    setPoints(): void {
        super.setPoints();
        this.flip = this.hasFlag(TappedTransformerElm.FLAG_FLIP) ? -1 : 1;
        const hs = 32 * this.flip;
        this.ptEnds = this.newPointArray(5);
        this.ptCoil = this.newPointArray(5);
        this.ptCore = this.newPointArray(4);
        this.ptEnds[0] = this.point1;
        this.ptEnds[2] = this.point2;
        this.interpPoint(this.point1, this.point2, this.ptEnds[1], 0, -hs * 2);
        this.interpPoint(this.point1, this.point2, this.ptEnds[3], 1, -hs);
        this.interpPoint(this.point1, this.point2, this.ptEnds[4], 1, -hs * 2);
        const ce = 0.5 - 12 / this.dn;
        const cd = 0.5 - 2 / this.dn;
        this.interpPoint(this.ptEnds[0], this.ptEnds[2], this.ptCoil[0], ce);
        this.interpPoint(this.ptEnds[0], this.ptEnds[2], this.ptCoil[1], ce, -hs * 2);
        this.interpPoint(this.ptEnds[0], this.ptEnds[2], this.ptCoil[2], 1 - ce);
        this.interpPoint(this.ptEnds[0], this.ptEnds[2], this.ptCoil[3], 1 - ce, -hs);
        this.interpPoint(this.ptEnds[0], this.ptEnds[2], this.ptCoil[4], 1 - ce, -hs * 2);
        for (let i = 0; i !== 2; i++) {
            const b = -hs * i * 2;
            this.interpPoint(this.ptEnds[0], this.ptEnds[2], this.ptCore[i],     cd,     b);
            this.interpPoint(this.ptEnds[0], this.ptEnds[2], this.ptCore[i + 2], 1 - cd, b);
        }
    }

    getPost(n: number): Point {
        return this.ptEnds[n];
    }

    getPostCount(): number { return 5; }

    reset(): void {
        this.currents[0] = this.currents[1] = this.currents[2] = this.currents[3] = 0;
        this.nodes[0].v = this.nodes[1].v = this.nodes[2].v = this.nodes[3].v = this.nodes[4].v = 0;
        this.curcounts[0] = this.curcounts[1] = this.curcounts[2] = 0;
        // need to set current-source values here in case one of the nodes is node 0.  In that case
        // calculateCurrent() may get called (from setNodeVoltage()) when analyzing circuit, before
        // startIteration() gets called
        this.curSourceValue[0] = this.curSourceValue[1] = this.curSourceValue[2] = 0;
    }

    stamp(): void {
        // equations for transformer:
        //   v1 = L1 di1/dt + M1 di2/dt + M1 di3/dt
        //   v2 = M1 di1/dt + L2 di2/dt + M2 di3/dt
        //   v3 = M1 di1/dt + M2 di2/dt + L2 di3/dt
        // we invert that to get:
        //   di1/dt = a1 v1 + a2 v2 + a3 v3
        //   di2/dt = a4 v1 + a5 v2 + a6 v3
        //   di3/dt = a7 v1 + a8 v2 + a9 v3
        // integrate di1/dt using trapezoidal approx and we get:
        //   i1(t2) = i1(t1) + dt/2 (i1(t1) + i1(t2))
        //          = i1(t1) + a1 dt/2 v1(t1)+a2 dt/2 v2(t1)+a3 dt/2 v3(t1) +
        //                     a1 dt/2 v1(t2)+a2 dt/2 v2(t2)+a3 dt/2 v3(t2)
        // the norton equivalent of this for i1 is:
        //  a. current source, I = i1(t1) + a1 dt/2 v1(t1) + a2 dt/2 v2(t1)
        //                                + a3 dt/2 v3(t1)
        //  b. resistor, G = a1 dt/2
        //  c. current source controlled by voltage v2, G = a2 dt/2
        //  d. current source controlled by voltage v3, G = a3 dt/2
        // and similarly for i2, i3
        //
        // first winding goes from node 0 to 1, second is from 2 to 3 to 4
        const l1 = this.inductance;
        // second winding is split in half, so each part has half the turns;
        // we square the 1/2 to divide by 4
        const l2 = this.inductance * this.ratio * this.ratio / 4;
        const m1 = this.couplingCoef * Math.sqrt(l1 * l2);
        // mutual inductance between two halves of the second winding
        // is equal to self-inductance of either half (slightly less
        // because the coupling is not perfect)
        const m2 = this.couplingCoef * l2;
        // load pre-inverted matrix
        this.a[0] = l2 + m2;
        this.a[1] = this.a[2] = this.a[3] = this.a[6] = -m1;
        this.a[4] = this.a[8] = (l1 * l2 - m1 * m1) / (l2 - m2);
        this.a[5] = this.a[7] = (m1 * m1 - l1 * m2) / (l2 - m2);
        const det = l1 * (l2 + m2) - 2 * m1 * m1;
        const ts = this.isTrapezoidal() ? CircuitElm.sim.timeStep / 2 : CircuitElm.sim.timeStep;
        for (let i = 0; i !== 9; i++)
            this.a[i] *= ts / det;
        CircuitElm.sim.stampConductance(this.nodes[0], this.nodes[1], this.a[0]);
        CircuitElm.sim.stampVCCurrentSource(this.nodes[0], this.nodes[1], this.nodes[2], this.nodes[3], this.a[1]);
        CircuitElm.sim.stampVCCurrentSource(this.nodes[0], this.nodes[1], this.nodes[3], this.nodes[4], this.a[2]);

        CircuitElm.sim.stampVCCurrentSource(this.nodes[2], this.nodes[3], this.nodes[0], this.nodes[1], this.a[3]);
        CircuitElm.sim.stampConductance    (this.nodes[2], this.nodes[3], this.a[4]);
        CircuitElm.sim.stampVCCurrentSource(this.nodes[2], this.nodes[3], this.nodes[3], this.nodes[4], this.a[5]);

        CircuitElm.sim.stampVCCurrentSource(this.nodes[3], this.nodes[4], this.nodes[0], this.nodes[1], this.a[6]);
        CircuitElm.sim.stampVCCurrentSource(this.nodes[3], this.nodes[4], this.nodes[2], this.nodes[3], this.a[7]);
        CircuitElm.sim.stampConductance    (this.nodes[3], this.nodes[4], this.a[8]);

        for (let i = 0; i !== 5; i++)
            CircuitElm.sim.stampRightSide(this.nodes[i]);
    }

    isTrapezoidal(): boolean { return (this.flags & Inductor.FLAG_BACK_EULER) === 0; }

    startIteration(): void {
        this.voltdiff[0] = this.nodes[0].v - this.nodes[1].v;
        this.voltdiff[1] = this.nodes[2].v - this.nodes[3].v;
        this.voltdiff[2] = this.nodes[3].v - this.nodes[4].v;
        for (let i = 0; i !== 3; i++) {
            this.curSourceValue[i] = this.currents[i];
            if (this.isTrapezoidal())
                for (let j = 0; j !== 3; j++)
                    this.curSourceValue[i] += this.a[i * 3 + j] * this.voltdiff[j];
        }
    }

    doStep(): void {
        CircuitElm.sim.stampCurrentSource(this.nodes[0], this.nodes[1], this.curSourceValue[0]);
        CircuitElm.sim.stampCurrentSource(this.nodes[2], this.nodes[3], this.curSourceValue[1]);
        CircuitElm.sim.stampCurrentSource(this.nodes[3], this.nodes[4], this.curSourceValue[2]);
    }

    calculateCurrent(): void {
        this.voltdiff[0] = this.nodes[0].v - this.nodes[1].v;
        this.voltdiff[1] = this.nodes[2].v - this.nodes[3].v;
        this.voltdiff[2] = this.nodes[3].v - this.nodes[4].v;
        for (let i = 0; i !== 3; i++) {
            this.currents[i] = this.curSourceValue[i];
            for (let j = 0; j !== 3; j++)
                this.currents[i] += this.a[i * 3 + j] * this.voltdiff[j];
        }
        // calc current of tap wire
        this.currents[3] = this.currents[1] - this.currents[2];
    }

    getInfo(arr: string[]): void {
        arr[0] = "transformer";
        arr[1] = "L = " + CircuitElm.getUnitText(this.inductance, "H");
        arr[2] = "Ratio = 1:" + this.ratio;
        arr[3] = "Vd1 = " + CircuitElm.getVoltageText(this.nodes[0].v - this.nodes[2].v);
        arr[4] = "Vd2 = " + CircuitElm.getVoltageText(this.nodes[1].v - this.nodes[3].v);
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0)
            return -this.currents[0];
        if (n === 1)
            return this.currents[0];
        if (n === 2)
            return -this.currents[1];
        if (n === 3)
            return this.currents[3];
        return this.currents[2];
    }

    getConnection(n1: number, n2: number): boolean {
        if (this.comparePair(n1, n2, 0, 1))
            return true;
        if (this.comparePair(n1, n2, 2, 3))
            return true;
        if (this.comparePair(n1, n2, 3, 4))
            return true;
        if (this.comparePair(n1, n2, 2, 4))
            return true;
        return false;
    }

    // VCCS stamps couple all nodes, so they must all be in the same matrix
    getMatrixConnection(n1: number, n2: number): boolean { return true; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Primary Inductance (H)", this.inductance, 0.01, 5).setPositive();
        if (n === 1)
            return new EditInfo("Ratio (N1/N2)", 1 / this.ratio, 1, 10).setDimensionless().setPositive();
        if (n === 2)
            return new EditInfo("Coupling Coefficient", this.couplingCoef, 0, 1).setDimensionless().setPositive();
        if (n === 3) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Trapezoidal Approximation", this.isTrapezoidal());
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0)
            this.inductance = ei.value;
        if (n === 1 && this.ratio > 0)
            this.ratio = 1 / ei.value;
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
    }

    flipX(c2: number, count: number): void {
        this.flags ^= TappedTransformerElm.FLAG_FLIP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        this.flags ^= TappedTransformerElm.FLAG_FLIP;
        super.flipY(c2, count);
    }

    flipXY(c2: number, count: number): void {
        this.flags ^= TappedTransformerElm.FLAG_FLIP;
        super.flipXY(c2, count);
    }
}
