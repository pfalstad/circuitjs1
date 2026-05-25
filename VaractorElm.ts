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

import { DiodeElm } from "./DiodeElm";
import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageSource } from "./VoltageSource";

export class VaractorElm extends DiodeElm {
    baseCapacitance: number;
    capacitance: number = 0;
    capCurrent: number = 0;

    // DiodeElm.lastvoltdiff = volt diff from last iteration
    // capvoltdiff = volt diff from last timestep
    compResistance: number = 0;
    capvoltdiff: number = 0;
    plate1!: Point[];
    plate2!: Point[];
    voltSourceValue: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.baseCapacitance = 4e-12;
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
            this.capvoltdiff      = parseFloat(st!.nextToken());
            this.baseCapacitance  = parseFloat(st!.nextToken());
        }
    }

    getDumpType(): number { return 176; }
    getElmType(): string { return "varactor"; }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        arr[0] = "varactor";
        arr[5] = "C = " + CircuitElm.getUnitText(this.capacitance, "F");
    }

    stepFinished(): void {
        this.capvoltdiff = this.volts[0] - this.volts[1];
    }

    calculateCurrent(): void {
        super.calculateCurrent();
        this.current += this.capCurrent;
    }

    reset(): void {
        super.reset();
        this.capvoltdiff = 0;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ca", this.capvoltdiff);
        CircuitXMLSerializer.dumpAttr(elem, "ba", this.baseCapacitance);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.capvoltdiff     = xml.parseDoubleAttr("ca", this.capvoltdiff);
        this.baseCapacitance = xml.parseDoubleAttr("ba", this.baseCapacitance);
    }

    setPoints(): void {
        super.setPoints();
        const platef = .6;
        const pa = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, pa[0], pa[1], 0, this.hs);
        this.interpPoint2(this.lead1!, this.lead2!, this.cathode[0], this.cathode[1], platef, this.hs);
        const arrowPoint = this.interpPoint(this.lead1!, this.lead2!, platef);
        this.poly = this.createPolygon(pa[0], pa[1], arrowPoint);
        // calc plates
        this.plate1 = this.newPointArray(2);
        this.plate2 = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, this.plate1[0], this.plate1[1], platef, this.hs);
        this.interpPoint2(this.lead1!, this.lead2!, this.plate2[0], this.plate2[1], 1, this.hs);
    }

    draw(g: Graphics): void {
        // draw leads and diode arrow
        this.drawDiode(g);

        // draw first plate
        this.setVoltageColor(g, this.volts[0]);
        this.setPowerColor(g, false);
        CircuitElm.drawThickLine(g, this.plate1[0], this.plate1[1]);
        if (this.showPower())
            g.setColor("#888888");

        // draw second plate
        this.setVoltageColor(g, this.volts[1]);
        this.setPowerColor(g, false);
        CircuitElm.drawThickLine(g, this.plate2[0], this.plate2[1]);

        this.doDots(g);
        this.drawPosts(g);
    }

    setVoltageSource(n: number, v: VoltageSource): void {
        super.setVoltageSource(n, v);
        v.setNodes(this.nodes[0], this.nodes[2]);
    }

    stamp(): void {
        super.stamp();
        CircuitElm.sim.stampVoltageSource(this.nodes[0], this.nodes[2], this.voltSource);
        CircuitElm.sim.stampNonLinear(this.nodes[2]);
    }

    startIteration(): void {
        super.startIteration();
        // capacitor companion model using trapezoidal approximation
        // (Thevenin equivalent) consists of a voltage source in
        // series with a resistor
        const c0 = this.baseCapacitance;
        if (this.capvoltdiff > 0)
            this.capacitance = c0;
        else
            this.capacitance = c0 / Math.pow(1 - this.capvoltdiff / this.model.fwdrop, .5);
        this.compResistance = CircuitElm.sim.timeStep / (2 * this.capacitance);
        this.voltSourceValue = -this.capvoltdiff - this.capCurrent * this.compResistance;
    }

    doStep(): void {
        super.doStep();
        CircuitElm.sim.stampResistor(this.nodes[2], this.nodes[1], this.compResistance);
        CircuitElm.sim.updateVoltageSource(this.nodes[0], this.nodes[2], this.voltSource, this.voltSourceValue);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 1)
            return new EditInfo("Capacitance @ 0V (F)", this.baseCapacitance, 10, 1000);
        return super.getEditInfo(n);
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 1) {
            this.baseCapacitance = ei.value;
            return;
        }
        super.setEditValue(n, ei);
    }

    getShortcut(): number { return 0; }
    setCurrent(vs: VoltageSource, c: number): void { this.capCurrent = c; }
    getVoltageSourceCount(): number { return 1; }
    getInternalNodeCount(): number { return 1; }

    getXmlDumpType(): string { return "var"; }
}
