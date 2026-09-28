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

import { CapacitorElm } from "./CapacitorElm";
import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { parseFloatStrict } from "./NumberParse";

export class PolarCapacitorElm extends CapacitorElm {
    maxNegativeVoltage: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f, st);
        if (st !== undefined) {
            this.maxNegativeVoltage = parseFloatStrict(st.nextToken());
        } else {
            this.maxNegativeVoltage = 1;
        }
    }

    getDumpType(): number { return 209; }
    getXmlDumpType(): string { return "pc"; }

    dump(): string {
        return super.dump() + " " + this.maxNegativeVoltage;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "mv", this.maxNegativeVoltage);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.maxNegativeVoltage = xml.parseDoubleAttr("mv", this.maxNegativeVoltage);
    }

    plusPoint: Point;

    setPoints(): void {
        super.setPoints();
        const f = (this.dn / 2 - 4) / this.dn;
        this.platePoints = this.newPointArray(14);
        const maxI = this.platePoints.length - 1;
        const midI = maxI / 2;
        for (let i = 0; i <= maxI; i++) {
            const q = (i - midI) * 0.9 / midI;
            this.platePoints[i] = this.interpPoint(this.plate2[0], this.plate2[1], i / maxI, 5 * (1 - Math.sqrt(1 - q * q)));
        }
        this.plusPoint = this.interpPoint(this.point1, this.point2, f - 8 / this.dn, -10 * this.dsign);
        if (this.y2 > this.y)
            this.plusPoint.y += 4;
        if (this.y > this.y2)
            this.plusPoint.y += 3;
    }

    draw(g: Graphics): void {
        super.draw(g);
        g.setColor(CircuitElm.whiteColor);
        g.setFont(CircuitElm.unitsFont);
        const w = Math.floor(g.context.measureText("+").width);
        g.drawString("+", this.plusPoint.x - Math.floor(w / 2), this.plusPoint.y);
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        arr[0] = "capacitor (polarized)";
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 4)
            return new EditInfo("Max Reverse Voltage", this.maxNegativeVoltage, 0, 0);
        return super.getEditInfo(n);
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 4) {
            if (ei.value >= 0)
                this.maxNegativeVoltage = ei.value;
            else
                ei.setError("must be >= 0");
        }
        super.setEditValue(n, ei);
    }

    stepFinished(): void {
        if (this.getVoltageDiff() < 0 && this.getVoltageDiff() < -this.maxNegativeVoltage)
            CircuitElm.sim.stop("capacitor exceeded max reverse voltage", this);
        super.stepFinished();
    }

    getShortcut(): number { return 'C'.charCodeAt(0); }
}
