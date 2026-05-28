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

// contributed by Edward Calver

import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Color } from "./Color";
import { EditInfo } from "./EditInfo";
import { Font } from "./Font";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";

export class AMElm extends CircuitElm {
    static readonly FLAG_COS = 2;
    carrierfreq: number;
    signalfreq: number;
    maxVoltage: number;
    freqTimeZero: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.carrierfreq = parseFloat(st.nextToken());
            this.signalfreq = parseFloat(st.nextToken());
            this.maxVoltage = parseFloat(st.nextToken());
            if ((this.flags & AMElm.FLAG_COS) !== 0)
                this.flags &= ~AMElm.FLAG_COS;
        } else {
            this.maxVoltage = 5;
            this.carrierfreq = 1000;
            this.signalfreq = 40;
        }
        this.reset();
    }

    getDumpType(): number { return 200; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "cf", this.carrierfreq);
        CircuitXMLSerializer.dumpAttr(elem, "sf", this.signalfreq);
        CircuitXMLSerializer.dumpAttr(elem, "mv", this.maxVoltage);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.carrierfreq = xml.parseDoubleAttr("cf", this.carrierfreq);
        this.signalfreq = xml.parseDoubleAttr("sf", this.signalfreq);
        this.maxVoltage = xml.parseDoubleAttr("mv", this.maxVoltage);
        this.reset();
    }

    reset(): void {
        this.freqTimeZero = 0;
        this.curcount = 0;
    }

    getPostCount(): number { return 1; }

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[0], this.voltSource!);
    }

    doStep(): void {
        CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[0], this.voltSource!, this.getVoltage());
    }

    getVoltage(): number {
        const w = 2 * CircuitElm.pi * (CircuitElm.sim.t - this.freqTimeZero);
        return ((Math.sin(w * this.signalfreq) + 1) / 2) * Math.sin(w * this.carrierfreq) * this.maxVoltage;
    }

    readonly circleSize = 17;

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.circleSize);
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        g.setFont(new Font("SansSerif", 0, 12));
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.whiteColor);
        this.setPowerColor(g, false);
        this.drawCenteredText(g, "AM", this.x2, this.y2, true);
        this.drawWaveform(g, this.point2);
        this.drawPosts(g);
        this.curcount = this.updateDotCountImpl(-this.current, this.curcount);
        if (!this.isCreating())
            this.drawDots(g, this.point1, this.lead1!, this.curcount);
    }

    drawWaveform(g: Graphics, center: Point): void {
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : Color.gray);
        this.setPowerColor(g, false);
        CircuitElm.drawThickCircle(g, center.x, center.y, this.circleSize);
        this.adjustBbox(center.x - this.circleSize, center.y - this.circleSize,
            center.x + this.circleSize, center.y + this.circleSize);
    }

    setPoints(): void {
        super.setPoints();
        this.lead1 = this.interpPoint(this.point1, this.point2, 1 - this.circleSize / this.dn);
    }

    getVoltageDiff(): number { return this.nodes[0].v; }
    validate(): boolean { return this.validateRailNode(0); }
    hasGroundConnection(n1: number): boolean { return true; }
    getVoltageSourceCount(): number { return 1; }
    getPower(): number { return -this.getVoltageDiff() * this.current; }

    getInfo(arr: string[]): void {
        arr[0] = "AM Source";
        arr[1] = "I = " + CircuitElm.getCurrentText(this.getCurrent());
        arr[2] = "V = " + CircuitElm.getVoltageText(this.getVoltageDiff());
        arr[3] = "cf = " + CircuitElm.getUnitText(this.carrierfreq, "Hz");
        arr[4] = "sf = " + CircuitElm.getUnitText(this.signalfreq, "Hz");
        arr[5] = "Vmax = " + CircuitElm.getVoltageText(this.maxVoltage);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("Max Voltage", this.maxVoltage, -20, 20);
        if (n === 1) return new EditInfo("Carrier Frequency (Hz)", this.carrierfreq, 4, 500);
        if (n === 2) return new EditInfo("Signal Frequency (Hz)", this.signalfreq, 4, 500);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.maxVoltage = ei.value;
        if (n === 1) this.carrierfreq = ei.value;
        if (n === 2) this.signalfreq = ei.value;
    }
}
