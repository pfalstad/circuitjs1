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
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Diode } from "./Diode";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";

export class DiacElm extends CircuitElm {
    // resistor from 0 to 2, 3
    // diodes from 2, 3 to 1
    onresistance: number;
    offresistance: number;
    breakdown: number;
    holdcurrent: number;
    state: boolean = false;
    diode1!: Diode;
    diode2!: Diode;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.offresistance = 1e8;
            this.onresistance  = 500;
            this.breakdown     = 30;
            this.holdcurrent   = .01;
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.onresistance  = parseFloat(st!.nextToken());
            this.offresistance = parseFloat(st!.nextToken());
            this.breakdown     = parseFloat(st!.nextToken());
            this.holdcurrent   = parseFloat(st!.nextToken());
        }
        this.createDiodes();
    }

    createDiodes(): void {
        this.diode1 = new Diode(CircuitElm.sim);
        this.diode2 = new Diode(CircuitElm.sim);
        this.diode1.setupForDefaultModel();
        this.diode2.setupForDefaultModel();
    }

    nonLinear(): boolean { return true; }
    getDumpType(): number { return 203; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ron",  this.onresistance);
        CircuitXMLSerializer.dumpAttr(elem, "roff", this.offresistance);
        CircuitXMLSerializer.dumpAttr(elem, "bd",   this.breakdown);
        CircuitXMLSerializer.dumpAttr(elem, "hc",   this.holdcurrent);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.onresistance  = xml.parseDoubleAttr("ron",  this.onresistance);
        this.offresistance = xml.parseDoubleAttr("roff", this.offresistance);
        this.breakdown     = xml.parseDoubleAttr("bd",   this.breakdown);
        this.holdcurrent   = xml.parseDoubleAttr("hc",   this.holdcurrent);
    }

    arrows!: Polygon[];
    plate1!: Point[];
    plate2!: Point[];

    setPoints(): void {
        super.setPoints();
        this.calcLeads(16);

        this.plate1 = this.newPointArray(2);
        this.plate2 = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, this.plate1[0], this.plate1[1], 0, 16);
        this.interpPoint2(this.lead1!, this.lead2!, this.plate2[0], this.plate2[1], 1, 16);

        this.arrows = new Array(2);
        for (let i = 0; i !== 2; i++) {
            const sgn = -1 + i * 2;
            const p1 = this.interpPoint(this.lead1!, this.lead2!, i,     8 * sgn);
            const p2 = this.interpPoint(this.lead1!, this.lead2!, 1 - i, 16 * sgn);
            const p3 = this.interpPoint(this.lead1!, this.lead2!, 1 - i,  0 * sgn);
            this.arrows[i] = this.createPolygon(p1, p2, p3);
        }
    }

    draw(g: Graphics): void {
        const v1 = this.nodes[0].v;
        const v2 = this.nodes[1].v;
        this.setBbox(this.point1, this.point2, 6);
        this.draw2Leads(g);
        this.setVoltageColor(g, v1);
        this.setPowerColor(g, true);
        CircuitElm.drawThickLine(g, this.plate1[0], this.plate1[1]);
        this.setVoltageColor(g, v2);
        this.setPowerColor(g, true);
        CircuitElm.drawThickLine(g, this.plate2[0], this.plate2[1]);
        g.fillPolygon(this.arrows[0]);
        this.setVoltageColor(g, v1);
        this.setPowerColor(g, true);
        g.fillPolygon(this.arrows[1]);
        this.setPowerColor(g, true);
        this.doDots(g);
        this.drawPosts(g);
    }

    calculateCurrent(): void {
        const r = this.state ? this.onresistance : this.offresistance;
        this.current = (this.nodes[0].v - this.nodes[2].v) / r + (this.nodes[0].v - this.nodes[3].v) / r;
    }

    startIteration(): void {
        const vd = this.nodes[0].v - this.nodes[1].v;
        if (Math.abs(this.current) < this.holdcurrent) this.state = false;
        if (Math.abs(vd) > this.breakdown) this.state = true;
    }

    doStep(): void {
        const r = this.state ? this.onresistance : this.offresistance;
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[2], r);
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[3], r);
        this.diode1.doStep(this.nodes[2].v - this.nodes[1].v);
        this.diode2.doStep(this.nodes[1].v - this.nodes[3].v);
    }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[0]);
        CircuitElm.sim.stampNonLinear(this.nodes[1]);
        this.diode1.stamp(this.nodes[2], this.nodes[1]);
        this.diode2.stamp(this.nodes[1], this.nodes[3]);
    }

    getInternalNodeCount(): number { return 2; }

    getInfo(arr: string[]): void {
        arr[0] = "DIAC";
        this.getBasicInfo(arr);
        arr[3] = this.state ? "on" : "off";
        arr[4] = "Ron = "    + CircuitElm.getUnitText(this.onresistance,  Locale.ohmString);
        arr[5] = "Roff = "   + CircuitElm.getUnitText(this.offresistance, Locale.ohmString);
        arr[6] = "Vbrkdn = " + CircuitElm.getUnitText(this.breakdown, "V");
        arr[7] = "Ihold = "  + CircuitElm.getUnitText(this.holdcurrent, "A");
        arr[8] = "P = "      + CircuitElm.getUnitText(this.getPower(), "W");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("On resistance (ohms)",      this.onresistance,  0, 0);
        if (n === 1) return new EditInfo("Off resistance (ohms)",     this.offresistance, 0, 0);
        if (n === 2) return new EditInfo("Breakdown voltage (volts)", this.breakdown,     0, 0);
        if (n === 3) return new EditInfo("Hold current (amps)",       this.holdcurrent,   0, 0);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (ei.value > 0 && n === 0) this.onresistance  = ei.value;
        if (ei.value > 0 && n === 1) this.offresistance = ei.value;
        if (ei.value > 0 && n === 2) this.breakdown     = ei.value;
        if (ei.value > 0 && n === 3) this.holdcurrent   = ei.value;
    }

}
