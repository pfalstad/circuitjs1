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

import { SwitchElm } from "./SwitchElm";
import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { Graphics } from "./Graphics";
import { Font } from "./Font";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { Rectangle } from "./Rectangle";
import { WireRouter } from "./WireRouter";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class LogicInputElm extends SwitchElm {
    static readonly FLAG_TERNARY = 1;
    static readonly FLAG_NUMERIC = 2;
    hiV: number;
    loV: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya, false);
            this.hiV = 5;
            this.loV = 0;
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            try {
                this.hiV = parseFloat(st!.nextToken());
                this.loV = parseFloat(st!.nextToken());
            } catch (e) {
                this.hiV = 5;
                this.loV = 0;
            }
            if (this.isTernary())
                this.posCount = 3;
        }
    }

    isTernary(): boolean { return (this.flags & LogicInputElm.FLAG_TERNARY) !== 0; }
    isNumeric(): boolean { return (this.flags & (LogicInputElm.FLAG_TERNARY | LogicInputElm.FLAG_NUMERIC)) !== 0; }

    getDumpType(): number { return 'L'.charCodeAt(0); }

    dump(): string {
        return super.dump() + " " + this.hiV + " " + this.loV;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        if (this.hiV !== 5)
            CircuitXMLSerializer.dumpAttr(elem, "hi", this.hiV);
        if (this.loV !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "lo", this.loV);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.hiV = xml.parseDoubleAttr("hi", this.hiV);
        this.loV = xml.parseDoubleAttr("lo", this.loV);
    }

    getPostCount(): number { return 1; }

    setPoints(): void {
        super.setPoints();
        this.lead1 = this.interpPoint(this.point1, this.point2, 1 - 12/this.dn);
    }

    draw(g: Graphics): void {
        g.save();
        const f = new Font("SansSerif", Font.BOLD, 20);
        g.setFont(f);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.whiteColor);
        let s = this.position === 0 ? "L" : "H";
        if (this.isNumeric())
            s = "" + this.position;
        this.setBbox(this.point1, this.lead1!, 0);
        this.drawCenteredText(g, s, this.x2, this.y2, true);
        this.setVoltageColor(g, this.volts[0]);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        this.updateDotCount();
        this.drawDots(g, this.point1, this.lead1!, -this.curcount);
        this.drawPosts(g);
        g.restore();
    }

    getSwitchRect(): Rectangle {
        return new Rectangle(this.x2 - 10, this.y2 - 10, 20, 20);
    }

    setCurrent(vs: any, c: number): void { this.current = c; }
    calculateCurrent(): void {}

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[0], this.voltSource);
    }

    isWireEquivalent(): boolean { return false; }
    isRemovableWire(): boolean { return false; }

    doStep(): void {
        let v = (this.position === 0) ? this.loV : this.hiV;
        if (this.isTernary())
            v = this.loV + this.position * (this.hiV - this.loV) * .5;
        CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[0], this.voltSource, v);
    }

    getVoltageSourceCount(): number { return 1; }
    getVoltageDiff(): number { return this.volts[0]; }
    getElmType(): string { return "logic input"; }

    getInfo(arr: string[]): void {
        arr[0] = "logic input";
        arr[1] = (this.position === 0) ? "low" : "high";
        if (this.isNumeric())
            arr[1] = "" + this.position;
        arr[1] += " (" + CircuitElm.getVoltageText(this.volts[0]) + ")";
        arr[2] = "I = " + CircuitElm.getCurrentText(this.getCurrent());
    }

    hasGroundConnection(n1: number): boolean { return true; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, 0, 0);
            ei.checkbox = new Checkbox("Momentary Switch", this.momentary);
            return ei;
        }
        if (n === 1)
            return new EditInfo("High Logic Voltage", this.hiV, 10, -10);
        if (n === 2)
            return new EditInfo("Low Voltage", this.loV, 10, -10);
        if (n === 3) {
            const ei = new EditInfo("", 0, 0, 0);
            ei.checkbox = new Checkbox("Numeric", this.isNumeric());
            return ei;
        }
        if (n === 4) {
            const ei = new EditInfo("", 0, 0, 0);
            ei.checkbox = new Checkbox("Ternary", this.isTernary());
            return ei;
        }
        if (n === 5)
            return this.getKeyShortcutEditInfo();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.momentary = ei.checkbox.getState();
        if (n === 1)
            this.hiV = ei.value;
        if (n === 2)
            this.loV = ei.value;
        if (n === 3) {
            if (ei.checkbox.getState())
                this.flags |= LogicInputElm.FLAG_NUMERIC;
            else
                this.flags &= ~LogicInputElm.FLAG_NUMERIC;
        }
        if (n === 4) {
            if (ei.checkbox.getState())
                this.flags |= LogicInputElm.FLAG_TERNARY;
            else
                this.flags &= ~LogicInputElm.FLAG_TERNARY;
            this.posCount = this.isTernary() ? 3 : 2;
        }
        if (n === 5)
            this.setKeyShortcutEditValue(ei);
    }

    addRoutingObstacle(router: WireRouter): void {
        router.addWire(this.point1.x, this.point1.y, this.lead1!.x, this.lead1!.y);
        router.addObstacle(this.x2 - 10, this.y2 - 10, this.x2 + 10, this.y2 + 10);
    }

    getShortcut(): number { return 'i'.charCodeAt(0); }

    getCurrentIntoNode(n: number): number { return this.current; }

    validate(): boolean { return this.validateRailNode(0); }
}
