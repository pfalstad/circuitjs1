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
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { SimulationManager } from "./SimulationManager";

export class AnalogSwitchElm extends CircuitElm {
    readonly FLAG_INVERT   = 1;
    readonly FLAG_PULLDOWN = 2;
    readonly FLAG_FLIPPED_X = 4;
    readonly FLAG_FLIPPED_Y = 8;
    readonly FLAG_FLIPPED   = 16;

    resistance: number = 0;
    r_on: number = 20;
    r_off: number = 1e10;
    threshold: number = 2.5;
    open: boolean = false;
    openhs: number = 16;

    ps: Point = new Point();
    point3: Point = new Point();
    lead3: Point = new Point();

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.r_on = 20;
            this.r_off = 1e10;
            this.threshold = 2.5;
            this.noDiagonal = true;
            this.flags |= this.FLAG_PULLDOWN;
        } else {
            super(xa, ya, xb, yb!, f!);
            this.r_on = 20;
            this.r_off = 1e10;
            this.threshold = 2.5;
            this.noDiagonal = true;
            try {
                this.r_on       = parseFloat(st!.nextToken());
                this.r_off      = parseFloat(st!.nextToken());
                this.threshold  = parseFloat(st!.nextToken());
            } catch (_e) {}
        }
    }

    dump(): string {
        return super.dump() + " " + this.r_on + " " + this.r_off + " " + this.threshold;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ron", this.r_on);
        CircuitXMLSerializer.dumpAttr(elem, "roff", this.r_off);
        CircuitXMLSerializer.dumpAttr(elem, "th", this.threshold);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.r_on      = xml.parseDoubleAttr("ron", this.r_on);
        this.r_off     = xml.parseDoubleAttr("roff", this.r_off);
        this.threshold = xml.parseDoubleAttr("th", this.threshold);
    }

    getDumpType(): number { return 159; }
    getXmlDumpType(): string { return "as"; }

    isFlippedX(): boolean { return this.hasFlag(this.FLAG_FLIPPED_X); }
    isFlippedY(): boolean { return this.hasFlag(this.FLAG_FLIPPED_Y); }
    isFlipped():  boolean { return this.hasFlag(this.FLAG_FLIPPED); }

    flipX(c2: number, count: number): void {
        this.flags ^= this.FLAG_FLIPPED_X;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        this.flags ^= this.FLAG_FLIPPED_Y;
        super.flipY(c2, count);
    }

    flipXY(c2: number, count: number): void {
        this.flags ^= this.FLAG_FLIPPED;
        super.flipXY(c2, count);
    }

    setPoints(): void {
        super.setPoints();
        this.calcLeads(32);
        this.adjustLeadsToGrid(this.isFlippedX(), this.isFlippedY());
        this.ps = new Point();
        this.openhs = (this.isFlippedX() !== this.isFlippedY()) !== this.isFlipped() ? -16 : 16;
        this.point3 = this.interpPoint(this.lead1!, this.lead2!, 0.5, -this.openhs);
        this.lead3  = this.interpPoint(this.lead1!, this.lead2!, 0.5, -this.openhs / 2);
    }

    draw(g: Graphics): void {
        const hs = this.open ? this.openhs : 0;
        this.setBbox(this.point1, this.point2, this.openhs);

        this.draw2Leads(g);

        g.setColor(CircuitElm.lightGrayColor);
        this.interpPoint(this.lead1!, this.lead2!, this.ps, 1, hs);
        CircuitElm.drawThickLine(g, this.lead1!, this.ps);

        this.setVoltageColor(g, this.volts[2]);
        CircuitElm.drawThickLine(g, this.point3, this.lead3);

        if (!this.open)
            this.doDots(g);
        this.drawPosts(g);
    }

    calculateCurrent(): void {
        if (this.resistance === 0)
            return;
        if (this.needsPulldown() && this.open)
            this.current = 0;
        else
            this.current = (this.volts[0] - this.volts[1]) / this.resistance;
    }

    nonLinear(): boolean { return true; }

    needsPulldown(): boolean { return this.hasFlag(this.FLAG_PULLDOWN); }

    stamp(): void {
        const sim = SimulationManager.theSim;
        sim.stampNonLinear(this.nodes[0]);
        sim.stampNonLinear(this.nodes[1]);
        if (this.needsPulldown()) {
            sim.stampResistor(this.nodes[0], CircuitNode.ground, this.r_off);
            sim.stampResistor(this.nodes[1], CircuitNode.ground, this.r_off);
        }
    }

    doStep(): void {
        const sim = SimulationManager.theSim;
        this.open = (this.volts[2] < this.threshold);
        if (this.hasFlag(this.FLAG_INVERT))
            this.open = !this.open;
        if (!(this.needsPulldown() && this.open)) {
            this.resistance = this.open ? this.r_off : this.r_on;
            sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
        }
    }

    getPostCount(): number { return 3; }

    getPost(n: number): Point {
        return (n === 0) ? this.point1 : (n === 1) ? this.point2 : this.point3;
    }

    getInfo(arr: string[]): void {
        arr[0] = "analog switch";
        arr[1] = this.open ? "open" : "closed";
        arr[2] = "Vd = " + CircuitElm.getVoltageDText(this.getVoltageDiff());
        arr[3] = "I = "  + CircuitElm.getCurrentDText(this.getCurrent());
        arr[4] = "Vc = " + CircuitElm.getVoltageText(this.volts[2]);
    }

    getConnection(n1: number, n2: number): boolean {
        if (n1 === 2 || n2 === 2) return false;
        return true;
    }

    hasGroundConnection(n1: number): boolean {
        return this.needsPulldown() && (n1 < 2);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Normally closed", this.hasFlag(this.FLAG_INVERT));
            return ei;
        }
        if (n === 1) return new EditInfo("On Resistance (ohms)", this.r_on, 0, 0).setPositive();
        if (n === 2) return new EditInfo("Off Resistance (ohms)", this.r_off, 0, 0).setPositive();
        if (n === 3) return EditInfo.createCheckbox("Pulldown Resistor", this.needsPulldown());
        if (n === 4) return new EditInfo("Threshold", this.threshold, 10, -10);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.flags = ei.checkbox!.getState() ? (this.flags | this.FLAG_INVERT) : (this.flags & ~this.FLAG_INVERT);
        if (n === 1 && ei.value > 0) this.r_on  = ei.value;
        if (n === 2 && ei.value > 0) this.r_off  = ei.value;
        if (n === 3) this.flags = ei.changeFlag(this.flags, this.FLAG_PULLDOWN);
        if (n === 4) this.threshold = ei.value;
    }

    getCurrentIntoNode(n: number): number {
        if (n === 2) return 0;
        if (n === 0) return -this.current;
        return this.current;
    }
}
