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

    TestPointElm by Bill Collis
*/

import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Choice } from "./Choice";
import { CustomLogicModel } from "./CustomLogicModel";
import { EditInfo } from "./EditInfo";
import { Font } from "./Font";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";

export class TestPointElm extends CircuitElm {
    meter: number;

    static readonly TP_VOL = 0;
    static readonly TP_RMS = 1;
    static readonly TP_MAX = 2;
    static readonly TP_MIN = 3;
    static readonly TP_P2P = 4;
    static readonly TP_BIN = 5;
    static readonly TP_FRQ = 6;
    static readonly TP_PER = 7;
    static readonly TP_PWI = 8;
    static readonly TP_DUT = 9;
    static readonly FLAG_LABEL = 1;

    zerocount: number = 0;
    rmsV: number = 0;
    total: number = 0;
    count: number = 0;
    maxV: number = 0;
    lastMaxV: number = 0;
    minV: number = 0;
    lastMinV: number = 0;
    frequency: number = 0;
    period: number = 0;
    binaryLevel: number = 0;
    pulseWidth: number = 0;
    dutyCycle: number = 0;
    selectedValue: number = 0;
    lastStepCount: number = 0;

    increasingV: boolean = true;
    decreasingV: boolean = true;
    periodStart: number = 0;
    periodLength: number = 0;
    pulseStart: number = 0;
    label: string;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.meter = TestPointElm.TP_VOL;
            this.label = "TP";
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.meter = parseInt(st!.nextToken());
            if ((this.flags & TestPointElm.FLAG_LABEL) !== 0)
                this.label = CustomLogicModel.unescape(st!.nextToken());
            else
                this.label = "TP";
        }
    }

    getDumpType(): number { return 368; }
    getPostCount(): number { return 1; }

    setPoints(): void {
        super.setPoints();
        this.lead1 = new Point();
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "me", this.meter);
        if (this.label !== "TP")
            CircuitXMLSerializer.dumpAttr(elem, "lb", this.label);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.meter = xml.parseIntAttr("me", this.meter);
        this.label = xml.parseStringAttr("lb", "TP") ?? "TP";
    }

    getMeter(): string {
        switch (this.meter) {
        case TestPointElm.TP_VOL: return "V";
        case TestPointElm.TP_RMS: return "V(rms)";
        case TestPointElm.TP_MAX: return "Vmax";
        case TestPointElm.TP_MIN: return "Vmin";
        case TestPointElm.TP_P2P: return "Peak to peak";
        case TestPointElm.TP_BIN: return "Binary";
        case TestPointElm.TP_FRQ: return "Frequency";
        case TestPointElm.TP_PER: return "Period";
        case TestPointElm.TP_PWI: return "Pulse width";
        case TestPointElm.TP_DUT: return "Duty cycle";
        }
        return "";
    }

    drawText(g: Graphics, str: string, str2: string, pt1: Point, pt2: Point): void {
        const w1 = Math.floor(g.context.measureText(str).width);
        const w2 = Math.floor(g.context.measureText(str2).width);
        const spacing = 14;
        const wmax = Math.max(w1, w2);
        const h = Math.floor(g.currentFontSize);
        g.save();
        g.context.textBaseline = "middle";
        let x = pt2.x, y = pt2.y;
        if (pt1.y !== pt2.y) {
            x -= wmax / 2;
            y += CircuitElm.sign(pt2.y - pt1.y) * h;
            if (pt2.y < pt1.y)
                y -= spacing - 4;
        } else {
            if (pt2.x > pt1.x)
                x += 4;
            else
                x -= 4 + wmax;
        }
        g.drawString(str,  x + (wmax - w1) / 2, y);
        g.drawString(str2, x + (wmax - w2) / 2, y + spacing);
        this.adjustBbox(x, y - h / 2, x + wmax, y + spacing + h / 2);
        g.restore();
    }

    draw(g: Graphics): void {
        g.save();
        const selected = this.needsHighlight();
        const f = new Font("SansSerif", selected ? Font.BOLD : 0, 14);
        g.setFont(f);
        g.setColor(selected ? CircuitElm.selectColor : CircuitElm.whiteColor);

        let s = this.label;
        this.interpPoint(this.point1, this.point2, this.lead1!,
            1 - (Math.floor(g.context.measureText("TP").width) / 2 + 8) / this.dn);
        this.setBbox(this.point1, this.lead1!, 0);

        switch (this.meter) {
            case TestPointElm.TP_VOL: s = CircuitElm.getUnitText(this.volts[0], "V"); break;
            case TestPointElm.TP_RMS: s = CircuitElm.getUnitText(this.rmsV, "V(rms)"); break;
            case TestPointElm.TP_MAX: s = CircuitElm.getUnitText(this.lastMaxV, "Vpk"); break;
            case TestPointElm.TP_MIN: s = CircuitElm.getUnitText(this.lastMinV, "Vmin"); break;
            case TestPointElm.TP_P2P: s = CircuitElm.getUnitText(this.lastMaxV - this.lastMinV, "Vp2p"); break;
            case TestPointElm.TP_BIN: s = this.binaryLevel + ""; break;
            case TestPointElm.TP_FRQ: s = CircuitElm.getUnitText(this.frequency, "Hz"); break;
            case TestPointElm.TP_PER: break;
            case TestPointElm.TP_PWI: s = CircuitElm.getUnitText(this.pulseWidth, "S"); break;
            case TestPointElm.TP_DUT: s = CircuitElm.showFormat.format(this.dutyCycle); break;
        }
        this.drawText(g, this.label, s, this.point1, this.lead1!);

        this.setVoltageColor(g, this.volts[0]);
        if (selected)
            g.setColor(CircuitElm.selectColor);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        this.drawPosts(g);
        g.restore();
    }

    stepFinished(): void {
        if (CircuitElm.sim.timeStepCount === this.lastStepCount)
            return;
        this.lastStepCount = CircuitElm.sim.timeStepCount;
        this.count++;
        this.total += this.volts[0] * this.volts[0];

        if (this.volts[0] < 2.5)
            this.binaryLevel = 0;
        else
            this.binaryLevel = 1;

        if (this.volts[0] > this.maxV && this.increasingV) {
            this.maxV = this.volts[0];
            this.increasingV = true;
            this.decreasingV = false;
        }
        if (this.volts[0] < this.maxV && this.increasingV) {
            this.lastMaxV = this.maxV;
            this.periodLength = Date.now() - this.periodStart;
            this.periodStart  = Date.now();
            this.period = this.periodLength;
            this.pulseWidth = Date.now() - this.pulseStart;
            this.dutyCycle = this.pulseWidth / this.periodLength;
            this.minV = this.volts[0];
            this.increasingV = false;
            this.decreasingV = true;

            this.total = this.total / this.count;
            this.rmsV  = Math.sqrt(this.total);
            if (isNaN(this.rmsV)) this.rmsV = 0;
            this.count = 0;
            this.total = 0;
        }
        if (this.volts[0] < this.minV && this.decreasingV) {
            this.minV = this.volts[0];
            this.increasingV = false;
            this.decreasingV = true;
        }
        if (this.volts[0] > this.minV && this.decreasingV) {
            this.lastMinV = this.minV;
            this.pulseStart   = Date.now();
            this.maxV = this.volts[0];
            this.increasingV = true;
            this.decreasingV = false;

            this.total = this.total / this.count;
            this.rmsV  = Math.sqrt(this.total);
            if (isNaN(this.rmsV)) this.rmsV = 0;
            this.count = 0;
            this.total = 0;
        }
        if (this.volts[0] === 0) {
            this.zerocount++;
            if (this.zerocount > 5) {
                this.total = 0;
                this.rmsV  = 0;
                this.maxV  = 0;
                this.minV  = 0;
            }
        } else {
            this.zerocount = 0;
        }
        switch (this.meter) {
        case TestPointElm.TP_VOL: this.selectedValue = this.volts[0]; break;
        case TestPointElm.TP_RMS: this.selectedValue = this.rmsV; break;
        case TestPointElm.TP_MAX: this.selectedValue = this.lastMaxV; break;
        case TestPointElm.TP_MIN: this.selectedValue = this.lastMinV; break;
        case TestPointElm.TP_P2P: this.selectedValue = this.lastMaxV - this.lastMinV; break;
        case TestPointElm.TP_BIN: this.selectedValue = this.binaryLevel; break;
        case TestPointElm.TP_FRQ: this.selectedValue = this.frequency; break;
        case TestPointElm.TP_PER: this.selectedValue = this.period; break;
        case TestPointElm.TP_PWI: this.selectedValue = this.pulseWidth; break;
        case TestPointElm.TP_DUT: this.selectedValue = this.dutyCycle; break;
        }
    }

    getScopeValue(x: number): number { return this.selectedValue; }

    getVoltageDiff(): number { return this.volts[0]; }

    getInfo(arr: string[]): void {
        arr[0] = "Test Point";
        switch (this.meter) {
        case TestPointElm.TP_VOL: arr[1] = "V = "          + CircuitElm.getUnitText(this.volts[0], "V"); break;
        case TestPointElm.TP_RMS: arr[1] = "V(rms) = "     + CircuitElm.getUnitText(this.rmsV, "V"); break;
        case TestPointElm.TP_MAX: arr[1] = "Vmax = "        + CircuitElm.getUnitText(this.lastMaxV, "Vpk"); break;
        case TestPointElm.TP_MIN: arr[1] = "Vmin = "        + CircuitElm.getUnitText(this.lastMinV, "Vmin"); break;
        case TestPointElm.TP_P2P: arr[1] = "Vp2p = "        + CircuitElm.getUnitText(this.lastMaxV - this.lastMinV, "Vp2p"); break;
        case TestPointElm.TP_BIN: arr[1] = "Binary:"        + this.binaryLevel + ""; break;
        case TestPointElm.TP_FRQ: arr[1] = "Freq = "        + CircuitElm.getUnitText(this.frequency, "Hz"); break;
        case TestPointElm.TP_PER: arr[1] = "Period = "      + CircuitElm.getUnitText(this.period * CircuitElm.sim.maxTimeStep / CircuitElm.app.getIterCount(), "S"); break;
        case TestPointElm.TP_PWI: arr[1] = "Pulse width = " + CircuitElm.getUnitText(this.pulseWidth * CircuitElm.sim.maxTimeStep * CircuitElm.app.getIterCount(), "S"); break;
        case TestPointElm.TP_DUT: arr[1] = "Duty cycle = "  + CircuitElm.showFormat.format(this.dutyCycle); break;
        }
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Value", this.selectedValue, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Voltage");
            ei.choice.add("RMS Voltage");
            ei.choice.add("Max Voltage");
            ei.choice.add("Min Voltage");
            ei.choice.add("P2P Voltage");
            ei.choice.add("Binary Value");
            ei.choice.select(this.meter);
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("Label", 0, -1, -1);
            ei.text = this.label;
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.meter = ei.choice.getSelectedIndex();
        if (n === 1)
            this.label = ei.textf ? ei.textf.value : (ei.text ?? "TP");
    }

    getXmlDumpType(): string { return "tp"; }
}
