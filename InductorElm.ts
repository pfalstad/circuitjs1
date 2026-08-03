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
import { Inductor } from "./Inductor";
import { Graphics } from "./Graphics";
import { StringTokenizer } from "./StringTokenizer";
import { Locale } from "./Locale";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { FindPathInfo } from "./FindPathInfo";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class InductorElm extends CircuitElm {
    ind: Inductor;
    inductance: number;
    initialCurrent: number;
    saturationCurrent: number; // 0 = disabled (linear)

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.ind = new Inductor(CircuitElm.sim);
            this.inductance = 1;
            this.initialCurrent = 0;
            this.saturationCurrent = 0;
            this.ind.setup(this.inductance, this.current, this.flags, this.saturationCurrent);
        } else {
            super(xa, ya, xb, yb!, f!);
            this.ind = new Inductor(CircuitElm.sim);
            this.inductance = parseFloat(st!.nextToken());
            this.current = parseFloat(st!.nextToken());
            this.initialCurrent = 0;
            this.saturationCurrent = 0;
            try {
                this.initialCurrent = parseFloat(st!.nextToken());
                this.saturationCurrent = parseFloat(st!.nextToken());
            } catch (e) {}
            this.ind.setup(this.inductance, this.current, this.flags, this.saturationCurrent);
        }
    }
    getDumpType(): number { return 'l'.charCodeAt(0); }
    isInductorElm(): boolean { return true; }
    dump(): string {
        return super.dump() + " " + this.inductance + " " + this.current + " " + this.initialCurrent + " " + this.saturationCurrent;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "l", this.inductance);
        CircuitXMLSerializer.dumpAttr(elem, "ic", this.initialCurrent);
        if (this.saturationCurrent !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "isat", this.saturationCurrent);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        CircuitXMLSerializer.dumpAttr(elem, "i", this.current);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.inductance = xml.parseDoubleAttr("l", this.inductance);
        this.initialCurrent = xml.parseDoubleAttr("ic", this.initialCurrent);
        this.current = xml.parseDoubleAttr("i", this.current);
        this.saturationCurrent = xml.parseDoubleAttr("isat", this.saturationCurrent);
        this.ind.setup(this.inductance, this.current, this.flags, this.saturationCurrent);
    }

    setPoints(): void {
        super.setPoints();
        this.calcLeads(32);
    }
    draw(g: Graphics): void {
        const v1 = this.nodes[0].v;
        const v2 = this.nodes[1].v;
        let i: number;
        const hs = 8;
        this.setBbox(this.point1, this.point2, hs);
        this.draw2Leads(g);
        this.setPowerColor(g, false);
        this.drawCoil(g, 8, this.lead1, this.lead2, v1, v2);
        if (this.showValues()) {
            const s = CircuitElm.getShortUnitText(this.inductance, "H");
            this.drawValues(g, s, hs);
        }
        this.doDots(g);
        this.drawPosts(g);
    }
    reset(): void {
        this.curcount = 0;
        this.current = this.initialCurrent;
        this.ind.resetTo(this.initialCurrent);
    }
    stamp(): void { this.ind.stamp(this.nodes[0], this.nodes[1]); }
    startIteration(): void {
        this.ind.startIteration(this.nodes[0].v-this.nodes[1].v);
    }
    nonLinear(): boolean { return this.ind.nonLinear(); }
    calculateCurrent(): void {
        const voltdiff = this.nodes[0].v-this.nodes[1].v;
        this.current = this.ind.calculateCurrent(voltdiff);
    }
    doStep(): void {
        const voltdiff = this.nodes[0].v-this.nodes[1].v;
        this.ind.doStep(voltdiff);
    }
    getInfo(arr: string[]): void {
        arr[0] = (this.saturationCurrent > 0) ? "inductor (sat)" : "inductor";
        this.getBasicInfo(arr);
        arr[3] = "L = " + CircuitElm.getUnitText(this.inductance, "H");
        arr[4] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
        if (this.saturationCurrent > 0) {
            const lEff = this.ind.calcEffectiveInductance(this.current);
            arr[5] = "Leff = " + CircuitElm.getUnitText(lEff, "H");
            arr[6] = "Isat = " + CircuitElm.getUnitText(this.saturationCurrent, "A");
        }
    }

    getScopeText(v: number): string {
        return Locale.LS("inductor") + ", " + CircuitElm.getUnitText(this.inductance, "H");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Inductance (H)", this.inductance, 1e-2, 10).setPositive();
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Trapezoidal Approximation",
                                       this.ind.isTrapezoidal());
            return ei;
        }
        if (n === 2)
            return new EditInfo("Initial Current (on Reset) (A)", this.initialCurrent);
        if (n === 3)
            return new EditInfo("Saturation Current (A) (0=none)", this.saturationCurrent);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.inductance = ei.value;
        if (n === 1) {
            if (ei.checkbox!.getState())
                this.flags &= ~Inductor.FLAG_BACK_EULER;
            else
                this.flags |= Inductor.FLAG_BACK_EULER;
        }
        if (n === 2)
            this.initialCurrent = ei.value;
        if (n === 3) {
            if (ei.value >= 0)
                this.saturationCurrent = ei.value;
            else
                ei.setError("must be >= 0");
        }
        this.ind.setup(this.inductance, this.current, this.flags, this.saturationCurrent);
    }

    getShortcut(): number { return 'L'.charCodeAt(0); }
    getInductance(): number { return this.inductance; }
    setInductance(l: number): void {
        this.inductance = l;
        this.ind.setup(this.inductance, this.current, this.flags, this.saturationCurrent);
    }
    setSaturationCurrent(isat: number): void {
        this.saturationCurrent = isat;
        this.ind.setup(this.inductance, this.current, this.flags, this.saturationCurrent);
    }
    getSaturationCurrent(): number { return this.saturationCurrent; }
    validate(): boolean {
        const fpi = new FindPathInfo(FindPathInfo.INDUCT, this, this.getNode(1), CircuitElm.sim);
        if (!fpi.findPath(this.getNode(0)))
            this.reset();
        return true;
    }
}
