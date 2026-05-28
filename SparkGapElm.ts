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
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";

export class SparkGapElm extends CircuitElm {
    resistance: number;
    onresistance: number;
    offresistance: number;
    breakdown: number;
    holdcurrent: number;
    state: boolean;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.onresistance = parseFloat(st.nextToken());
            this.offresistance = parseFloat(st.nextToken());
            this.breakdown = parseFloat(st.nextToken());
            this.holdcurrent = parseFloat(st.nextToken());
        } else {
            this.offresistance = 1e9;
            this.onresistance = 1e3;
            this.breakdown = 1e3;
            this.holdcurrent = 0.001;
        }
        this.state = false;
        this.resistance = this.offresistance;
    }

    nonLinear(): boolean { return true; }
    getDumpType(): number { return 187; }

    dump(): string {
        return super.dump() + " " + this.onresistance + " " + this.offresistance + " "
            + this.breakdown + " " + this.holdcurrent;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "on", this.onresistance);
        CircuitXMLSerializer.dumpAttr(elem, "of", this.offresistance);
        CircuitXMLSerializer.dumpAttr(elem, "br", this.breakdown);
        CircuitXMLSerializer.dumpAttr(elem, "ho", this.holdcurrent);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.onresistance = xml.parseDoubleAttr("on", this.onresistance);
        this.offresistance = xml.parseDoubleAttr("of", this.offresistance);
        this.breakdown = xml.parseDoubleAttr("br", this.breakdown);
        this.holdcurrent = xml.parseDoubleAttr("ho", this.holdcurrent);
    }

    arrow1: Polygon;
    arrow2: Polygon;

    setPoints(): void {
        super.setPoints();
        const dist = 16;
        const alen = 8;
        this.calcLeads(dist + alen);
        let p1 = this.interpPoint(this.point1, this.point2, (this.dn - alen) / (2 * this.dn));
        this.arrow1 = this.calcArrow(this.point1, p1, alen, alen);
        p1 = this.interpPoint(this.point1, this.point2, (this.dn + alen) / (2 * this.dn));
        this.arrow2 = this.calcArrow(this.point2, p1, alen, alen);
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, 8);
        this.draw2Leads(g);
        this.setVoltageColor(g, this.nodes[0].v);
        this.setPowerColor(g, true);
        g.fillPolygon(this.arrow1);
        this.setVoltageColor(g, this.nodes[1].v);
        this.setPowerColor(g, true);
        g.fillPolygon(this.arrow2);
        if (this.state)
            this.doDots(g);
        this.drawPosts(g);
    }

    calculateCurrent(): void {
        const vd = this.nodes[0].v - this.nodes[1].v;
        this.current = vd / this.resistance;
    }

    reset(): void {
        super.reset();
        this.state = false;
    }

    startIteration(): void {
        if (Math.abs(this.current) < this.holdcurrent)
            this.state = false;
        const vd = this.nodes[0].v - this.nodes[1].v;
        if (Math.abs(vd) > this.breakdown)
            this.state = true;
    }

    doStep(): void {
        this.resistance = this.state ? this.onresistance : this.offresistance;
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
    }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[0]);
        CircuitElm.sim.stampNonLinear(this.nodes[1]);
    }

    getInfo(arr: string[]): void {
        arr[0] = "spark gap";
        this.getBasicInfo(arr);
        arr[3] = this.state ? "on" : "off";
        arr[4] = "Ron = " + CircuitElm.getUnitText(this.onresistance, Locale.ohmString);
        arr[5] = "Roff = " + CircuitElm.getUnitText(this.offresistance, Locale.ohmString);
        arr[6] = "Vbreakdown = " + CircuitElm.getUnitText(this.breakdown, "V");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("On resistance (ohms)", this.onresistance, 0, 0);
        if (n === 1)
            return new EditInfo("Off resistance (ohms)", this.offresistance, 0, 0);
        if (n === 2)
            return new EditInfo("Breakdown voltage", this.breakdown, 0, 0);
        if (n === 3)
            return new EditInfo("Holding current (A)", this.holdcurrent, 0, 0);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (ei.value > 0 && n === 0)
            this.onresistance = ei.value;
        if (ei.value > 0 && n === 1)
            this.offresistance = ei.value;
        if (ei.value > 0 && n === 2)
            this.breakdown = ei.value;
        if (ei.value > 0 && n === 3)
            this.holdcurrent = ei.value;
    }
}
