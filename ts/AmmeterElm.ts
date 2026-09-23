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

    AmmeterElm by Bill Collis
*/

import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Choice } from "./Choice";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageSource } from "./VoltageSource";
import { parseIntStrict } from "./NumberParse";
import { CustomLogicModel } from "./CustomLogicModel";

export class AmmeterElm extends CircuitElm {
    meter: number = 0;
    scale: number;

    static readonly AM_VOL = 0;
    static readonly AM_RMS = 1;

    static readonly FLAG_SHOWCURRENT = 1;
    static readonly FLAG_CIRCLE = 2;

    // optional name, drawn next to the reading and usable as i(label) in an expression
    label: string = "";

    zerocount: number = 0;
    rmsI: number = 0;
    total: number = 0;
    count: number = 0;
    maxI: number = 0;
    lastMaxI: number = 0;
    minI: number = 0;
    lastMinI: number = 0;
    selectedValue: number = 0;

    increasingI: boolean = true;
    decreasingI: boolean = true;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.flags = AmmeterElm.FLAG_SHOWCURRENT | AmmeterElm.FLAG_CIRCLE;
            this.scale = CircuitElm.SCALE_AUTO;
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.scale = CircuitElm.SCALE_AUTO;
            this.meter = parseIntStrict(st!.nextToken());
            try {
                this.scale = parseIntStrict(st!.nextToken());
            } catch (e) {}
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "me", this.meter);
        CircuitXMLSerializer.dumpAttr(elem, "sc", this.scale);
        if (this.label.length > 0)
            CircuitXMLSerializer.dumpAttr(elem, "lb", this.label);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.meter = xml.parseIntAttr("me", this.meter);
        this.scale = xml.parseIntAttr("sc", this.scale);
        this.label = xml.parseStringAttr("lb", "") ?? "";
    }

    getMeter(): string {
        switch (this.meter) {
        case AmmeterElm.AM_VOL: return "I";
        case AmmeterElm.AM_RMS: return "Irms";
        }
        return "";
    }

    center!: Point;
    mid!: Point;
    arrowPoly!: Polygon;

    setPoints(): void {
        super.setPoints();
        this.mid    = this.interpPoint(this.point1, this.point2, 0.6);
        this.center = this.interpPoint(this.point1, this.point2, 0.5);
        this.arrowPoly = this.calcArrow(this.point1, this.mid, 14, 7);
    }

    stepFinished(): void {
        this.count++;
        this.total += this.current * this.current;
        if (this.current > this.maxI && this.increasingI) {
            this.maxI = this.current;
            this.increasingI = true;
            this.decreasingI = false;
        }
        if (this.current < this.maxI && this.increasingI) {
            this.lastMaxI = this.maxI;
            this.minI = this.current;
            this.increasingI = false;
            this.decreasingI = true;

            this.total = this.total / this.count;
            this.rmsI = Math.sqrt(this.total);
            if (isNaN(this.rmsI)) this.rmsI = 0;
            this.count = 0;
            this.total = 0;
        }
        if (this.current < this.minI && this.decreasingI) {
            this.minI = this.current;
            this.increasingI = false;
            this.decreasingI = true;
        }
        if (this.current > this.minI && this.decreasingI) {
            this.lastMinI = this.minI;
            this.maxI = this.current;
            this.increasingI = true;
            this.decreasingI = false;

            this.total = this.total / this.count;
            this.rmsI = Math.sqrt(this.total);
            if (isNaN(this.rmsI)) this.rmsI = 0;
            this.count = 0;
            this.total = 0;
        }
        if (this.current === 0) {
            this.zerocount++;
            if (this.zerocount > 5) {
                this.total = 0;
                this.rmsI  = 0;
                this.maxI  = 0;
                this.minI  = 0;
            }
        } else {
            this.zerocount = 0;
        }
        switch (this.meter) {
        case AmmeterElm.AM_VOL: this.selectedValue = this.current; break;
        case AmmeterElm.AM_RMS: this.selectedValue = this.rmsI; break;
        }
    }

    readonly circleSize = 12;

    draw(g: Graphics): void {
        super.draw(g);
        this.setVoltageColor(g, this.nodes[0].v);
        let width = 4;
        if (!this.drawAsCircle()) {
            CircuitElm.drawThickLine(g, this.point1, this.point2);
            g.fillPolygon(this.arrowPoly);
        } else {
            this.calcLeads(this.circleSize * 2);
            this.setVoltageColor(g, this.nodes[0].v);
            CircuitElm.drawThickLine(g, this.point1, this.lead1!);
            CircuitElm.drawThickLine(g, this.lead2!, this.point2);

            g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
            CircuitElm.drawThickCircle(g, this.center.x, this.center.y, this.circleSize);
            this.drawCenteredText(g, "A", this.center.x, this.center.y, true);

            g.setColor(CircuitElm.whiteColor);
            g.setFont(CircuitElm.unitsFont);
            const len = this.circleSize * 2;
            const plusPoint = this.interpPoint(this.point1, this.point2, (this.dn / 2 - len / 2 - 4) / this.dn, -10 * this.dsign);
            if (this.y2 > this.y) plusPoint.y += 4;
            if (this.y  > this.y2) plusPoint.y += 3;
            const w = Math.floor(g.context.measureText("+").width);
            g.drawString("+", plusPoint.x - w / 2, plusPoint.y);
            width = this.circleSize;
        }

        this.doDots(g);
        this.setBbox(this.point1, this.point2, width);
        let s = "A";
        switch (this.meter) {
        case AmmeterElm.AM_VOL: s = CircuitElm.getUnitTextWithScale(this.getCurrent(), "A", this.scale); break;
        case AmmeterElm.AM_RMS: s = CircuitElm.getUnitTextWithScale(this.rmsI, "A(rms)", this.scale); break;
        }

        if (this.label.length > 0)
            s = this.label + " " + s;
        this.drawValues(g, s, width);
        this.drawPosts(g);
    }

    getDumpType(): number { return 370; }

    setVoltageSource(n: number, v: VoltageSource): void {
        super.setVoltageSource(n, v);
        v.setNodes(this.nodes[0], this.nodes[1]);
    }

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(this.nodes[0], this.nodes[1], this.voltSource, 0);
    }

    mustShowCurrent(): boolean {
        return (this.flags & AmmeterElm.FLAG_SHOWCURRENT) !== 0;
    }

    getVoltageSourceCount(): number { return 1; }

    getInfo(arr: string[]): void {
        arr[0] = "Ammeter";
        switch (this.meter) {
        case AmmeterElm.AM_VOL: arr[1] = "I = "    + CircuitElm.getUnitText(this.current, "A"); break;
        case AmmeterElm.AM_RMS: arr[1] = "Irms = " + CircuitElm.getUnitText(this.rmsI, "A"); break;
        }
    }

    getPower(): number { return 0; }
    getVoltageDiff(): number { return this.nodes[0].v; }

    // do not optimize out, even though isWireEquivalent() is true
    // (because we need current calculated every timestep)
    isWireEquivalent(): boolean { return true; }

    drawAsCircle(): boolean {
        return (this.flags & AmmeterElm.FLAG_CIRCLE) !== 0;
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Value", this.selectedValue, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Current");
            ei.choice.add("RMS Current");
            ei.choice.select(this.meter);
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("Scale", 0);
            ei.choice = new Choice();
            ei.choice.add("Auto");
            ei.choice.add("A");
            ei.choice.add("mA");
            ei.choice.add(Locale.muString + "A");
            ei.choice.select(this.scale);
            return ei;
        }
        if (n === 2) {
            return EditInfo.createCheckbox("Circular Symbol", this.drawAsCircle());
        }
        if (n === 3) {
            const ei = new EditInfo("Label", 0, -1, -1);
            ei.text = this.label;
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.meter = ei.choice.getSelectedIndex();
        if (n === 1) this.scale = ei.choice.getSelectedIndex();
        if (n === 2) this.flags = ei.changeFlag(this.flags, AmmeterElm.FLAG_CIRCLE);
        if (n === 3) this.label = ei.textf ? ei.textf.value : (ei.text ?? "");
    }

    getExprRefName(): string | null { return this.label.length > 0 ? this.label : null; }

}
