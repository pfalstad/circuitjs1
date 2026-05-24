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
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { Locale } from "./Locale";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { WireRouter } from "./WireRouter";
import { Scope } from "./Scope";
import { FindPathInfo } from "./FindPathInfo";
import { CirSim } from "./CirSim";
import { Color } from "./Color";
import { XMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";

export class CapacitorElm extends CircuitElm {
    capacitance: number;
    compResistance: number;
    voltdiff: number;
    seriesResistance: number;
    initialVoltage: number;
    capNode2: number;
    curSourceValue: number;
    plate1: Point[];
    plate2: Point[];
    static readonly FLAG_BACK_EULER = 2;
    static readonly FLAG_RESISTANCE = 4;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.capacitance = 1e-5;
            this.initialVoltage = 1e-3;
            this.compResistance = 0;
            this.voltdiff = 0;
            this.seriesResistance = 0;
            this.capNode2 = 0;
            this.curSourceValue = 0;
        } else {
            super(xa, ya, xb, yb!, f!);
            this.capacitance = parseFloat(st!.nextToken());
            this.voltdiff = parseFloat(st!.nextToken());
            this.initialVoltage = 1e-3;
            this.compResistance = 0;
            this.capNode2 = 0;
            this.seriesResistance = 0;
            this.curSourceValue = 0;
            try {
                this.initialVoltage = parseFloat(st!.nextToken());
                if ((this.flags & CapacitorElm.FLAG_RESISTANCE) !== 0)
                    this.seriesResistance = parseFloat(st!.nextToken());

                // if you add more things here, check PolarCapacitorElm.  It loads more state after this
            } catch (e) {}
            this.allocNodes();
        }
    }
    isTrapezoidal(): boolean { return (this.flags & CapacitorElm.FLAG_BACK_EULER) === 0; }

    reset(): void {
        super.reset();
        this.current = this.curcount = this.curSourceValue = 0;
        // put small charge on caps when reset to start oscillators
        this.voltdiff = this.initialVoltage;
    }
    shorted(): void {
        super.reset();
        this.voltdiff = this.current = this.curcount = this.curSourceValue = 0;
    }
    isCapacitorElm(): boolean { return true; }
    getDumpType(): number { return 'c'.charCodeAt(0); }

    dump(): string {
        this.flags |= CapacitorElm.FLAG_RESISTANCE;
        return super.dump() + " " + this.capacitance + " " + this.voltdiff + " " + this.initialVoltage + " " + this.seriesResistance;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        XMLSerializer.dumpAttr(elem, "c", this.capacitance);
        XMLSerializer.dumpAttr(elem, "iv", this.initialVoltage);
        XMLSerializer.dumpAttr(elem, "sr", this.seriesResistance);
        // PolarCapacitorElm uses mv
    }

    dumpXmlState(doc: Document, elem: Element): void {
        XMLSerializer.dumpAttr(elem, "vd", this.voltdiff);
    }

    undumpXml(xml: XMLDeserializer): void {
        super.undumpXml(xml);
        this.capacitance = xml.parseDoubleAttr("c", this.capacitance);
        this.initialVoltage = xml.parseDoubleAttr("iv", this.initialVoltage);
        this.seriesResistance = xml.parseDoubleAttr("sr", this.seriesResistance);
        this.voltdiff = xml.parseDoubleAttr("vd", this.voltdiff);
        this.allocNodes();
    }

    // used for PolarCapacitorElm
    platePoints: Point[];

    setPoints(): void {
        super.setPoints();
        const f = (this.dn/2-4)/this.dn;
        // calc leads
        this.lead1 = this.interpPoint(this.point1, this.point2, f);
        this.lead2 = this.interpPoint(this.point1, this.point2, 1-f);
        // calc plates
        this.plate1 = this.newPointArray(2);
        this.plate2 = this.newPointArray(2);
        this.interpPoint2(this.point1, this.point2, this.plate1[0], this.plate1[1], f, 12);
        this.interpPoint2(this.point1, this.point2, this.plate2[0], this.plate2[1], 1-f, 12);
    }

    draw(g: Graphics): void {
        const hs = 12;
        this.setBbox(this.point1, this.point2, hs);

        // draw first lead and plate
        this.setVoltageColor(g, this.volts[0]);
        CircuitElm.drawThickLine(g, this.point1, this.lead1);
        this.setPowerColor(g, false);
        CircuitElm.drawThickLine(g, this.plate1[0], this.plate1[1]);
        if (this.showPower())
            g.setColor(Color.gray);

        // draw second lead and plate
        this.setVoltageColor(g, this.volts[1]);
        CircuitElm.drawThickLine(g, this.point2, this.lead2);
        this.setPowerColor(g, false);
        if (this.platePoints == null)
            CircuitElm.drawThickLine(g, this.plate2[0], this.plate2[1]);
        else {
            let i: number;
            for (i = 0; i !== this.platePoints.length-1; i++)
                CircuitElm.drawThickLine(g, this.platePoints[i], this.platePoints[i+1]);
        }

        this.updateDotCount();
        if (!this.isCreating()) {
            this.drawDots(g, this.point1, this.lead1, this.curcount);
            this.drawDots(g, this.point2, this.lead2, -this.curcount);
        }
        this.drawPosts(g);
        if (this.showValues()) {
            const s = CircuitElm.getShortUnitText(this.capacitance, "F");
            this.drawValues(g, s, hs);
        }
    }
    stamp(): void {
        if (this.doDcAnalysis()) {
            // when finding DC operating point, replace cap with a 100M resistor
            CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], 1e8);
            this.curSourceValue = 0;
            this.capNode2 = 1;
            return;
        }

        // The capacitor model is between nodes 0 and capNode2.  For an
        // ideal capacitor, capNode2 is node 1.  If series resistance, capNode2 = 2
        // and we place a resistor between nodes 2 and 1.
        // 2 is an internal node, 0 and 1 are the capacitor terminals.
        this.capNode2 = (this.seriesResistance > 0) ? 2 : 1;

        // capacitor companion model using trapezoidal approximation
        // (Norton equivalent) consists of a current source in
        // parallel with a resistor.  Trapezoidal is more accurate
        // than backward euler but can cause oscillatory behavior
        // if RC is small relative to the timestep.
        if (this.isTrapezoidal())
            this.compResistance = CircuitElm.sim.timeStep/(2*this.capacitance);
        else
            this.compResistance = CircuitElm.sim.timeStep/this.capacitance;
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[this.capNode2], this.compResistance);
        //CircuitElm.sim.stampRightSide(this.nodes[0]);
        //CircuitElm.sim.stampRightSide(this.nodes[this.capNode2]);
        if (this.seriesResistance > 0)
            CircuitElm.sim.stampResistor(this.nodes[1], this.nodes[2], this.seriesResistance);
    }
    startIteration(): void {
        if (this.isTrapezoidal())
            this.curSourceValue = -this.voltdiff/this.compResistance-this.current;
        else
            this.curSourceValue = -this.voltdiff/this.compResistance;
    }

    stepFinished(): void {
        this.voltdiff = this.volts[0]-this.volts[this.capNode2];
        this.calculateCurrent();
    }

    setNodeVoltage(n: number, c: number): void {
        // do not calculate current, that only gets done in stepFinished().  otherwise calculateCurrent() may get
        // called while stamping the circuit, which might discharge the cap (since we use that current to calculate
        // curSourceValue in startIteration)
        this.volts[n] = c;
    }

    calculateCurrent(): void {
        const voltdiff = this.volts[0] - this.volts[this.capNode2];
        if (this.doDcAnalysis()) {
            this.current = voltdiff/1e8;
            return;
        }
        // we check compResistance because this might get called
        // before stamp(), which sets compResistance, causing
        // infinite current
        if (this.compResistance > 0)
            this.current = voltdiff/this.compResistance + this.curSourceValue;
    }
    doStep(): void {
        if (this.doDcAnalysis())
            return;
        CircuitElm.sim.stampCurrentSource(this.nodes[0], this.nodes[this.capNode2], this.curSourceValue);
    }
    getInternalNodeCount(): number { return (!this.doDcAnalysis() && this.seriesResistance > 0) ? 1 : 0; }
    getInfo(arr: string[]): void {
        arr[0] = "capacitor";
        this.getBasicInfo(arr);
        arr[3] = "C = " + CircuitElm.getUnitText(this.capacitance, "F");
        arr[4] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
        arr[5] = "Q = " + CircuitElm.getUnitText(this.capacitance * this.voltdiff, "C");
    }
    getScopeText(v: number): string {
        return Locale.LS("capacitor") + ", " + CircuitElm.getUnitText(this.capacitance, "F");
    }
    getScopeValue(x: number): number {
        if (x === Scope.VAL_CHARGE)
            return this.capacitance * this.voltdiff;
        return super.getScopeValue(x);
    }
    getScopeUnits(x: number): number {
        if (x === Scope.VAL_CHARGE)
            return Scope.UNITS_C;
        return super.getScopeUnits(x);
    }
    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Capacitance (F)", this.capacitance, 1e-6, 1e-3);
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Trapezoidal Approximation", this.isTrapezoidal());
            return ei;
        }
        if (n === 2)
            return new EditInfo("Initial Voltage (on Reset)", this.initialVoltage);
        if (n === 3)
            return new EditInfo("Series Resistance", this.seriesResistance);
        // if you add more things here, check PolarCapacitorElm
        return null;
    }
    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.capacitance = (ei.value > 0) ? ei.value : 1e-12;
        if (n === 1) {
            if (ei.checkbox!.getState())
                this.flags &= ~CapacitorElm.FLAG_BACK_EULER;
            else
                this.flags |= CapacitorElm.FLAG_BACK_EULER;
        }
        if (n === 2)
            this.initialVoltage = ei.value;
        if (n === 3) {
            this.seriesResistance = ei.value;
            this.allocNodes();
        }
    }
    getShortcut(): number { return 'c'.charCodeAt(0); }
    getCapacitance(): number { return this.capacitance; }
    getSeriesResistance(): number { return this.seriesResistance; }
    setCapacitance(c: number): void { this.capacitance = c; }
    setSeriesResistance(c: number): void { this.seriesResistance = c; }
    isIdealCapacitor(): boolean { return (this.seriesResistance === 0); }

    addRoutingObstacle(wr: WireRouter): void { this.addRoutingObstacleWithLeads(wr, 12); }
    validate(): boolean {
        if (this.isIdealCapacitor()) {
            let fpi = new FindPathInfo(FindPathInfo.SHORT, this, this.getNode(1), CircuitElm.sim);
            if (fpi.findPath(this.getNode(0))) {
                CirSim.console(this + " shorted");
                this.shorted();
            } else {
                fpi = new FindPathInfo(FindPathInfo.CAP_V, this, this.getNode(1), CircuitElm.sim);
                if (fpi.findPath(this.getNode(0))) {
                    // loop of ideal capacitors; set a small series resistance to avoid
                    // oscillation in case one of them has voltage on it
                    this.setSeriesResistance(.1);
                    return false;
                }
            }
        }
        return true;
    }
}
