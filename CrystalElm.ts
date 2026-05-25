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

import { CompositeElm } from "./CompositeElm";
import { CircuitElm } from "./CircuitElm";
import { CapacitorElm } from "./CapacitorElm";
import { InductorElm } from "./InductorElm";
import { ResistorElm } from "./ResistorElm";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { XMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Color } from "./Color";
import { Locale } from "./Locale";

export class CrystalElm extends CompositeElm {
    static readonly FLAG_SHOW_FREQ = 2;

    seriesCapacitance: number = 0;
    parallelCapacitance: number = 0;
    inductance: number = 0;
    resistance: number = 0;
    plate1: Point[] = [];
    plate2: Point[] = [];
    sandwichPoints: Point[] = [];

    private static modelString = "CapacitorElm 1 2\rCapacitorElm 1 3\rInductorElm 3 4\rResistorElm 4 2";
    private static modelExternalNodes = [1, 2];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.loadComposite(null, CrystalElm.modelString, CrystalElm.modelExternalNodes);
            this.buildCompNodeList();
            this.allocNodes();
            this.flags = CrystalElm.FLAG_SHOW_FREQ;
            this.parallelCapacitance = 28.7e-12;
            this.seriesCapacitance   = 0.1e-12;
            this.inductance = 2.5e-3;
            this.resistance = 6.4;
            this.initCrystal();
        } else {
            super(xa, ya, xb, yb!, f!);
            this.loadComposite(st!, CrystalElm.modelString, CrystalElm.modelExternalNodes);
            this.buildCompNodeList();
            this.allocNodes();
            const c1 = this.compElmList[0] as CapacitorElm;
            this.parallelCapacitance = c1.getCapacitance();
            const c2 = this.compElmList[1] as CapacitorElm;
            this.seriesCapacitance = c2.getCapacitance();
            const i1 = this.compElmList[2] as InductorElm;
            this.inductance = i1.getInductance();
            const r1 = this.compElmList[3] as ResistorElm;
            this.resistance = r1.getResistance();
            this.initCrystal();
        }
    }

    private initCrystal(): void {
        (this.compElmList[0] as CapacitorElm).setCapacitance(this.parallelCapacitance);
        (this.compElmList[1] as CapacitorElm).setCapacitance(this.seriesCapacitance);
        (this.compElmList[2] as InductorElm).setInductance(this.inductance);
        (this.compElmList[3] as ResistorElm).setResistance(this.resistance);
    }

    getDumpType(): number { return 412; }
    getXmlDumpType(): string { return "cr"; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        XMLSerializer.dumpAttr(elem, "pc", this.parallelCapacitance);
        XMLSerializer.dumpAttr(elem, "sc", this.seriesCapacitance);
        XMLSerializer.dumpAttr(elem, "in", this.inductance);
        XMLSerializer.dumpAttr(elem, "r",  this.resistance);
    }

    undumpXml(xml: XMLDeserializer): void {
        super.undumpXml(xml);
        this.resistance          = xml.parseDoubleAttr("r",  this.resistance);
        this.inductance          = xml.parseDoubleAttr("in", this.inductance);
        this.parallelCapacitance = xml.parseDoubleAttr("pc", this.parallelCapacitance);
        this.seriesCapacitance   = xml.parseDoubleAttr("sc", this.seriesCapacitance);
        this.initCrystal();
    }

    setPoints(): void {
        super.setPoints();
        const f = (this.dn / 2 - 10) / this.dn;
        // calc leads
        this.lead1 = this.interpPoint(this.point1, this.point2, f);
        this.lead2 = this.interpPoint(this.point1, this.point2, 1 - f);
        // calc plates
        this.plate1 = this.newPointArray(2);
        this.plate2 = this.newPointArray(2);
        this.interpPoint2(this.point1, this.point2, this.plate1[0], this.plate1[1],     f, 8);
        this.interpPoint2(this.point1, this.point2, this.plate2[0], this.plate2[1], 1 - f, 8);

        this.sandwichPoints = this.newPointArray(4);
        const f2 = (this.dn / 2 - 5) / this.dn;
        this.interpPoint2(this.point1, this.point2, this.sandwichPoints[0], this.sandwichPoints[1],     f2, 10);
        this.interpPoint2(this.point1, this.point2, this.sandwichPoints[3], this.sandwichPoints[2], 1 - f2, 10);

        // need to do this explicitly for CompositeElms
        this.setPost(0, this.point1);
        this.setPost(1, this.point2);
    }

    draw(g: Graphics): void {
        const hs = 12;
        this.setBbox(this.point1, this.point2, hs);

        // draw first lead and plate
        this.setVoltageColor(g, this.volts[0]);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        this.setPowerColor(g, false);
        CircuitElm.drawThickLine(g, this.plate1[0], this.plate1[1]);
        if (this.showPower())
            g.setColor(Color.gray);

        // draw second lead and plate
        this.setVoltageColor(g, this.volts[1]);
        CircuitElm.drawThickLine(g, this.point2, this.lead2!);
        this.setPowerColor(g, false);
        CircuitElm.drawThickLine(g, this.plate2[0], this.plate2[1]);

        this.setVoltageColor(g, 0.5 * (this.volts[0] + this.volts[1]));
        for (let i = 0; i !== 4; i++)
            CircuitElm.drawThickLine(g, this.sandwichPoints[i], this.sandwichPoints[(i + 1) % 4]);

        this.updateDotCount();
        if (!this.isCreating()) {
            this.drawDots(g, this.point1, this.lead1!, this.curcount);
            this.drawDots(g, this.point2, this.lead2!, -this.curcount);
        }
        this.drawPosts(g);
        if (this.hasFlag(CrystalElm.FLAG_SHOW_FREQ)) {
            const fs = 1 / (Math.sqrt(this.inductance * this.seriesCapacitance) * Math.PI * 2);
            const s = CircuitElm.getShortUnitText(fs, "Hz");
            this.drawValues(g, s, hs);
        }
    }

    stepFinished(): void {
        super.stepFinished();
        this.current = this.getCurrentIntoNode(1);
    }

    getInfo(arr: string[]): void {
        arr[0] = "crystal";
        this.getBasicInfo(arr);
        const fs = 1 / (Math.sqrt(this.inductance * this.seriesCapacitance) * Math.PI * 2);
        const cSer = (this.parallelCapacitance * this.seriesCapacitance) /
                     (this.parallelCapacitance + this.seriesCapacitance);
        const fp = 1 / (Math.sqrt(this.inductance * cSer) * Math.PI * 2);
        const q  = 2 * Math.PI * fs * this.inductance / this.resistance;
        arr[3] = "fs = " + CircuitElm.getUnitText(fs, "Hz");
        arr[4] = "fp = " + CircuitElm.getUnitText(fp, "Hz");
        arr[5] = "Q = "  + CircuitElm.getUnitText(q, "");
        arr[6] = "P = "  + CircuitElm.getUnitText(this.getPower(), "W");
    }

    canViewInScope(): boolean { return true; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo(EditInfo.makeLink("crystal.html", "Parallel Capacitance"), this.parallelCapacitance).setPositive();
        if (n === 1)
            return new EditInfo("Series Capacitance (F)", this.seriesCapacitance).setPositive();
        if (n === 2)
            return new EditInfo("Inductance (H)", this.inductance, 0, 0).setPositive();
        if (n === 3)
            return new EditInfo("Resistance (" + Locale.ohmString + ")", this.resistance, 0, 0).setPositive();
        if (n === 4) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Show Frequency", this.hasFlag(CrystalElm.FLAG_SHOW_FREQ));
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0) this.parallelCapacitance = ei.value;
        if (n === 1 && ei.value > 0) this.seriesCapacitance   = ei.value;
        if (n === 2 && ei.value > 0) this.inductance = ei.value;
        if (n === 3 && ei.value > 0) this.resistance = ei.value;
        if (n === 4)
            this.flags = ei.changeFlag(this.flags, CrystalElm.FLAG_SHOW_FREQ);
        this.initCrystal();
    }
}
