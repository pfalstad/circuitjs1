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
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { VAL_R, UNITS_OHMS } from "./ScopeConstants";

export class MemristorElm extends CircuitElm {
    r_on: number;
    r_off: number;
    dopeWidth: number;
    totalWidth: number;
    mobility: number;
    resistance: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.r_on = parseFloat(st.nextToken());
            this.r_off = parseFloat(st.nextToken());
            this.dopeWidth = parseFloat(st.nextToken());
            this.totalWidth = parseFloat(st.nextToken());
            this.mobility = parseFloat(st.nextToken());
            try {
                this.current = parseFloat(st.nextToken());
            } catch (e) {}
        } else {
            this.r_on = 100;
            this.r_off = 160 * this.r_on;
            this.dopeWidth = 0;
            this.totalWidth = 10e-9; // meters
            this.mobility = 1e-10;   // m^2/sV
        }
        this.resistance = 100;
    }

    getDumpType(): number { return 'm'.charCodeAt(0); }

    dump(): string {
        return super.dump() + " " + this.r_on + " " + this.r_off + " "
            + this.dopeWidth + " " + this.totalWidth + " " + this.mobility;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ron", this.r_on);
        CircuitXMLSerializer.dumpAttr(elem, "rof", this.r_off);
        CircuitXMLSerializer.dumpAttr(elem, "do", this.dopeWidth);
        CircuitXMLSerializer.dumpAttr(elem, "to", this.totalWidth);
        CircuitXMLSerializer.dumpAttr(elem, "mo", this.mobility);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.r_on = xml.parseDoubleAttr("ron", this.r_on);
        this.r_off = xml.parseDoubleAttr("rof", this.r_off);
        this.dopeWidth = xml.parseDoubleAttr("do", this.dopeWidth);
        this.totalWidth = xml.parseDoubleAttr("to", this.totalWidth);
        this.mobility = xml.parseDoubleAttr("mo", this.mobility);
    }

    ps3: Point;
    ps4: Point;

    setPoints(): void {
        super.setPoints();
        this.calcLeads(32);
        this.ps3 = new Point();
        this.ps4 = new Point();
    }

    draw(g: Graphics): void {
        const segments = 6;
        let ox = 0;
        const hs = 2 + Math.floor(8 * (1 - this.dopeWidth / this.totalWidth));
        this.setBbox(this.point1, this.point2, hs);
        this.draw2Leads(g);
        this.setPowerColor(g, true);
        const segf = 1.0 / segments;

        // draw zigzag
        for (let i = 0; i <= segments; i++) {
            let nx = (i & 1) === 0 ? 1 : -1;
            if (i === segments)
                nx = 0;
            const v = this.nodes[0].v + (this.nodes[1].v - this.nodes[0].v) * i / segments;
            this.setVoltageColor(g, v);
            this.interpPoint(this.lead1!, this.lead2!, CircuitElm.ps1, i * segf, hs * ox);
            this.interpPoint(this.lead1!, this.lead2!, CircuitElm.ps2, i * segf, hs * nx);
            CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
            if (i === segments)
                break;
            this.interpPoint(this.lead1!, this.lead2!, CircuitElm.ps1, (i + 1) * segf, hs * nx);
            CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
            ox = nx;
        }

        this.doDots(g);
        this.drawPosts(g);
    }

    nonLinear(): boolean { return true; }

    calculateCurrent(): void {
        this.current = (this.nodes[0].v - this.nodes[1].v) / this.resistance;
    }

    reset(): void {
        this.dopeWidth = 0;
    }

    startIteration(): void {
        const wd = this.dopeWidth / this.totalWidth;
        this.dopeWidth += CircuitElm.sim.timeStep * this.mobility * this.r_on * this.current / this.totalWidth;
        if (this.dopeWidth < 0)
            this.dopeWidth = 0;
        if (this.dopeWidth > this.totalWidth)
            this.dopeWidth = this.totalWidth;
        this.resistance = this.r_on * wd + this.r_off * (1 - wd);
    }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[0]);
        CircuitElm.sim.stampNonLinear(this.nodes[1]);
    }

    doStep(): void {
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
    }

    getInfo(arr: string[]): void {
        arr[0] = "memristor";
        this.getBasicInfo(arr);
        arr[3] = "R = " + CircuitElm.getUnitText(this.resistance, Locale.ohmString);
        arr[4] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
    }

    getScopeValue(x: number): number {
        return (x === VAL_R) ? this.resistance : super.getScopeValue(x);
    }

    getScopeUnits(x: number): number {
        return (x === VAL_R) ? UNITS_OHMS : super.getScopeUnits(x);
    }

    canShowValueInScope(x: number): boolean {
        return x === VAL_R;
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Min Resistance (ohms)", this.r_on, 0, 0);
        if (n === 1)
            return new EditInfo("Max Resistance (ohms)", this.r_off, 0, 0);
        if (n === 2)
            return new EditInfo("Width of Doped Region (nm)", this.dopeWidth * 1e9, 0, 0);
        if (n === 3)
            return new EditInfo("Total Width (nm)", this.totalWidth * 1e9, 0, 0);
        if (n === 4)
            return new EditInfo("Mobility (um^2/(s*V))", this.mobility * 1e12, 0, 0);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.r_on = ei.value;
        if (n === 1)
            this.r_off = ei.value;
        if (n === 2)
            this.dopeWidth = ei.value * 1e-9;
        if (n === 3)
            this.totalWidth = ei.value * 1e-9;
        if (n === 4)
            this.mobility = ei.value * 1e-12;
    }
}
