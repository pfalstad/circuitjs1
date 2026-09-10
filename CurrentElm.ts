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
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Polygon } from "./Polygon";
import { Point } from "./Point";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { FindPathInfo } from "./FindPathInfo";
import { SimulationManager } from "./SimulationManager";
import { parseFloatStrict } from "./NumberParse";

export class CurrentElm extends CircuitElm {
    currentValue: number = 0.01;
    // Compliance voltage. 0 = unlimited (ideal current source).
    maxVoltage: number = 0;
    lastVoltDiff: number = 0;
    broken: boolean = false;

    arrow: Polygon | null = null;
    ashaft1: Point | null = null;
    ashaft2: Point | null = null;
    center: Point | null = null;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.currentValue = 0.01;
            this.maxVoltage = 0;
        } else {
            super(xa, ya, xb, yb!, f!);
            try {
                this.currentValue = parseFloatStrict(st!.nextToken());
                this.maxVoltage   = parseFloatStrict(st!.nextToken());
            } catch (_e) {}
            if (this.currentValue === 0)
                this.currentValue = 0.01;
        }
    }

    isVoltageLimited(): boolean { return this.maxVoltage > 0; }
    nonLinear(): boolean { return this.isVoltageLimited(); }

    reset(): void {
        super.reset();
        this.lastVoltDiff = 0;
    }

    dump(): string {
        return super.dump() + " " + this.currentValue + " " + this.maxVoltage;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "cu", this.currentValue);
        if (this.maxVoltage > 0)
            CircuitXMLSerializer.dumpAttr(elem, "mv", this.maxVoltage);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.currentValue = xml.parseDoubleAttr("cu", this.currentValue);
        this.maxVoltage   = xml.parseDoubleAttr("mv", 0);
    }

    getDumpType(): number { return 'i'.charCodeAt(0); }
    isCurrentElm(): boolean { return true; }

    setPoints(): void {
        super.setPoints();
        this.calcLeads(26);
        this.ashaft1 = this.interpPoint(this.lead1!, this.lead2!, 0.25);
        this.ashaft2 = this.interpPoint(this.lead1!, this.lead2!, 0.6);
        this.center  = this.interpPoint(this.lead1!, this.lead2!, 0.5);
        const p2 = this.interpPoint(this.lead1!, this.lead2!, 0.75);
        this.arrow = this.calcArrow(this.center, p2, 4, 4);
    }

    draw(g: Graphics): void {
        const cr = 12;
        this.draw2Leads(g);
        this.setVoltageColor(g, (this.nodes[0].v + this.nodes[1].v) / 2);
        this.setPowerColor(g, false);

        CircuitElm.drawThickCircle(g, this.center!.x, this.center!.y, cr);
        CircuitElm.drawThickLine(g, this.ashaft1!, this.ashaft2!);

        g.fillPolygon(this.arrow!);
        this.setBbox(this.point1, this.point2, cr);
        this.doDots(g);
        if (this.showValues() && this.current !== 0) {
            const s = CircuitElm.getShortUnitText(this.current, "A");
            if (this.dx === 0 || this.dy === 0)
                this.drawValues(g, s, cr);
        }
        this.drawPosts(g);
    }

    // analyzeCircuit determines if current source has a path or if it's broken
    setBroken(b: boolean): void {
        this.broken = b && !this.isVoltageLimited();
    }

    // we defer stamping current sources until we can tell if they have a current path or not
    stamp(): void {
        const sim = SimulationManager.theSim;
        if (this.broken) {
            // no current path; stamping a current source would cause a matrix error
            sim.stampResistor(this.nodes[0], this.nodes[1], 1e8);
            this.current = 0;
        } else if (this.isVoltageLimited()) {
            // nonlinear; doStep() handles the smooth-saturation companion model
            sim.stampNonLinear(this.nodes[0]);
            sim.stampNonLinear(this.nodes[1]);
        } else {
            // ideal current source
            sim.stampCurrentSource(this.nodes[0], this.nodes[1], this.currentValue);
            this.current = this.currentValue;
        }
    }

    // Smooth voltage compliance via tanh-shaped saturation.
    // Transition starts at 0.95*maxVoltage and ends at maxVoltage:
    //   vd < 0.95*Vmax  ->  i ~= currentValue  (tanh arg ~= -2.5)
    //   vd > Vmax       ->  i ~= 0              (tanh arg ~= +2.5)
    // tanh is centered at 0.975*Vmax with scale vt = vWidth/5.
    doStep(): void {
        if (this.broken || !this.isVoltageLimited())
            return;

        const sim = SimulationManager.theSim;
        let vd = this.nodes[1].v - this.nodes[0].v;

        const vStart = 0.95 * this.maxVoltage;
        const vWidth = this.maxVoltage - vStart;
        const vMid   = (vStart + this.maxVoltage) / 2.0;
        const vt     = Math.max(vWidth / 5.0, 1e-3);

        // Step-size limit: prevent crossing the transition region in one Newton step.
        if (this.lastVoltDiff < vStart && vd > vStart) {
            vd = vStart;
            sim.converged = false;
        } else if (this.lastVoltDiff > this.maxVoltage && vd < this.maxVoltage) {
            vd = this.maxVoltage;
            sim.converged = false;
        } else if (this.lastVoltDiff >= vStart && this.lastVoltDiff <= this.maxVoltage) {
            const maxStep = Math.max(vWidth / 4.0, 0.01);
            if (vd > this.lastVoltDiff + maxStep) {
                vd = this.lastVoltDiff + maxStep;
                sim.converged = false;
            } else if (vd < this.lastVoltDiff - maxStep) {
                vd = this.lastVoltDiff - maxStep;
                sim.converged = false;
            }
        }
        this.lastVoltDiff = vd;

        const arg     = (vd - vMid) / vt;
        const tanhArg = Math.tanh(arg);

        const i     = this.currentValue * 0.5 * (1.0 - tanhArg);
        const sech2 = 1.0 - tanhArg * tanhArg;
        const g     = -this.currentValue * 0.5 * sech2 / vt * vd;

        // Norton companion: parallel resistor (1/|g|) + adjusted current source.
        // Gmin floor keeps the Norton resistance finite when sech^2 is
        // vanishing (well inside or well outside compliance) so the matrix
        // stays non-singular and Newton steps remain bounded.
        const absG = Math.abs(g) + 1e-6;
        sim.stampResistor(this.nodes[0], this.nodes[1], 1.0 / absG);
        sim.stampCurrentSource(this.nodes[0], this.nodes[1], i - g * vd);
        this.current = i;
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Current (A)", this.currentValue, 0, 0.1);
        if (n === 1)
            return new EditInfo("Max Voltage (V, 0=unlimited)", this.maxVoltage, 0, 0).setUnitStep();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.currentValue = ei.value;
        if (n === 1 && ei.value >= 0)
            this.maxVoltage = ei.value;
    }

    getInfo(arr: string[]): void {
        arr[0] = "current source";
        let i = this.getBasicInfo(arr);
        arr[i++] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
        if (this.isVoltageLimited())
            arr[i++] = "Vmax = " + CircuitElm.getVoltageText(this.maxVoltage);
    }

    getVoltageDiff(): number {
        return this.nodes[1].v - this.nodes[0].v;
    }

    getPower(): number { return -this.getVoltageDiff() * this.current; }

    validate(): boolean {
        const fpi = new FindPathInfo(FindPathInfo.INDUCT, this, this.getNode(1), SimulationManager.theSim);
        this.setBroken(!fpi.findPath(this.getNode(0)));
        return true;
    }
}
