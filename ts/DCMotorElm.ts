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
import { Inductor } from "./Inductor";
import { Locale } from "./Locale";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageSource } from "./VoltageSource";
import { parseFloatStrict } from "./NumberParse";

export class DCMotorElm extends CircuitElm {
    ind: Inductor;
    indInertia: Inductor;
    resistance: number;
    inductance: number;
    K: number;
    Kb: number;
    J: number;
    b: number;
    gearRatio: number;
    tau: number;
    angle: number;
    speed: number = 0;
    coilCurrent: number = 0;
    inertiaCurrent: number = 0;
    voltSources: VoltageSource[] = new Array(2);
    motorCenter: Point;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.angle = CircuitElm.pi / 2;
            this.inductance = parseFloatStrict(st.nextToken());
            this.resistance = parseFloatStrict(st.nextToken());
            this.K  = parseFloatStrict(st.nextToken());
            this.Kb = parseFloatStrict(st.nextToken());
            this.J  = parseFloatStrict(st.nextToken());
            this.b  = parseFloatStrict(st.nextToken());
            this.gearRatio = parseFloatStrict(st.nextToken());
            this.tau = parseFloatStrict(st.nextToken());
        } else {
            this.inductance = 0.5; this.resistance = 1;
            this.angle = CircuitElm.pi / 2;
            this.K = 0.15; this.b = 0.05; this.J = 0.02; this.Kb = 0.15; this.gearRatio = 1; this.tau = 0;
        }
        this.ind = new Inductor(CircuitElm.sim);
        this.indInertia = new Inductor(CircuitElm.sim);
        this.ind.setup(this.inductance, 0, Inductor.FLAG_BACK_EULER);
        this.indInertia.setup(this.J, 0, Inductor.FLAG_BACK_EULER);
    }

    getDumpType(): number { return 415; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "in", this.inductance);
        CircuitXMLSerializer.dumpAttr(elem, "rs", this.resistance);
        CircuitXMLSerializer.dumpAttr(elem, "k", this.K);
        CircuitXMLSerializer.dumpAttr(elem, "kb", this.Kb);
        CircuitXMLSerializer.dumpAttr(elem, "j", this.J);
        CircuitXMLSerializer.dumpAttr(elem, "b", this.b);
        CircuitXMLSerializer.dumpAttr(elem, "gr", this.gearRatio);
        CircuitXMLSerializer.dumpAttr(elem, "ta", this.tau);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.inductance = xml.parseDoubleAttr("in", this.inductance);
        this.resistance = xml.parseDoubleAttr("rs", this.resistance);
        this.K  = xml.parseDoubleAttr("k", this.K);
        this.Kb = xml.parseDoubleAttr("kb", this.Kb);
        this.J  = xml.parseDoubleAttr("j", this.J);
        this.b  = xml.parseDoubleAttr("b", this.b);
        this.gearRatio = xml.parseDoubleAttr("gr", this.gearRatio);
        this.tau = xml.parseDoubleAttr("ta", this.tau);
        this.ind = new Inductor(CircuitElm.sim);
        this.indInertia = new Inductor(CircuitElm.sim);
        this.ind.setup(this.inductance, 0, Inductor.FLAG_BACK_EULER);
        this.indInertia.setup(this.J, 0, Inductor.FLAG_BACK_EULER);
    }

    getAngle(): number { return this.angle; }

    setPoints(): void {
        super.setPoints();
        this.calcLeads(36);
        this.motorCenter = this.interpPoint(this.point1, this.point2, 0.5);
        this.allocNodes();
    }

    getPostCount(): number { return 2; }
    getInternalNodeCount(): number { return 4; }
    getVoltageSourceCount(): number { return 2; }

    setVoltageSource(n: number, v: VoltageSource): void {
        this.voltSources[n] = v;
        if (n === 0) v.setNodes(this.nodes[3], this.nodes[1]);
        else v.setNodes(this.nodes[4], CircuitNode.ground);
    }

    reset(): void {
        super.reset();
        this.ind.reset();
        this.indInertia.reset();
        this.coilCurrent = 0;
        this.inertiaCurrent = 0;
    }

    stamp(): void {
        this.ind.stamp(this.nodes[0], this.nodes[2]);
        CircuitElm.sim.stampResistor(this.nodes[2], this.nodes[3], this.resistance);
        CircuitElm.sim.stampVoltageSource(this.nodes[3], this.nodes[1], this.voltSources[0]);
        this.indInertia.stamp(this.nodes[4], this.nodes[5]);
        CircuitElm.sim.stampResistor(this.nodes[5], CircuitNode.ground, this.b);
        CircuitElm.sim.stampVoltageSource(this.nodes[4], CircuitNode.ground, this.voltSources[1]);
    }

    startIteration(): void {
        this.ind.startIteration(this.nodes[0].v - this.nodes[2].v);
        this.indInertia.startIteration(this.nodes[4].v - this.nodes[5].v);
        this.angle = this.angle + this.speed * CircuitElm.sim.timeStep;
    }

    doStep(): void {
        CircuitElm.sim.updateVoltageSource(this.nodes[4], CircuitNode.ground, this.voltSources[1], this.coilCurrent * this.K);
        CircuitElm.sim.updateVoltageSource(this.nodes[3], this.nodes[1], this.voltSources[0], this.inertiaCurrent * this.Kb);
        this.ind.doStep(this.nodes[0].v - this.nodes[2].v);
        this.indInertia.doStep(this.nodes[4].v - this.nodes[5].v);
    }

    calculateCurrent(): void {
        this.coilCurrent = this.ind.calculateCurrent(this.nodes[0].v - this.nodes[2].v);
        this.inertiaCurrent = this.indInertia.calculateCurrent(this.nodes[4].v - this.nodes[5].v);
        this.speed = this.inertiaCurrent;
    }

    setCurrent(vs: VoltageSource, c: number): void {
        if (vs === this.voltSources[0]) this.current = c;
    }

    draw(g: Graphics): void {
        const cr = 18;
        this.setBbox(this.point1, this.point2, cr);
        this.draw2Leads(g);
        this.doDots(g);
        this.setPowerColor(g, true);
        g.setColor(new Color(165, 165, 165));
        g.fillOval(this.motorCenter.x - cr, this.motorCenter.y - cr, cr*2, cr*2);
        g.setColor(new Color(10, 10, 10));
        const angleAux = Math.round(this.angle * 300.0) / 300.0;
        g.fillOval(this.motorCenter.x - Math.trunc(cr/2.2), this.motorCenter.y - Math.trunc(cr/2.2),
            Math.trunc(2*cr/2.2), Math.trunc(2*cr/2.2));
        for (let k = 0; k < 3; k++) {
            const a = angleAux * this.gearRatio + k * CircuitElm.pi / 3;
            this.interpPointFix(this.lead1!, this.lead2!, CircuitElm.ps1, 0.5 + 0.28*Math.cos(a), 0.28*Math.sin(a));
            this.interpPointFix(this.lead1!, this.lead2!, CircuitElm.ps2, 0.5 - 0.28*Math.cos(a), -0.28*Math.sin(a));
            DCMotorElm.drawThickerLine(g, CircuitElm.ps1, CircuitElm.ps2);
        }
        this.drawPosts(g);
    }

    static drawThickerLine(g: Graphics, pa: Point, pb: Point): void {
        g.setLineWidth(6.0);
        g.drawLine(pa.x, pa.y, pb.x, pb.y);
        g.setLineWidth(1.0);
    }

    interpPointFix(a: Point, b: Point, c: Point, f: number, gg: number): void {
        const gx = b.y - a.y;
        const gy = a.x - b.x;
        c.x = Math.round(a.x*(1-f) + b.x*f + gg*gx);
        c.y = Math.round(a.y*(1-f) + b.y*f + gg*gy);
    }

    getInfo(arr: string[]): void {
        arr[0] = "DC Motor";
        this.getBasicInfo(arr);
        arr[3] = Locale.LS("speed") + " = " + CircuitElm.getUnitText(60 * Math.abs(this.speed) / (2 * CircuitElm.pi), Locale.LS("RPM"));
        arr[4] = "L = " + CircuitElm.getUnitText(this.inductance, "H");
        arr[5] = "R = " + CircuitElm.getUnitText(this.resistance, Locale.ohmString);
        arr[6] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("Armature inductance (H)", this.inductance, 0, 0).setPositive();
        if (n === 1) return new EditInfo("Armature Resistance (ohms)", this.resistance, 0, 0).setPositive();
        if (n === 2) return new EditInfo("Torque constant (Nm/A)", this.K, 0, 0).setPositive();
        if (n === 3) return new EditInfo("Moment of inertia (Kg.m^2)", this.J, 0, 0).setPositive();
        if (n === 4) return new EditInfo("Friction coefficient (Nms/rad)", this.b, 0, 0).setPositive();
        if (n === 5) return new EditInfo("Gear Ratio", this.gearRatio, 0, 0).setPositive();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0) { this.inductance = ei.value; this.ind.setup(this.inductance, this.current, Inductor.FLAG_BACK_EULER); }
        if (n === 1 && ei.value > 0) this.resistance = ei.value;
        if (n === 2 && ei.value > 0) { this.K = ei.value; this.Kb = this.K; }
        if (n === 3 && ei.value > 0) { this.J = ei.value; this.indInertia.setup(this.J, this.inertiaCurrent, Inductor.FLAG_BACK_EULER); }
        if (n === 4 && ei.value > 0) this.b = ei.value;
        if (n === 5 && ei.value > 0) this.gearRatio = ei.value;
    }
}
