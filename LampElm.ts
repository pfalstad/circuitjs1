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
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { VAL_R, UNITS_OHMS } from "./ScopeConstants";
import { parseFloatStrict } from "./NumberParse";

export class LampElm extends CircuitElm {
    resistance: number = 0;
    readonly roomTemp = 300;
    temp: number;
    nom_pow: number;
    nom_v: number;
    warmTime: number;
    coolTime: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.temp     = this.roomTemp;
            this.nom_pow  = 100;
            this.nom_v    = 120;
            this.warmTime = .4;
            this.coolTime = .4;
            this.updateResistance();
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.temp     = parseFloatStrict(st!.nextToken());
            if (isNaN(this.temp))
                this.temp = this.roomTemp;
            this.nom_pow  = parseFloatStrict(st!.nextToken());
            this.nom_v    = parseFloatStrict(st!.nextToken());
            this.warmTime = parseFloatStrict(st!.nextToken());
            this.coolTime = parseFloatStrict(st!.nextToken());
            this.updateResistance();
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "te", this.temp);
        CircuitXMLSerializer.dumpAttr(elem, "np", this.nom_pow);
        CircuitXMLSerializer.dumpAttr(elem, "nv", this.nom_v);
        CircuitXMLSerializer.dumpAttr(elem, "wa", this.warmTime);
        CircuitXMLSerializer.dumpAttr(elem, "co", this.coolTime);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.temp     = xml.parseDoubleAttr("te", this.temp);
        this.nom_pow  = xml.parseDoubleAttr("np", this.nom_pow);
        this.nom_v    = xml.parseDoubleAttr("nv", this.nom_v);
        this.warmTime = xml.parseDoubleAttr("wa", this.warmTime);
        this.coolTime = xml.parseDoubleAttr("co", this.coolTime);
    }

    getDumpType(): number { return 181; }

    bulbLead!: Point[];
    filament!: Point[];
    bulb!: Point;
    bulbR: number = 0;

    reset(): void {
        super.reset();
        this.temp = this.roomTemp;
        this.startIteration(); // set resistance
    }

    readonly filament_len = 24;

    setPoints(): void {
        super.setPoints();
        const llen = 16;
        this.calcLeads(llen);
        this.bulbLead = this.newPointArray(2);
        this.filament = this.newPointArray(2);
        this.bulbR = 20;
        this.filament[0] = this.interpPoint(this.lead1!, this.lead2!, 0, this.filament_len);
        this.filament[1] = this.interpPoint(this.lead1!, this.lead2!, 1, this.filament_len);
        const br = this.filament_len - Math.sqrt(this.bulbR * this.bulbR - llen * llen);
        this.bulbLead[0] = this.interpPoint(this.lead1!, this.lead2!, 0, br);
        this.bulbLead[1] = this.interpPoint(this.lead1!, this.lead2!, 1, br);
        this.bulb = this.interpPoint(this.filament[0], this.filament[1], .5);
    }

    getTempColor(): string {
        const t = this.temp;
        if (t < 1200) {
            let x = Math.floor(255 * (t - 800) / 400);
            if (x < 0) x = 0;
            return `rgb(${x},0,0)`;
        }
        if (t < 1700) {
            let x = Math.floor(255 * (t - 1200) / 500);
            if (x < 0) x = 0;
            return `rgb(255,${x},0)`;
        }
        if (t < 2400) {
            let x = Math.floor(255 * (t - 1700) / 700);
            if (x < 0) x = 0;
            return `rgb(255,255,${x})`;
        }
        return "#ffffff";
    }

    draw(g: Graphics): void {
        const v1 = this.nodes[0].v;
        const v2 = this.nodes[1].v;
        this.setBbox(this.point1, this.point2, 4);
        this.adjustBbox(this.bulb.x - this.bulbR, this.bulb.y - this.bulbR,
                        this.bulb.x + this.bulbR, this.bulb.y + this.bulbR);
        this.draw2Leads(g);
        this.setPowerColor(g, true);
        g.setColor(this.getTempColor());
        g.fillOval(this.bulb.x - this.bulbR, this.bulb.y - this.bulbR, this.bulbR * 2, this.bulbR * 2);
        g.setColor(CircuitElm.whiteColor);
        CircuitElm.drawThickCircle(g, this.bulb.x, this.bulb.y, this.bulbR);
        this.setVoltageColor(g, v1);
        CircuitElm.drawThickLine(g, this.lead1!, this.filament[0]);
        this.setVoltageColor(g, v2);
        CircuitElm.drawThickLine(g, this.lead2!, this.filament[1]);
        this.setVoltageColor(g, (v1 + v2) * .5);
        CircuitElm.drawThickLine(g, this.filament[0], this.filament[1]);
        this.updateDotCount();
        if (!this.isCreating()) {
            this.drawDots(g, this.point1, this.lead1!, this.curcount);
            let cc = this.addCurCount(this.curcount, (this.dn - 16) / 2);
            this.drawDots(g, this.lead1!, this.filament[0], cc);
            cc = this.addCurCount(cc, this.filament_len);
            this.drawDots(g, this.filament[0], this.filament[1], cc);
            cc = this.addCurCount(cc, 16);
            this.drawDots(g, this.filament[1], this.lead2!, cc);
            cc = this.addCurCount(cc, this.filament_len);
            this.drawDots(g, this.lead2!, this.point2, this.curcount);
        }
        this.drawPosts(g);
    }

    calculateCurrent(): void {
        this.current = (this.nodes[0].v - this.nodes[1].v) / this.resistance;
        if (this.resistance === 0)
            this.current = 0;
    }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[0]);
        CircuitElm.sim.stampNonLinear(this.nodes[1]);
    }

    nonLinear(): boolean { return true; }

    updateResistance(): void {
        // based on http://www.intusoft.com/nlpdf/nl11.pdf
        const nom_r = this.nom_v * this.nom_v / this.nom_pow;
        // this formula doesn't work for values over 5390
        const tp = (this.temp > 5390) ? 5390 : this.temp;
        this.resistance = nom_r * (1.26104 -
            4.90662 * Math.sqrt(17.1839 / tp - 0.00318794) -
            7.8569 / (tp - 187.56));
    }

    startIteration(): void {
        this.updateResistance();
        const cap  = 1.57e-4 * this.nom_pow;
        const capw = cap * this.warmTime / .4;
        const capc = cap * this.coolTime / .4;
        this.temp += this.getPower() * CircuitElm.sim.timeStep / capw;
        const cr = 2600 / this.nom_pow;
        this.temp -= CircuitElm.sim.timeStep * (this.temp - this.roomTemp) / (capc * cr);
    }

    doStep(): void {
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
    }

    getInfo(arr: string[]): void {
        arr[0] = "lamp";
        this.getBasicInfo(arr);
        arr[3] = "R = " + CircuitElm.getUnitText(this.resistance, Locale.ohmString);
        arr[4] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
        arr[5] = "T = " + Math.trunc(this.temp) + " K";
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("Nominal Power",        this.nom_pow,  0, 0).setPositive();
        if (n === 1) return new EditInfo("Nominal Voltage",      this.nom_v,    0, 0).setPositive().setUnitStep();
        if (n === 2) return new EditInfo("Warmup Time (s)",      this.warmTime, 0, 0).setPositive();
        if (n === 3) return new EditInfo("Cooldown Time (s)",    this.coolTime, 0, 0).setPositive();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0) this.nom_pow  = ei.value;
        if (n === 1 && ei.value > 0) this.nom_v    = ei.value;
        if (n === 2 && ei.value > 0) this.warmTime = ei.value;
        if (n === 3 && ei.value > 0) this.coolTime = ei.value;
    }

    getScopeValue(x: number): number {
        return (x === VAL_R) ? this.resistance : super.getScopeValue(x);
    }

    getScopeUnits(x: number): number {
        return (x === VAL_R) ? UNITS_OHMS : super.getScopeUnits(x);
    }

    canShowValueInScope(x: number): boolean {
        return x === VAL_R;
    }

}
