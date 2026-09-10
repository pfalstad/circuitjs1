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

// much of this was adapted from Bill Collis's code in TestPointElm.java

import { CircuitElm } from "./CircuitElm";
import { Graphics } from "./Graphics";
import { Font } from "./Font";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { Choice } from "./Choice";
import { Locale } from "./Locale";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { parseIntStrict, parseFloatStrict } from "./NumberParse";

export class ProbeElm extends CircuitElm {
    static readonly FLAG_SHOWVOLTAGE = 1;
    static readonly FLAG_CIRCLE      = 2;

    static readonly TP_VOL = 0;
    static readonly TP_RMS = 1;
    static readonly TP_MAX = 2;
    static readonly TP_MIN = 3;
    static readonly TP_P2P = 4;
    static readonly TP_BIN = 5;
    static readonly TP_FRQ = 6;
    static readonly TP_PER = 7;
    static readonly TP_PWI = 8;
    static readonly TP_DUT = 9; // mark to space ratio
    static readonly TP_AVG = 10;

    static readonly circleSize = 12;

    meter: number;
    units: number = 0;
    scale: number;
    resistance: number;

    rmsV: number = 0;
    total: number = 0;
    count: number = 0;
    avgV: number = 0;
    totalV: number = 0;
    binaryLevel: number = 0; // 0 or 1 as double
    zerocount: number = 0;
    maxV: number = 0;
    lastMaxV: number = 0;
    minV: number = 0;
    lastMinV: number = 0;
    frequency: number = 0;
    period: number = 0;
    pulseWidth: number = 0;
    dutyCycle: number = 0;
    selectedValue: number = 0;
    increasingV: boolean = true;
    decreasingV: boolean = true;
    started: boolean = false;
    lastStepCount: number = 0;
    periodStart: number = 0;
    periodLength: number = 0;
    pulseStart: number = 0;

