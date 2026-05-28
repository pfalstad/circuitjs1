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

// based on https://ctms.engin.umich.edu/CTMS/index.php?example=MotorPosition&section=SystemModeling

import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Color } from "./Color";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { Point } from "./Point";
import { SimulationManager } from "./SimulationManager";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageSource } from "./VoltageSource";

export class ThreePhaseMotorElm extends CircuitElm {
    Rs: number; Rr: number; Ls: number; Lr: number; Lm: number;
    b: number;
    angle: number = CircuitElm.pi / 2;
    speed: number = 0;
    filteredSpeed: number = 0;
    coilCurrents: number[];
    coilCurSourceValues: number[];
    xformMatrix: number[][] | null = null;
    nodeCurrents: number[];
    voltSources: VoltageSource[];
    J: number;
    posts: Point[];
    leads: Point[];
    curcounts: number[];
    motorCenter: Point;

    readonly n001_ind = 6;  readonly n002_ind = 7;  readonly n003_ind = 8;
    readonly n004_ind = 9;  readonly n005_ind = 10; readonly n006_ind = 11;
    readonly n007_ind = 12;
    readonly Zp = 2;
    readonly coilCount = 5;
    readonly coilNodes = [6, 1, 8, 3, 10, 5, 7, 9, 11, 12];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.Rs = parseFloat(st.nextToken());
            this.Rr = parseFloat(st.nextToken());
            this.Ls = parseFloat(st.nextToken());
            this.Lr = parseFloat(st.nextToken());
            this.Lm = parseFloat(st.nextToken());
            this.b  = parseFloat(st.nextToken());
            try { this.J = parseFloat(st.nextToken()); } catch (e) { this.J = 1; }
        } else {
            this.Rs = 0.435; this.Rr = 0.816; this.Ls = 0.0294; this.Lr = 0.0297; this.Lm = 0.0287;
            this.J = 1; this.b = 0.05;
        }
        this.voltSources = new Array(2);
        this.curcounts = [0, 0, 0];
        this.coilCurrents = new Array(this.coilCount).fill(0);
        this.coilCurSourceValues = new Array(this.coilCount).fill(0);
        this.nodeCurrents = [];
    }

    getDumpType(): number { return 427; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "rs", this.Rs);
        CircuitXMLSerializer.dumpAttr(elem, "rr", this.Rr);
        CircuitXMLSerializer.dumpAttr(elem, "ls", this.Ls);
        CircuitXMLSerializer.dumpAttr(elem, "lr", this.Lr);
        CircuitXMLSerializer.dumpAttr(elem, "lm", this.Lm);
        CircuitXMLSerializer.dumpAttr(elem, "b", this.b);
        CircuitXMLSerializer.dumpAttr(elem, "j", this.J);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.Rs = xml.parseDoubleAttr("rs", this.Rs);
        this.Rr = xml.parseDoubleAttr("rr", this.Rr);
        this.Ls = xml.parseDoubleAttr("ls", this.Ls);
        this.Lr = xml.parseDoubleAttr("lr", this.Lr);
        this.Lm = xml.parseDoubleAttr("lm", this.Lm);
        this.b  = xml.parseDoubleAttr("b", this.b);
        this.J  = xml.parseDoubleAttr("j", this.J);
    }

    getAngle(): number { return this.angle; }

    setPoints(): void {
        super.setPoints();
        this.posts = this.newPointArray(6);
        this.leads = this.newPointArray(6);
        const q = (Math.abs(this.dy) > Math.abs(this.dx)) ? -1 : 1;
        for (let i = 0; i !== 3; i++) {
            this.interpPoint(this.point1, this.point2, this.posts[i*2],   0, -q*32*(i-1));
            this.interpPoint(this.point1, this.point2, this.leads[i*2],   0.45, -q*32*(i-1));
            this.interpPoint(this.point1, this.point2, this.posts[i*2+1], 1, q*32*(i-1));
            this.interpPoint(this.point1, this.point2, this.leads[i*2+1], 0.55, q*32*(i-1));
        }
        this.motorCenter = this.interpPoint(this.point1, this.point2, 0.5);
        this.allocNodes();
    }

    getPostCount(): number { return 6; }
    getPost(n: number): Point { return this.posts[n]; }
    getInternalNodeCount(): number { return 7; }
    getVoltageSourceCount(): number { return 2; }

    reset(): void {
        super.reset();
        this.filteredSpeed = this.speed = 0;
        this.coilCurSourceValues = new Array(this.coilCount).fill(0);
        this.coilCurrents = new Array(this.coilCount).fill(0);
    }

    stamp(): void {
        const n001 = this.nodes[this.n001_ind]; const n002 = this.nodes[this.n002_ind];
        const n003 = this.nodes[this.n003_ind]; const n004 = this.nodes[this.n004_ind];
        const n005 = this.nodes[this.n005_ind]; const n006 = this.nodes[this.n006_ind];
        const n007 = this.nodes[this.n007_ind];

        CircuitElm.sim.stampResistor(this.nodes[0], n001, this.Rs);
        CircuitElm.sim.stampResistor(this.nodes[2], n003, this.Rs);
        CircuitElm.sim.stampResistor(this.nodes[4], n005, this.Rs);
        CircuitElm.sim.stampResistor(n004, CircuitNode.ground, 1.5*this.Rr);
        CircuitElm.sim.stampResistor(n007, CircuitNode.ground, 1.5*this.Rr);

        const Lr2 = this.Lr * 1.5;
        const coilInductances = [this.Ls, this.Ls, this.Ls, Lr2, Lr2];
        this.xformMatrix = [];
        for (let i = 0; i !== this.coilCount; i++) {
            this.xformMatrix[i] = new Array(this.coilCount).fill(0);
            this.xformMatrix[i][i] = coilInductances[i];
        }
        const k0 = this.Lm / Math.sqrt(this.Ls * Lr2);
        const cc: number[][] = [];
        for (let i = 0; i < this.coilCount; i++) cc[i] = new Array(this.coilCount).fill(0);
        cc[0][3] = cc[3][0] = k0;
        cc[1][3] = cc[3][1] = -k0/2;
        cc[1][4] = cc[4][1] = k0*Math.sqrt(3)/2;
        cc[2][3] = cc[3][2] = -k0/2;
        cc[2][4] = cc[4][2] = -k0*Math.sqrt(3)/2;
        for (let i = 0; i !== this.coilCount; i++)
            for (let j = 0; j !== i; j++)
                this.xformMatrix[i][j] = this.xformMatrix[j][i] = cc[i][j] * Math.sqrt(coilInductances[i] * coilInductances[j]);

        SimulationManager.invertMatrix(this.xformMatrix, this.coilCount);
        const ts = CircuitElm.sim.timeStep;
        for (let i = 0; i !== this.coilCount; i++)
            for (let j = 0; j !== this.coilCount; j++) {
                this.xformMatrix[i][j] *= ts;
                const ni1 = this.coilNodes[i*2], nj1 = this.coilNodes[j*2];
                const ni2 = this.coilNodes[i*2+1], nj2 = this.coilNodes[j*2+1];
                if (i === j)
                    CircuitElm.sim.stampConductance(this.nodes[ni1], this.nodes[ni2], this.xformMatrix[i][i]);
                else
                    CircuitElm.sim.stampVCCurrentSource(this.nodes[ni1], this.nodes[ni2], this.nodes[nj1], this.nodes[nj2], this.xformMatrix[i][j]);
            }
        for (let i = 0; i !== 10; i++)
            CircuitElm.sim.stampRightSide(this.nodes[this.coilNodes[i]]);

        CircuitElm.sim.stampVoltageSource(n002, CircuitNode.ground, this.voltSources[0]);
        CircuitElm.sim.stampVoltageSource(n006, CircuitNode.ground, this.voltSources[1]);
        this.nodeCurrents = new Array(this.getNodeCount()).fill(0);
    }

    setVoltageSource(n: number, v: VoltageSource): void {
        this.voltSources[n] = v;
        if (n === 0) v.setNodes(this.nodes[this.n002_ind], CircuitNode.ground);
        else v.setNodes(this.nodes[this.n006_ind], CircuitNode.ground);
    }

    vs1value: number = 0;
    vs2value: number = 0;

    startIteration(): void {
        for (let i = 0; i !== this.coilCount; i++)
            this.coilCurSourceValues[i] = this.coilCurrents[i];
        const torque = this.Zp * Math.sqrt(3)/2 * this.Lm *
            ((this.coilCurrents[1] - this.coilCurrents[2]) * this.coilCurrents[3] -
             Math.sqrt(3) * this.coilCurrents[0] * this.coilCurrents[4]);
        this.speed += CircuitElm.sim.timeStep * (torque - this.b * this.speed) / this.J;
        this.angle = this.angle + this.speed * CircuitElm.sim.timeStep;
        this.vs1value = -this.Zp*this.speed*(this.Lm*Math.sqrt(3)/2 * (this.coilCurrents[1]-this.coilCurrents[2]) + 1.5*this.Lr*this.coilCurrents[4]);
        this.vs2value = this.Zp*this.speed*(1.5*this.Lm*this.coilCurrents[0] + 1.5*this.Lr*this.coilCurrents[3]);
    }

    doStep(): void {
        for (let i = 0; i !== this.coilCount; i++) {
            const n1 = this.coilNodes[i*2], n2 = this.coilNodes[i*2+1];
            CircuitElm.sim.stampCurrentSource(this.nodes[n1], this.nodes[n2], this.coilCurSourceValues[i]);
        }
        CircuitElm.sim.updateVoltageSource(this.nodes[this.n002_ind], CircuitNode.ground, this.voltSources[0], -this.vs1value);
        CircuitElm.sim.updateVoltageSource(this.nodes[this.n006_ind], CircuitNode.ground, this.voltSources[1], -this.vs2value);
    }

    calculateCurrent(): void {
        if (!this.nodeCurrents) return;
        this.nodeCurrents.fill(0);
        for (let i = 0; i !== this.coilCount; i++) {
            let val = this.coilCurSourceValues[i];
            if (this.xformMatrix !== null) {
                for (let j = 0; j !== this.coilCount; j++) {
                    const n1 = this.coilNodes[j*2], n2 = this.coilNodes[j*2+1];
                    val += (this.nodes[n1].v - this.nodes[n2].v) * this.xformMatrix[i][j];
                }
            }
            this.coilCurrents[i] = val;
            const ni = this.coilNodes[i];
            this.nodeCurrents[ni] += val;
            this.nodeCurrents[ni+1] -= val;
        }
    }

    hasGroundConnection(n1: number): boolean { return false; }
    getConnection(n1: number, n2: number): boolean { return true; }

    readonly cr = 37;

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.cr);
        for (let i = 0; i !== 6; i++) {
            this.setVoltageColor(g, this.nodes[i].v);
            CircuitElm.drawThickLine(g, this.posts[i], this.leads[i]);
        }
        for (let i = 0; i !== 3; i++) {
            this.curcounts[i] = this.updateDotCountImpl(this.coilCurrents[i], this.curcounts[i]);
            this.drawDots(g, this.posts[i*2],   this.leads[i*2],   this.curcounts[i]);
            this.drawDots(g, this.leads[i*2+1], this.posts[i*2+1], this.curcounts[i]);
        }
        this.setPowerColor(g, true);
        g.setColor(new Color(165, 165, 165));
        g.fillOval(this.motorCenter.x - this.cr, this.motorCenter.y - this.cr, this.cr*2, this.cr*2);
        g.setColor(new Color(10, 10, 10));
        const angleAux = Math.round(this.angle * 300.0) / 300.0;
        g.fillOval(this.motorCenter.x - Math.trunc(this.cr/2.2), this.motorCenter.y - Math.trunc(this.cr/2.2),
            Math.trunc(2*this.cr/2.2), Math.trunc(2*this.cr/2.2));
        const q = 0.28 * 1.7 * 36 / this.dn * 37/27;
        for (let k = 0; k < 3; k++) {
            const a = angleAux + k * CircuitElm.pi / 3;
            this.interpPointFix(this.point1, this.point2, CircuitElm.ps1, 0.5 + q*Math.cos(a), q*Math.sin(a));
            this.interpPointFix(this.point1, this.point2, CircuitElm.ps2, 0.5 - q*Math.cos(a), -q*Math.sin(a));
            ThreePhaseMotorElm.drawThickerLine(g, CircuitElm.ps1, CircuitElm.ps2);
        }
        this.drawPosts(g);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.whiteColor);
        g.save();
        if (Math.abs(this.dy) > Math.abs(this.dx)) {
            for (let i = 0; i !== 3; i++) {
                const d1 = 5;
                g.drawString("UVW"[i] + "1", this.posts[i*2  ].x+d1, this.posts[i*2  ].y+8);
                g.drawString("UVW"[i] + "2", this.posts[i*2+1].x+d1, this.posts[i*2+1].y-2);
            }
        } else {
            g.context.textAlign = "center";
            for (let i = 0; i !== 3; i++) {
                const d1 = 11, d2 = 7;
                g.drawString("UVW"[i] + "1", this.posts[i*2  ].x+d1, this.posts[i*2  ].y-d2);
                g.drawString("UVW"[i] + "2", this.posts[i*2+1].x-d1, this.posts[i*2+1].y-d2);
            }
        }
        g.restore();
        this.filteredSpeed = this.filteredSpeed * 0.98 + this.speed * 0.02;
    }

    static drawThickerLine(g: Graphics, pa: Point, pb: Point): void {
        g.setLineWidth(6.0);
        g.drawLine(pa.x, pa.y, pb.x, pb.y);
        g.setLineWidth(1.0);
    }

    interpPointFix(a: Point, b: Point, c: Point, f: number, gg: number): void {
        const gx = b.y - a.y, gy = a.x - b.x;
        c.x = Math.round(a.x*(1-f) + b.x*f + gg*gx);
        c.y = Math.round(a.y*(1-f) + b.y*f + gg*gy);
    }

    getInfo(arr: string[]): void {
        arr[0] = "3-Phase Motor";
        this.getBasicInfo(arr);
        arr[3] = Locale.LS("speed") + " = " + CircuitElm.getUnitText(60 * Math.abs(this.filteredSpeed) / (2 * CircuitElm.pi), Locale.LS("RPM"));
    }

    getCurrentIntoNode(n: number): number {
        return n % 2 === 1 ? this.coilCurrents[Math.trunc(n/2)] : -this.coilCurrents[Math.trunc(n/2)];
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("Stator Inductance (H)", this.Ls, 0, 0);
        if (n === 1) return new EditInfo("Rotor Inductance (H)", this.Lr, 0, 0);
        if (n === 2) return new EditInfo("Coupling Coefficient", this.Lm / Math.sqrt(this.Ls * this.Lr), 0, 0).setDimensionless();
        if (n === 3) return new EditInfo("Stator Resistance (ohms)", this.Rs, 0, 0);
        if (n === 4) return new EditInfo("Rotor Resistance (ohms)", this.Rr, 0, 0);
        if (n === 5) return new EditInfo("Friction coefficient (Nms/rad)", this.b, 0, 0);
        if (n === 6) return new EditInfo("Moment of inertia (Kg.m^2)", this.J, 0, 0);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (ei.value > 0 && n === 0) this.Ls = ei.value;
        if (ei.value > 0 && n === 1) this.Lr = ei.value;
        if (ei.value > 0 && ei.value < 1 && n === 2) this.Lm = ei.value * Math.sqrt(this.Ls * this.Lr);
        if (ei.value > 0 && n === 3) this.Rs = ei.value;
        if (ei.value > 0 && n === 4) this.Rr = ei.value;
        if (n === 5) this.b = ei.value;
        if (ei.value > 0 && n === 6) this.J = ei.value;
    }

    canFlipX(): boolean { return false; }
    canFlipY(): boolean { return false; }
}
