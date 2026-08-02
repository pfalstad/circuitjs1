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
import { VoltageSource } from "./VoltageSource";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Rectangle } from "./Rectangle";
import { StringTokenizer } from "./StringTokenizer";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";

export class BusLogicInputElm extends SwitchElm {
    busWidth: number = 4;
    value: number = 0;
    hiV: number = 5;
    loV: number = 0;
    voltageSources: VoltageSource[] | null = null;
    currents: number[] | null = null;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "bw", this.busWidth);
        if (this.value !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "va", this.value);
        if (this.hiV !== 5)
            CircuitXMLSerializer.dumpAttr(elem, "hi", this.hiV);
        if (this.loV !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "lo", this.loV);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.busWidth = xml.parseIntAttr("bw", this.busWidth);
        this.value = xml.parseIntAttr("va", 0);
        this.hiV = xml.parseDoubleAttr("hi", this.hiV);
        this.loV = xml.parseDoubleAttr("lo", this.loV);
    }

    getDumpType(): number { return 0; }
    getPostCount(): number { return this.busWidth; }
    getNumHandles(): number { return 1; }
    getPostWidth(n: number): number { return this.busWidth; }
    getVoltageSourceCount(): number { return this.busWidth; }

    getPost(n: number): Point {
        return new Point(this.x, this.y, n);
    }

    setVoltageSource(n: number, v: VoltageSource): void {
        if (this.voltageSources === null || this.voltageSources.length !== this.busWidth) {
            this.voltageSources = new Array(this.busWidth);
            this.currents = new Array(this.busWidth).fill(0);
        }
        this.voltageSources[n] = v;
    }

    setCurrent(vs: VoltageSource, c: number): void {
        for (let i = 0; i < this.busWidth; i++)
            if (this.voltageSources![i] === vs) {
                this.currents![i] = this.current = c;
                break;
            }
    }

    getCurrentIntoNode(n: number): number {
        return this.currents ? this.currents[n] : 0;
    }

    setPoints(): void {
        super.setPoints();
        this.lead1 = new Point();
    }

    draw(g: Graphics): void {
        g.save();
        const fontSize = 20;
        g.context.font = "bold " + fontSize + "px SansSerif";
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.whiteColor);
        const s = "" + this.value;
        this.interpPoint(this.point1, this.point2, this.lead1,
            1 - (Math.floor(g.context.measureText(s).width) / 2 + 8) / this.dn);
        this.setBbox(this.point1, this.lead1, 0);
        this.drawCenteredText(g, s, this.x2, this.y2, true);
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!, 5);
        if (this.currents !== null) {
            this.current = 0;
            for (let i = 0; i < this.currents.length; i++)
                this.current += this.currents[i];
        }
        this.updateDotCount();
        this.drawDots(g, this.point1, this.lead1!, -this.curcount);
        this.drawPosts(g);
        g.restore();
    }

    getSwitchRect(): Rectangle {
        return new Rectangle(this.x2 - 10, this.y2 - 10, 20, 20);
    }

    toggle(): void {
        this.value++;
        if (this.value >= (1 << this.busWidth))
            this.value = 0;
    }

    stamp(): void {
        for (let i = 0; i < this.busWidth; i++) {
            const v = ((this.value & (1 << i)) !== 0) ? this.hiV : this.loV;
            CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[i], this.voltageSources![i], v);
        }
    }

    calculateCurrent(): void {}
    hasGroundConnection(n: number): boolean { return true; }
    isWireEquivalent(): boolean { return false; }
    isRemovableWire(): boolean { return false; }

    getXmlDumpType(): string { return "bli"; }

    getInfo(arr: string[]): void {
        arr[0] = "bus input (" + this.busWidth + ")";
        arr[1] = "value = " + this.value;
        arr[2] = "hex = 0x" + this.value.toString(16).toUpperCase();
    }
    getShortcut(): number { return 0; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Bus Width", this.busWidth, 2, 32).setDimensionless();
        if (n === 1)
            return new EditInfo("Value", this.value).setDimensionless();
        if (n === 2)
            return new EditInfo("High Voltage", this.hiV).setUnitStep();
        if (n === 3)
            return new EditInfo("Low Voltage", this.loV).setUnitStep();
        return null;
    }
    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 2) {
                this.busWidth = Math.floor(ei.value);
                this.allocNodes();
            } else
                ei.setError("must be >= 2");
        }
        if (n === 1)
            this.value = Math.floor(ei.value);
        if (n === 2)
            this.hiV = ei.value;
        if (n === 3)
            this.loV = ei.value;
    }
}
