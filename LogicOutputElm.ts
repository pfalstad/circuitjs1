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
import { CircuitNode } from "./CircuitNode";
import { Graphics } from "./Graphics";
import { Font } from "./Font";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { WireRouter } from "./WireRouter";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class LogicOutputElm extends CircuitElm {
    static readonly FLAG_TERNARY = 1;
    static readonly FLAG_NUMERIC = 2;
    static readonly FLAG_PULLDOWN = 4;
    threshold: number;
    value: string;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.threshold = 2.5;
        } else {
            super(xa, ya, xb, yb!, f!);
            try {
                this.threshold = parseFloat(st!.nextToken());
            } catch (e) {
                this.threshold = 2.5;
            }
        }
    }

    dump(): string {
        return super.dump() + " " + this.threshold;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        if (this.threshold !== 2.5)
            CircuitXMLSerializer.dumpAttr(elem, "th", this.threshold);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.threshold = xml.parseDoubleAttr("th", this.threshold);
    }

    isLogicOutputElm(): boolean { return true; }
    getDumpType(): number { return 'M'.charCodeAt(0); }
    getPostCount(): number { return 1; }
    isTernary(): boolean { return (this.flags & LogicOutputElm.FLAG_TERNARY) !== 0; }
    isNumeric(): boolean { return (this.flags & (LogicOutputElm.FLAG_TERNARY | LogicOutputElm.FLAG_NUMERIC)) !== 0; }
    needsPullDown(): boolean { return (this.flags & LogicOutputElm.FLAG_PULLDOWN) !== 0; }

    setPoints(): void {
        super.setPoints();
        this.lead1 = this.interpPoint(this.point1, this.point2, 1 - 12/this.dn);
    }

    draw(g: Graphics): void {
        g.save();
        const f = new Font("SansSerif", Font.BOLD, 20);
        g.setFont(f);
        //g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        g.setColor(CircuitElm.lightGrayColor);
        let s = (this.volts[0] < this.threshold) ? "L" : "H";
        if (this.isTernary()) {
            // we don't have 2 separate thresholds for ternary inputs so we do this instead
            if (this.volts[0] > this.threshold * 1.5)   // 3.75 V
                s = "2";
            else if (this.volts[0] > this.threshold * .5)  // 1.25 V
                s = "1";
            else
                s = "0";
        } else if (this.isNumeric())
            s = (this.volts[0] < this.threshold) ? "0" : "1";
        this.value = s;
        this.setBbox(this.point1, this.lead1!, 0);
        this.drawCenteredText(g, s, this.x2, this.y2, true);
        this.setVoltageColor(g, this.volts[0]);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        this.drawPosts(g);
        g.restore();
    }

    stamp(): void {
        if (this.needsPullDown())
            CircuitElm.sim.stampResistor(this.nodes[0], CircuitNode.ground, 1e6);
    }

    getVoltageDiff(): number { return this.volts[0]; }

    getInfo(arr: string[]): void {
        arr[0] = "logic output";
        arr[1] = (this.volts[0] < this.threshold) ? "low" : "high";
        if (this.isNumeric())
            arr[1] = this.value;
        arr[2] = "V = " + CircuitElm.getVoltageText(this.volts[0]);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Threshold", this.threshold, 10, -10);
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Current Required", this.needsPullDown());
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("", 0, 0, 0);
            ei.checkbox = new Checkbox("Numeric", this.isNumeric());
            return ei;
        }
        if (n === 3) {
            const ei = new EditInfo("", 0, 0, 0);
            ei.checkbox = new Checkbox("Ternary", this.isTernary());
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.threshold = ei.value;
        if (n === 1) {
            if (ei.checkbox.getState())
                this.flags |= LogicOutputElm.FLAG_PULLDOWN;
            else
                this.flags &= ~LogicOutputElm.FLAG_PULLDOWN;
        }
        if (n === 2) {
            if (ei.checkbox.getState())
                this.flags |= LogicOutputElm.FLAG_NUMERIC;
            else
                this.flags &= ~LogicOutputElm.FLAG_NUMERIC;
        }
        if (n === 3) {
            if (ei.checkbox.getState())
                this.flags |= LogicOutputElm.FLAG_TERNARY;
            else
                this.flags &= ~LogicOutputElm.FLAG_TERNARY;
        }
    }

    addRoutingObstacle(router: WireRouter): void {
        router.addWire(this.point1.x, this.point1.y, this.lead1!.x, this.lead1!.y);
        router.addObstacle(this.x2 - 10, this.y2 - 10, this.x2 + 10, this.y2 + 10);
    }

    getShortcut(): number { return 'o'.charCodeAt(0); }
}
