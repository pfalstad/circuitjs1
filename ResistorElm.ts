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
import { WireRouter } from "./WireRouter";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class ResistorElm extends CircuitElm {
    resistance: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.resistance = 1000;
        } else {
            super(xa, ya, xb, yb!, f!);
            this.resistance = parseFloat(st!.nextToken());
        }
    }

    isResistorElm(): boolean { return true; }
    getDumpType(): number { return 'r'.charCodeAt(0); }

    dump(): string {
        return super.dump() + " " + this.resistance;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "r", this.resistance);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.resistance = xml.parseDoubleAttr("r", this.resistance);
    }

    ps3: Point = new Point();
    ps4: Point = new Point();

    setPoints(): void {
        super.setPoints();
        this.calcLeads(32);
        this.ps3 = new Point();
        this.ps4 = new Point();
    }

    draw(g: Graphics): void {
        const segments = 16;
        let i: number;
        const ox = 0;
        //int hs = showEuroResistors() ? 6 : 8;
        let hs = 6;
        const v1 = this.nodes[0].v;
        const v2 = this.nodes[1].v;
        this.setBbox(this.point1, this.point2, hs);
        this.draw2Leads(g);

        //   double segf = 1./segments;
        const len = CircuitElm.distance(this.lead1!, this.lead2!);
        g.context.save();
        g.context.lineWidth = 3.0;
        g.context.transform(((this.lead2!.x - this.lead1!.x))/len, ((this.lead2!.y - this.lead1!.y))/len,
                -((this.lead2!.y - this.lead1!.y))/len, ((this.lead2!.x - this.lead1!.x))/len, this.lead1!.x, this.lead1!.y);
        if (CircuitElm.app.menus.voltsCheckItem.getState()) {
            const grad = g.context.createLinearGradient(0, 0, len, 0);
            grad.addColorStop(0, this.getVoltageColor(g, v1).getHexValue());
            grad.addColorStop(1.0, this.getVoltageColor(g, v2).getHexValue());
            g.context.strokeStyle = grad;
        } else
            this.setPowerColor(g, true);
        if (this.dn < 30)
            hs = 2;
        if (!this.showEuroResistors()) {
            g.context.beginPath();
            g.context.moveTo(0, 0);
            for (i = 0; i < 4; i++) {
                g.context.lineTo((1+4*i)*len/16, hs);
                g.context.lineTo((3+4*i)*len/16, -hs);
            }
            g.context.lineTo(len, 0);
            g.context.stroke();

        } else {
            g.context.strokeRect(0, -hs, len, 2.0*hs);
        }
        g.context.restore();
        if (this.showValues()) {
            const s = CircuitElm.getShortUnitText(this.resistance, this.showOhmSymbol() ? Locale.ohmString : "");
            this.drawValues(g, s, hs+2);
        }
        this.doDots(g);
        this.drawPosts(g);
    }

    addRoutingObstacle(wr: WireRouter): void { this.addRoutingObstacleWithLeads(wr, 6); }

    calculateCurrent(): void {
        this.current = (this.nodes[0].v - this.nodes[1].v) / this.resistance;
        //System.out.print(this + " res current set to " + current + "\n");
    }

    stamp(): void {
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
    }

    getInfo(arr: string[]): void {
        arr[0] = "resistor";
        this.getBasicInfo(arr);
        arr[3] = "R = " + CircuitElm.getUnitText(this.resistance, Locale.ohmString);
        arr[4] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
    }

    getScopeText(v: number): string {
        return Locale.LS("resistor") + ", " + CircuitElm.getUnitText(this.resistance, Locale.ohmString);
    }

    getEditInfo(n: number): EditInfo | null {
        // ohmString doesn't work here on linux
        if (n === 0)
            return new EditInfo("Resistance (ohms)", this.resistance, 0, 0);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        this.resistance = (ei.value <= 0) ? 1e-9 : ei.value;
    }

    getShortcut(): number { return 'r'.charCodeAt(0); }
    getResistance(): number { return this.resistance; }
    setResistance(r: number): void { this.resistance = r; }
}