    center: Point;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.meter = ProbeElm.TP_VOL;
            this.flags = ProbeElm.FLAG_SHOWVOLTAGE | ProbeElm.FLAG_CIRCLE;
            this.scale = CircuitElm.SCALE_AUTO;
            this.resistance = 1e7;
        } else {
            super(xa, ya, xb, yb!, f!);
            this.meter = ProbeElm.TP_VOL;
            this.scale = CircuitElm.SCALE_AUTO;
            this.resistance = 0;
            try {
                this.meter     = parseIntStrict(st!.nextToken());
                this.scale     = parseIntStrict(st!.nextToken());
                this.resistance = parseFloatStrict(st!.nextToken());
            } catch (e) {}
        }
    }

    getDumpType(): number { return 'p'.charCodeAt(0); }
    isProbeElm(): boolean { return true; }

    dump(): string {
        return super.dump() + " " + this.meter + " " + this.scale + " " + this.resistance;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "me", this.meter);
        CircuitXMLSerializer.dumpAttr(elem, "sc", this.scale);
        CircuitXMLSerializer.dumpAttr(elem, "re", this.resistance);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.flags = 0;
        super.undumpXml(xml);
        this.meter      = xml.parseIntAttr("me", this.meter);
        this.scale      = xml.parseIntAttr("sc", this.scale);
        this.resistance = xml.parseDoubleAttr("re", 0);
    }

    setPoints(): void {
        super.setPoints();
        this.center = this.interpPoint(this.point1, this.point2, .5) as Point;
    }

    reset(): void {
        super.reset();
        this.zerocount = 0;
        this.rmsV = this.total = this.count = 0;
        this.avgV = this.totalV = 0;
        this.maxV = this.lastMaxV = 0;
        this.minV = this.lastMinV = 0;
        this.binaryLevel = 0;
        this.period = this.pulseWidth = this.dutyCycle = 0;
        this.selectedValue = 0;
        this.periodStart = this.periodLength = this.pulseStart = 0;
        this.increasingV = true;
        this.decreasingV = true;
        this.started = false;
        this.lastStepCount = 0;
    }

    getMeter(): string {
        switch (this.meter) {
            case ProbeElm.TP_VOL: return "V";
            case ProbeElm.TP_RMS: return "V(rms)";
            case ProbeElm.TP_AVG: return "V(avg)";
            case ProbeElm.TP_MAX: return "Vmax";
            case ProbeElm.TP_MIN: return "Vmin";
            case ProbeElm.TP_P2P: return "Peak to peak";
            case ProbeElm.TP_BIN: return "Binary";
            case ProbeElm.TP_FRQ: return "Frequency";
            case ProbeElm.TP_PER: return "Period";
            case ProbeElm.TP_PWI: return "Pulse width";
            case ProbeElm.TP_DUT: return "Duty cycle";
        }
        return "";
    }

    mustShowVoltage(): boolean { return (this.flags & ProbeElm.FLAG_SHOWVOLTAGE) !== 0; }
    drawAsCircle():    boolean { return (this.flags & ProbeElm.FLAG_CIRCLE) !== 0; }

    draw(g: Graphics): void {
        g.save();
        const role = CircuitElm.app.mouse.scopePlotRoles.get(this);
        const showCircle = this.drawAsCircle() && (role == null || role === "");
        const hs = showCircle ? ProbeElm.circleSize : 8;
        this.setBbox(this.point1, this.point2, hs);
        const selected = this.needsHighlight();
        let len = (selected || this.isCreating() || this.mustShowVoltage()) ? 16 : this.dn - 32;
        if (showCircle)
            len = ProbeElm.circleSize * 2;
        this.calcLeads(len);
        this.setVoltageColor(g, this.nodes[0].v);
        if (selected)
            g.setColor(CircuitElm.selectColor);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        this.setVoltageColor(g, this.nodes[1].v);
        if (selected)
            g.setColor(CircuitElm.selectColor);
        CircuitElm.drawThickLine(g, this.lead2!, this.point2);
        const f = new Font("SansSerif", Font.BOLD, 14);
        g.setFont(f);
        if (role != null && role !== "")
            this.drawCenteredText(g, role, this.center.x, this.center.y, true);
        if (this.mustShowVoltage()) {
            let s = "";
            switch (this.meter) {
                case ProbeElm.TP_VOL: s = CircuitElm.getUnitTextWithScale(this.getVoltageDiff(), "V",       this.scale); break;
                case ProbeElm.TP_RMS: s = CircuitElm.getUnitTextWithScale(this.rmsV,             "V(rms)", this.scale); break;
                case ProbeElm.TP_AVG: s = CircuitElm.getUnitTextWithScale(this.avgV,             "V(avg)", this.scale); break;
                case ProbeElm.TP_MAX: s = CircuitElm.getUnitTextWithScale(this.lastMaxV,          "Vpk",   this.scale); break;
                case ProbeElm.TP_MIN: s = CircuitElm.getUnitTextWithScale(this.lastMinV,          "Vmin",  this.scale); break;
                case ProbeElm.TP_P2P: s = CircuitElm.getUnitTextWithScale(this.lastMaxV - this.lastMinV, "Vp2p", this.scale); break;
                case ProbeElm.TP_BIN: s = this.binaryLevel + ""; break;
                case ProbeElm.TP_FRQ: s = CircuitElm.getUnitText(this.frequency, "Hz"); break;
                case ProbeElm.TP_PER: break;
                case ProbeElm.TP_PWI: s = CircuitElm.getUnitText(this.pulseWidth, "s"); break;
                case ProbeElm.TP_DUT: s = CircuitElm.showFormat.format(this.dutyCycle); break;
            }
            this.drawValues(g, s, showCircle ? ProbeElm.circleSize + 3 : 4);
        }
        g.setColor(CircuitElm.whiteColor);
        g.setFont(CircuitElm.unitsFont);
        const plusPoint = this.interpPoint(this.point1, this.point2,
            (this.dn / 2 - len / 2 - 4) / this.dn, -10 * this.dsign) as Point;
        if (this.y2 > this.y)
            plusPoint.y += 4;
        if (this.y > this.y2)
            plusPoint.y += 3;
        const w = g.context.measureText("+").width;
        g.drawString("+", plusPoint.x - w / 2, plusPoint.y);
        if (showCircle) {
            g.setColor(CircuitElm.lightGrayColor);
            CircuitElm.drawThickCircle(g, this.center.x, this.center.y, ProbeElm.circleSize);
            this.drawCenteredText(g, "V", this.center.x, this.center.y, true);
        }
        this.drawPosts(g);
        g.restore();
    }

    stepFinished(): void {
        if (CircuitElm.sim.timeStepCount === this.lastStepCount)
            return;
        this.lastStepCount = CircuitElm.sim.timeStepCount;
        this.count++;
        const v = this.getVoltageDiff();
        this.total += v * v;
        this.totalV += v;

        // binary threshold is a fixed 2.5V (assumes ~5V logic levels); not scaled to the circuit's actual voltage range
        this.binaryLevel = (v < 2.5) ? 0 : 1;

        if (!this.started) {
            // prime max/min tracking with the first sample instead of the stale defaults (0, increasingV==decreasingV==true),
            // which could otherwise register a bogus transition on the first step
            this.started = true;
            this.maxV = this.minV = v;
            this.increasingV = true;
            this.decreasingV = false;
            this.periodStart = this.pulseStart = CircuitElm.sim.t;
        }

        if (v > this.maxV && this.increasingV) {
            this.maxV = v;
            this.increasingV = true;
            this.decreasingV = false;
        }
        if (v < this.maxV && this.increasingV) {
            // direction change: was going up, now going down
            this.lastMaxV     = this.maxV;
            this.periodLength = CircuitElm.sim.t - this.periodStart;
            this.periodStart  = CircuitElm.sim.t;
            this.period       = this.periodLength;
            this.pulseWidth   = CircuitElm.sim.t - this.pulseStart;
            this.dutyCycle    = this.pulseWidth / this.periodLength;
            this.minV         = v;
            this.increasingV  = false;
            this.decreasingV  = true;
            this.total /= this.count;
            this.rmsV = Math.sqrt(this.total);
            if (isNaN(this.rmsV)) this.rmsV = 0;
            this.avgV = this.totalV / this.count;
            if (isNaN(this.avgV)) this.avgV = 0;
            this.count = 0;
            this.total = 0;
            this.totalV = 0;
        }
        if (v < this.minV && this.decreasingV) {
            this.minV         = v;
            this.increasingV  = false;
            this.decreasingV  = true;
        }
        if (v > this.minV && this.decreasingV) {
            // direction change: was going down, now going up
            this.lastMinV    = this.minV;
            this.pulseStart  = CircuitElm.sim.t;
            this.maxV        = v;
            this.increasingV = true;
            this.decreasingV = false;
            this.total /= this.count;
            this.rmsV = Math.sqrt(this.total);
            if (isNaN(this.rmsV)) this.rmsV = 0;
            this.avgV = this.totalV / this.count;
            if (isNaN(this.avgV)) this.avgV = 0;
            this.count = 0;
            this.total = 0;
            this.totalV = 0;
        }
        if (v === 0) {
            this.zerocount++;
            if (this.zerocount > 5) {
                this.total = 0;
                this.rmsV  = 0;
                this.avgV  = 0;
                this.maxV  = 0;
                this.minV  = 0;
            }
        } else {
            this.zerocount = 0;
        }
    }

    calculateCurrent(): void {
        this.current = (this.resistance === 0) ? 0 : (this.nodes[0].v - this.nodes[1].v) / this.resistance;
    }

    stamp(): void {
        if (this.resistance !== 0)
            CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
    }

    getInfo(arr: string[]): void {
        arr[0] = "voltmeter";
        let i = 1;
        arr[i++] = this.getMeterLine(this.meter);
        // show the rest of the already-tracked values too, skipping whichever one is selected above.
        // frequency is left out here because it isn't actually computed anywhere (see getMeterLine);
        // binary value is left out to make room for average, since arr[] only has room for 10 entries total
        if (this.meter !== ProbeElm.TP_VOL) arr[i++] = this.getMeterLine(ProbeElm.TP_VOL);
        if (this.meter !== ProbeElm.TP_MAX) arr[i++] = this.getMeterLine(ProbeElm.TP_MAX);
        if (this.meter !== ProbeElm.TP_MIN) arr[i++] = this.getMeterLine(ProbeElm.TP_MIN);
        if (this.meter !== ProbeElm.TP_RMS) arr[i++] = this.getMeterLine(ProbeElm.TP_RMS);
        if (this.meter !== ProbeElm.TP_AVG) arr[i++] = this.getMeterLine(ProbeElm.TP_AVG);
        if (this.meter !== ProbeElm.TP_P2P) arr[i++] = this.getMeterLine(ProbeElm.TP_P2P);
        if (this.meter !== ProbeElm.TP_PER) arr[i++] = this.getMeterLine(ProbeElm.TP_PER);
        if (this.meter !== ProbeElm.TP_PWI) arr[i++] = this.getMeterLine(ProbeElm.TP_PWI);
        if (this.meter !== ProbeElm.TP_DUT) arr[i++] = this.getMeterLine(ProbeElm.TP_DUT);
    }

    getMeterLine(m: number): string {
        switch (m) {
            case ProbeElm.TP_VOL: return "Vd = " + CircuitElm.getVoltageText(this.getVoltageDiff());
            case ProbeElm.TP_RMS: return "V(rms) = " + CircuitElm.getVoltageText(this.rmsV);
            case ProbeElm.TP_AVG: return "V(avg) = " + CircuitElm.getVoltageText(this.avgV);
            case ProbeElm.TP_MAX: return "Vmax = " + CircuitElm.getVoltageText(this.lastMaxV);
            case ProbeElm.TP_MIN: return "Vmin = " + CircuitElm.getVoltageText(this.lastMinV);
            case ProbeElm.TP_P2P: return "Vp2p = " + CircuitElm.getVoltageText(this.lastMaxV - this.lastMinV);
            case ProbeElm.TP_BIN: return "Binary = " + this.binaryLevel;
            case ProbeElm.TP_FRQ: return "Freq = " + CircuitElm.getUnitText(this.frequency, "Hz");
            case ProbeElm.TP_PER: return "Period = " + CircuitElm.getUnitText(this.period, "s");
            case ProbeElm.TP_PWI: return "Pulse width = " + CircuitElm.getUnitText(this.pulseWidth, "s");
            case ProbeElm.TP_DUT: return "Duty cycle = " + CircuitElm.showFormat.format(this.dutyCycle);
        }
        return "";
    }

    getConnection(n1: number, n2: number): boolean { return this.resistance !== 0; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return EditInfo.createCheckbox("Show Value", this.mustShowVoltage());
        if (n === 1) {
            const ei = new EditInfo("Value", this.selectedValue, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Voltage");
            ei.choice.add("RMS Voltage");
            ei.choice.add("Average Voltage");
            ei.choice.add("Max Voltage");
            ei.choice.add("Min Voltage");
            ei.choice.add("P2P Voltage");
            ei.choice.add("Binary Value");
            // TP_AVG's value isn't contiguous with the other meter constants shown here (it was
            // appended after TP_DUT to avoid renumbering saved circuits), so map it explicitly.
            ei.choice.select(this.meterChoiceIndex(this.meter));
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("Scale", 0);
            ei.choice = new Choice();
            ei.choice.add("Auto");
            ei.choice.add("V");
            ei.choice.add("mV");
            ei.choice.add(Locale.muString + "V");
            ei.choice.select(this.scale);
            return ei;
        }
        if (n === 3)
            return EditInfo.createCheckbox("Use Circle Symbol", this.drawAsCircle());
        if (n === 4)
            return new EditInfo("Series Resistance (0 = infinite)", this.resistance);
        return null;
    }

    meterChoices(): number[] {
        return [ProbeElm.TP_VOL, ProbeElm.TP_RMS, ProbeElm.TP_AVG, ProbeElm.TP_MAX,
            ProbeElm.TP_MIN, ProbeElm.TP_P2P, ProbeElm.TP_BIN];
    }

    meterChoiceIndex(m: number): number {
        const choices = this.meterChoices();
        for (let i = 0; i !== choices.length; i++)
            if (choices[i] === m)
                return i;
        return 0;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.checkbox!.getState())
                this.flags |= ProbeElm.FLAG_SHOWVOLTAGE;
            else
                this.flags &= ~ProbeElm.FLAG_SHOWVOLTAGE;
        }
        if (n === 1)
            this.meter = this.meterChoices()[ei.choice!.getSelectedIndex()];
        if (n === 2)
            this.scale = ei.choice!.getSelectedIndex();
        if (n === 3)
            this.flags = ei.changeFlag(this.flags, ProbeElm.FLAG_CIRCLE);
        if (n === 4)
            this.resistance = ei.value;
    }
}
