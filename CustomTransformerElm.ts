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
import { CustomLogicModel } from "./CustomLogicModel";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Inductor } from "./Inductor";
import { Point } from "./Point";
import { SimulationManager } from "./SimulationManager";
import { StringTokenizer } from "./StringTokenizer";

export class CustomTransformerElm extends CircuitElm {
    coilCurrents: number[];
    coilInductances: number[];
    coilCurCounts: number[];
    coilCurSourceValues: number[];
    coilPolarities: number[];
    nodeCurrents: number[];
    nodeCurCounts: number[];
    static readonly FLAG_FLIP = 1;
    flip: number;

    // node number n of first node of each coil (second node = n+1)
    coilNodes: number[];

    coilCount: number = 0;
    nodeCount: number = 0;

    // number of primary coils
    primaryCoils: number = 0;

    nodePoints: Point[];
    nodeTaps: Point[];
    ptCore: Point[];
    description: string;
    inductance: number;
    couplingCoef: number;
    needDots: boolean = false;

    dots: Point[] | null = null;
    width: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.width = 32;
            this.inductance = parseFloat(st.nextToken());
            this.couplingCoef = parseFloat(st.nextToken());
            this.description = CustomLogicModel.unescape(st.nextToken());
            this.coilCount = parseInt(st.nextToken());
            this.coilCurrents = new Array(this.coilCount).fill(0);
            for (let i = 0; i !== this.coilCount; i++)
                this.coilCurrents[i] = parseFloat(st.nextToken());
            this.noDiagonal = true;
            this.parseDescription(this.description);
        } else {
            this.inductance = 4;
            this.width = 32;
            this.noDiagonal = true;
            this.couplingCoef = 0.999;
            this.description = "1,1:1";
            this.parseDescription(this.description);
        }
    }

    drag(xx: number, yy: number): void {
        xx = this.snapGrid(xx);
        yy = this.snapGrid(yy);
        if (xx === this.x)
            yy = this.y;
        this.x2 = xx; this.y2 = yy;
        this.setPoints();
    }

    getDumpType(): number { return 406; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "in", this.inductance);
        CircuitXMLSerializer.dumpAttr(elem, "cc", this.couplingCoef);
        CircuitXMLSerializer.dumpAttr(elem, "ds", this.description);
        CircuitXMLSerializer.dumpAttr(elem, "nc", this.coilCount);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        let s = "";
        for (let i = 0; i !== this.coilCount; i++) {
            if (i > 0) s += " ";
            s += this.coilCurrents[i];
        }
        CircuitXMLSerializer.dumpAttr(elem, "ci", s);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.inductance = xml.parseDoubleAttr("in", this.inductance);
        this.couplingCoef = xml.parseDoubleAttr("cc", this.couplingCoef);
        this.description = xml.parseStringAttr("ds", this.description) ?? this.description;
        this.coilCount = xml.parseIntAttr("nc", this.coilCount);
        this.coilCurrents = new Array(this.coilCount).fill(0);
        const ci = xml.parseStringAttr("ci", null);
        if (ci !== null) {
            const st = new StringTokenizer(ci, " ");
            for (let i = 0; i !== this.coilCount && st.hasMoreTokens(); i++)
                this.coilCurrents[i] = parseFloat(st.nextToken());
        }
        this.parseDescription(this.description);
    }

    parseDescription(desc?: string, ei?: EditInfo): boolean {
        if (desc === undefined)
            desc = this.description;
        // a number indicates a coil (number = turns ratio to base inductance coil)
        // (negative number = reverse polarity)
        // : separates primary and secondary
        // , separates two coils
        // + separates two connected coils (tapped)
        const tokens = this.tokenizeDesc(desc);

        // count coils/nodes
        this.coilCount = this.nodeCount = 0;
        for (const s of tokens) {
            if (s === "+")
                this.nodeCount--;
            if (s === "," || s === "+" || s === ":")
                continue;
            this.nodeCount += 2;
            this.coilCount++;
        }

        if (this.coilCount === 0) {
            if (ei !== undefined)
                ei.setError("no coils defined");
            return false;
        }

        this.coilNodes = new Array(this.coilCount).fill(0);
        this.coilInductances = new Array(this.coilCount).fill(0);
        // save coil currents if possible (needed for undumping)
        if (this.coilCurrents == null || this.coilCurrents.length !== this.coilCount)
            this.coilCurrents = new Array(this.coilCount).fill(0);
        this.coilCurCounts = new Array(this.coilCount).fill(0);
        this.coilCurSourceValues = new Array(this.coilCount).fill(0);
        this.coilPolarities = new Array(this.coilCount).fill(0);
        this.nodePoints = this.newPointArray(this.nodeCount);
        this.nodeTaps = this.newPointArray(this.nodeCount);
        this.nodeCurrents = new Array(this.nodeCount).fill(0);
        this.nodeCurCounts = new Array(this.nodeCount).fill(0);

        // start over
        let nodeNum = 0;
        let coilNum = 0;
        this.primaryCoils = 0;
        let secondary = false;
        this.needDots = false;
        let ti = 0;
        while (true) {
            const tok = tokens[ti++];
            let n = 0;
            const parsed = parseFloat(tok);
            if (isNaN(parsed)) {
                if (ei !== undefined)
                    ei.setError("expected number, got '" + tok + "'");
                return false;
            }
            n = parsed;
            if (n === 0) {
                if (ei !== undefined)
                    ei.setError("turns ratio cannot be zero");
                return false;
            }
            // create new coil
            this.coilNodes[coilNum] = nodeNum;
            this.coilInductances[coilNum] = n * n * this.inductance;
            this.coilPolarities[coilNum] = 1;
            if (n < 0) {
                this.coilPolarities[coilNum] = -1;
                this.needDots = true;
            }
            nodeNum += 2;
            coilNum++;
            if (!secondary)
                this.primaryCoils = coilNum;
            if (ti >= tokens.length)
                break;
            const sep = tokens[ti++];
            if (sep === ",")
                continue;
            if (sep === "+") {
                nodeNum--;
                continue;
            }
            if (sep === ":") {
                // switch to secondary
                if (secondary) {
                    if (ei !== undefined)
                        ei.setError("only one ':' separator allowed");
                    return false;
                }
                secondary = true;
                continue;
            }
            if (ei !== undefined)
                ei.setError("unexpected '" + sep + "'");
            return false;
        }
        this.allocNodes();
        this.setPoints();
        this.xformMatrix = null;
        return true;
    }

    // Split description string on delimiters, keeping the delimiters as tokens
    private tokenizeDesc(desc: string): string[] {
        const result: string[] = [];
        let cur = "";
        for (const ch of desc) {
            if (ch === "," || ch === ":" || ch === "+") {
                if (cur.length > 0) { result.push(cur); cur = ""; }
                result.push(ch);
            } else {
                cur += ch;
            }
        }
        if (cur.length > 0) result.push(cur);
        return result;
    }

    isTrapezoidal(): boolean { return (this.flags & Inductor.FLAG_BACK_EULER) === 0; }

    draw(g: Graphics): void {
        // draw taps
        for (let i = 0; i !== this.getPostCount(); i++) {
            this.setVoltageColor(g, this.nodes[i].v);
            CircuitElm.drawThickLine(g, this.nodePoints[i], this.nodeTaps[i]);
        }

        // draw coils
        for (let i = 0; i !== this.coilCount; i++) {
            const n = this.coilNodes[i];
            this.setVoltageColor(g, this.nodes[n].v);
            this.setPowerColor(g, this.coilCurrents[i] * (this.nodes[n].v - this.nodes[n+1].v));
            this.drawCoil(g, (i >= this.primaryCoils ? -6 * this.flip : 6 * this.flip),
                this.nodeTaps[n], this.nodeTaps[n+1], this.nodes[n].v, this.nodes[n+1].v);
            if (this.dots !== null) {
                g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
                g.fillOval(this.dots[i].x - 2, this.dots[i].y - 2, 5, 5);
            }
        }
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);

        // draw core
        for (let i = 0; i !== 2; i++) {
            CircuitElm.drawThickLine(g, this.ptCore[i], this.ptCore[i+2]);
        }

        // draw coil currents
        for (let i = 0; i !== this.coilCount; i++) {
            this.coilCurCounts[i] = this.updateDotCountImpl(this.coilCurrents[i], this.coilCurCounts[i]);
            const ni = this.coilNodes[i];
            this.drawDots(g, this.nodeTaps[ni], this.nodeTaps[ni+1], this.coilCurCounts[i]);
        }

        // draw tap currents
        for (let i = 0; i !== this.nodeCount; i++) {
            this.nodeCurCounts[i] = this.updateDotCountImpl(this.nodeCurrents[i], this.nodeCurCounts[i]);
            this.drawDots(g, this.nodePoints[i], this.nodeTaps[i], this.nodeCurCounts[i]);
        }

        this.drawPosts(g);
        this.setBbox(this.nodePoints[0], this.nodePoints[this.nodeCount-1], 0);
        this.adjustBbox(this.ptCore[0], this.ptCore[3]);
    }

    setPoints(): void {
        super.setPoints();
        this.point2.y = this.point1.y;
        this.flip = this.hasFlag(CustomTransformerElm.FLAG_FLIP) ? -1 : 1;
        const primaryNodes = (this.primaryCoils === this.coilCount) ? this.nodeCount : this.coilNodes[this.primaryCoils];
        this.dn = Math.abs(this.point1.x - this.point2.x);
        const ce = 0.5 - 12 / this.dn;
        const cd = 0.5 - 2 / this.dn;
        let maxWidth = 0;
        for (let step = 0; step !== 2; step++) {
            let c = 0;
            let offset = 0;
            for (let i = 0; i !== this.nodeCount; i++) {
                if (i === primaryNodes)
                    offset = 0;
                if (step === 1) {
                    if (i === primaryNodes - 1 || i === this.nodeCount - 1)
                        offset = maxWidth;
                    this.interpPoint(this.point1, this.point2, this.nodePoints[i], i < primaryNodes ? 0 : 1,     -offset * this.flip);
                    this.interpPoint(this.point1, this.point2, this.nodeTaps[i],   i < primaryNodes ? ce : 1-ce, -offset * this.flip);
                }
                maxWidth = Math.max(maxWidth, offset);
                const nn = c < this.coilCount ? this.coilNodes[c] : -1;
                if (nn === i) {
                    // this is first node of a coil, make room
                    c++;
                    offset += this.width;
                } else {
                    // this is last node of a coil, make small gap
                    offset += 16;
                }
            }
        }
        this.ptCore = this.newPointArray(4);
        for (let i = 0; i !== 4; i += 2) {
            const h = (i === 2) ? -maxWidth * this.flip : 0;
            this.interpPoint(this.point1, this.point2, this.ptCore[i],   cd,     h);
            this.interpPoint(this.point1, this.point2, this.ptCore[i+1], 1 - cd, h);
        }

        if (this.needDots) {
            this.dots = new Array(this.coilCount);
            const dotp = Math.abs(7 / this.width);
            for (let i = 0; i !== this.coilCount; i++) {
                const n = this.coilNodes[i];
                this.dots[i] = this.interpPoint(this.nodeTaps[n], this.nodeTaps[n+1],
                    this.coilPolarities[i] > 0 ? dotp : 1 - dotp,
                    i < this.primaryCoils ? -7 : 7);
            }
        } else {
            this.dots = null;
        }
    }

    getPost(n: number): Point { return this.nodePoints[n]; }
    getPostCount(): number { return this.nodeCount; }

    reset(): void {
        for (let i = 0; i !== this.coilCount; i++)
            this.coilCurrents[i] = this.coilCurSourceValues[i] = this.coilCurCounts[i] = 0;
        for (let i = 0; i !== this.nodeCount; i++)
            this.nodes[i].v = this.nodeCurrents[i] = this.nodeCurCounts[i] = 0;
    }

    xformMatrix: number[][] | null = null;

    stamp(): void {
        // equations for transformer:
        //   v1 = L1  di1/dt + M12  di2/dt + M13 di3/dt + ...
        //   v2 = M21 di1/dt + L2 di2/dt   + M23 di3/dt + ...
        //   v3 = ... (one row for each coil)
        // we invert that to get:
        //   di1/dt = a1 v1 + a2 v2 + ...
        //   di2/dt = a3 v1 + a4 v2 + ...
        // integrate di1/dt using trapezoidal approx and we get:
        //   i1(t2) = i1(t1) + dt/2 (i1(t1) + i1(t2))
        //          = i1(t1) + a1 dt/2 v1(t1) + a2 dt/2 v2(t1) + ... +
        //                     a1 dt/2 v1(t2) + a2 dt/2 v2(t2) + ...
        // the norton equivalent of this for i1 is:
        //  a. current source, I = i1(t1) + a1 dt/2 v1(t1) + a2 dt/2 v2(t1) + ...
        //  b. resistor, G = a1 dt/2
        //  c. current source controlled by voltage v2, G = a2 dt/2
        // and for i2:
        //  a. current source, I = i2(t1) + a3 dt/2 v1(t1) + a4 dt/2 v2(t1) + ...
        //  b. resistor, G = a3 dt/2
        //  c. current source controlled by voltage v2, G = a4 dt/2
        //
        // For backward euler, the current source value is just i1(t1) and we use
        // dt instead of dt/2 for the resistor and VCCS.
        this.xformMatrix = [];
        for (let i = 0; i !== this.coilCount; i++) {
            this.xformMatrix[i] = new Array(this.coilCount).fill(0);
        }
        // fill diagonal
        for (let i = 0; i !== this.coilCount; i++)
            this.xformMatrix[i][i] = this.coilInductances[i];
        // fill off-diagonal
        for (let i = 0; i !== this.coilCount; i++)
            for (let j = 0; j !== i; j++)
                this.xformMatrix[i][j] = this.xformMatrix[j][i] =
                    this.couplingCoef * Math.sqrt(this.coilInductances[i] * this.coilInductances[j]) *
                    this.coilPolarities[i] * this.coilPolarities[j];

        SimulationManager.invertMatrix(this.xformMatrix, this.coilCount);

        const ts = this.isTrapezoidal() ? CircuitElm.sim.timeStep / 2 : CircuitElm.sim.timeStep;
        for (let i = 0; i !== this.coilCount; i++)
            for (let j = 0; j !== this.coilCount; j++) {
                // multiply in dt/2 (or dt for backward euler)
                this.xformMatrix[i][j] *= ts;
                const ni = this.coilNodes[i];
                const nj = this.coilNodes[j];
                if (i === j)
                    CircuitElm.sim.stampConductance(this.nodes[ni], this.nodes[ni+1], this.xformMatrix[i][i]);
                else
                    CircuitElm.sim.stampVCCurrentSource(this.nodes[ni], this.nodes[ni+1], this.nodes[nj], this.nodes[nj+1], this.xformMatrix[i][j]);
            }
        for (let i = 0; i !== this.nodeCount; i++)
            CircuitElm.sim.stampRightSide(this.nodes[i]);
    }

    startIteration(): void {
        for (let i = 0; i !== this.coilCount; i++) {
            let val = this.coilCurrents[i];
            if (this.isTrapezoidal()) {
                for (let j = 0; j !== this.coilCount; j++) {
                    const n = this.coilNodes[j];
                    const voltdiff = this.nodes[n].v - this.nodes[n+1].v;
                    val += voltdiff * this.xformMatrix![i][j];
                }
            }
            this.coilCurSourceValues[i] = val;
        }
    }

    doStep(): void {
        for (let i = 0; i !== this.coilCount; i++) {
            const n = this.coilNodes[i];
            CircuitElm.sim.stampCurrentSource(this.nodes[n], this.nodes[n+1], this.coilCurSourceValues[i]);
        }
    }

    calculateCurrent(): void {
        for (let i = 0; i !== this.nodeCount; i++)
            this.nodeCurrents[i] = 0;
        for (let i = 0; i !== this.coilCount; i++) {
            let val = this.coilCurSourceValues[i];
            if (this.xformMatrix !== null) {
                for (let j = 0; j !== this.coilCount; j++) {
                    const n = this.coilNodes[j];
                    const voltdiff = this.nodes[n].v - this.nodes[n+1].v;
                    val += voltdiff * this.xformMatrix[i][j];
                }
            }
            this.coilCurrents[i] = val;
            const ni = this.coilNodes[i];
            this.nodeCurrents[ni] += val;
            this.nodeCurrents[ni+1] -= val;
        }
    }

    getCurrentIntoNode(n: number): number {
        return -this.nodeCurrents[n];
    }

    getInfo(arr: string[]): void {
        arr[0] = "transformer (custom)";
        arr[1] = "L = " + CircuitElm.getUnitText(this.inductance, "H");
        for (let i = 0; i !== this.coilCount; i++) {
            if (2 + i * 2 >= arr.length)
                break;
            const ni = this.coilNodes[i];
            arr[2 + i*2] = "Vd" + (i+1) + " = " + CircuitElm.getVoltageText(this.nodes[ni].v - this.nodes[ni+1].v);
            arr[3 + i*2] = "I" + (i+1) + " = " + CircuitElm.getCurrentText(this.coilCurrents[i]);
        }
    }

    getConnection(n1: number, n2: number): boolean {
        for (let i = 0; i !== this.coilCount; i++)
            if (this.comparePair(n1, n2, this.coilNodes[i], this.coilNodes[i] + 1))
                return true;
        return false;
    }

    // VCCS stamps couple all nodes, so they must all be in the same matrix
    getMatrixConnection(n1: number, n2: number): boolean { return true; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Base Inductance (H)", this.inductance, 0.01, 5).setPositive();
        if (n === 1) {
            const ei = new EditInfo(EditInfo.makeLink("customtransformer.html", "Description"), 0, -1, -1);
            ei.setErrorFieldName("Description");
            ei.text = this.description;
            ei.disallowSliders();
            return ei;
        }
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
        if (n === 0 && ei.value > 0) {
            this.inductance = ei.value;
            this.parseDescription();
        }
        if (n === 1) {
            const s = ei.textf!.value;
            if (s !== this.description) {
                if (!this.parseDescription(s, ei)) {
                    this.parseDescription(this.description);
                } else {
                    this.description = s;
                }
                this.setPoints();
            }
        }
        if (n === 2) {
            if (ei.value > 0 && ei.value < 1) {
                this.couplingCoef = ei.value;
                this.parseDescription();
            } else {
                ei.setError("must be > 0 and < 1");
            }
        }
        if (n === 3) {
            if (ei.checkbox!.getState())
                this.flags &= ~Inductor.FLAG_BACK_EULER;
            else
                this.flags |= Inductor.FLAG_BACK_EULER;
            this.parseDescription();
        }
    }

    flipX(c2: number, count: number): void {
        this.flags ^= CustomTransformerElm.FLAG_FLIP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        this.flags ^= CustomTransformerElm.FLAG_FLIP;
        super.flipY(c2, count);
    }

    // vertical not supported
    canFlipXY(): boolean { return false; }
}
