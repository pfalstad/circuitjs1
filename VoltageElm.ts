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
import { Graphics } from "./Graphics";
import { Color } from "./Color";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { Checkbox } from "./Checkbox";
import { FindPathInfo } from "./FindPathInfo";
import { WireRouter } from "./WireRouter";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Locale } from "./Locale";
// RailElm not imported here — it extends VoltageElm, so importing it would create a cycle.
// Use 'getRailText' in this as a duck-type check for instanceof RailElm.

export class VoltageElm extends CircuitElm {
    static readonly FLAG_COS = 2;
    static readonly FLAG_PULSE_DUTY = 4;
    static readonly FLAG_CIRCLE_SYMBOL = 8;
    static readonly FLAG_SHOW_VOLTAGE = 16;
    static readonly FLAG_TIME_SPEC = 32;

    // this is separate because old RailElms may have FLAG_SHOW_VOLTAGE set even though it didn't do anything
    static readonly FLAG_SHOW_VOLTAGE_RAIL = 64;

    waveform: number;
    static readonly WF_DC = 0;
    static readonly WF_AC = 1;
    static readonly WF_SQUARE = 2;
    static readonly WF_TRIANGLE = 3;
    static readonly WF_SAWTOOTH = 4;
    static readonly WF_PULSE = 5;
    static readonly WF_NOISE = 6;
    static readonly WF_VAR = 7;
    frequency: number;
    maxVoltage: number;
    freqTimeZero: number;
    bias: number;
    phaseShift: number;
    dutyCycle: number;
    noiseValue: number;
    riseTime: number;

    static readonly defaultPulseDuty = 1/(2*Math.PI);

    constructor(xx: number, yy: number, wf: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xbOrWf: number, yb?: number, f?: number, st?: StringTokenizer) {
	if (yb === undefined) {
	    super(xa, ya);
	    this.waveform = xbOrWf;
	    this.maxVoltage = 5;
	    this.frequency = 60;
	    this.dutyCycle = .5;
	    this.bias = 0;
	    this.phaseShift = 0;
	    this.noiseValue = 0;
	    this.riseTime = 0;
	    this.freqTimeZero = 0;
	    this.flags |= VoltageElm.FLAG_SHOW_VOLTAGE;
	    this.reset();
	} else {
	    super(xa, ya, xbOrWf, yb!, f!);
	    this.maxVoltage = 5;
	    this.frequency = 40;
	    this.waveform = VoltageElm.WF_DC;
	    this.dutyCycle = .5;
	    this.bias = 0;
	    this.phaseShift = 0;
	    this.noiseValue = 0;
	    this.riseTime = 0;
	    this.freqTimeZero = 0;
	    try {
		this.waveform = parseInt(st!.nextToken());
		this.frequency = parseFloat(st!.nextToken());
		this.maxVoltage = parseFloat(st!.nextToken());
		this.bias = parseFloat(st!.nextToken());
		this.phaseShift = parseFloat(st!.nextToken());
		this.dutyCycle = parseFloat(st!.nextToken());
		// don't change this, we don't generate this format anymore, plus VarRailElm adds more stuff here
	    } catch (e) {
	    }

	    if ((this.flags & VoltageElm.FLAG_COS) != 0) {
		this.flags &= ~VoltageElm.FLAG_COS;
		this.phaseShift = VoltageElm.pi/2;
	    }

	    // old circuit files have the wrong duty cycle for pulse waveforms (wasn't configurable in the past)
	    if ((this.flags & VoltageElm.FLAG_PULSE_DUTY) == 0 && this.waveform == VoltageElm.WF_PULSE) {
		this.dutyCycle = VoltageElm.defaultPulseDuty;
	    }

	    this.reset();
	}
    }
    getDumpType(): number { return 'v'.charCodeAt(0); }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "wf", this.waveform);
	if (this.waveform != VoltageElm.WF_DC)
	    CircuitXMLSerializer.dumpAttr(elem, "fr", this.frequency);
        CircuitXMLSerializer.dumpAttr(elem, "maxv", this.maxVoltage);
	if (this.bias != 0)
            CircuitXMLSerializer.dumpAttr(elem, "bias", this.bias);
	if (this.phaseShift != 0)
            CircuitXMLSerializer.dumpAttr(elem, "phaseShift", this.phaseShift);
	if (this.dutyCycle != .5)
            CircuitXMLSerializer.dumpAttr(elem, "dutyCycle", this.dutyCycle);
	if (this.riseTime != 0)
            CircuitXMLSerializer.dumpAttr(elem, "riseTime", this.riseTime);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
	super.undumpXml(xml);
	this.waveform = xml.parseIntAttr("wf", this.waveform);
	this.frequency = xml.parseDoubleAttr("fr", this.frequency);
	this.maxVoltage = xml.parseDoubleAttr("maxv", this.maxVoltage);
	this.bias = xml.parseDoubleAttr("bias", this.bias);
	this.phaseShift = xml.parseDoubleAttr("phaseShift", this.phaseShift);
	this.dutyCycle = xml.parseDoubleAttr("dutyCycle", this.dutyCycle);
	this.riseTime = xml.parseDoubleAttr("riseTime", this.riseTime);
    }

    reset(): void {
	this.freqTimeZero = 0;
	this.curcount = 0;
    }
    triangleFunc(x: number): number {
	if (x < VoltageElm.pi)
	    return x*(2/VoltageElm.pi)-1;
	return 1-(x-VoltageElm.pi)*(2/VoltageElm.pi);
    }
    getVoltageSource() { return this.voltSource; }

    setVoltageSource(n: number, v: any): void {
	super.setVoltageSource(n, v);
	v.setNodes(this.nodes[0], this.nodes[1]);
    }

    stamp(): void {
	if (this.waveform == VoltageElm.WF_DC)
	    CircuitElm.sim.stampVoltageSource(this.nodes[0], this.nodes[1], this.voltSource,
				       this.getVoltage());
	else
	    CircuitElm.sim.stampVoltageSource(this.nodes[0], this.nodes[1], this.voltSource);
    }
    doStep(): void {
	if (this.waveform != VoltageElm.WF_DC)
	    CircuitElm.sim.updateVoltageSource(this.nodes[0], this.nodes[1], this.voltSource,
					this.getVoltage());
    }
    stepFinished(): void {
	if (this.waveform == VoltageElm.WF_NOISE)
	    this.noiseValue = (CircuitElm.app.random.nextDouble()*2-1) * this.maxVoltage + this.bias;
    }
    getVoltage(): number {
	if (this.waveform != VoltageElm.WF_DC && this.doDcAnalysis())
	    return this.bias;

	const w = 2*VoltageElm.pi*(CircuitElm.sim.t-this.freqTimeZero)*this.frequency + this.phaseShift;
	switch (this.waveform) {
	case VoltageElm.WF_DC: return this.maxVoltage+this.bias;
	case VoltageElm.WF_AC: return Math.sin(w)*this.maxVoltage+this.bias;
	case VoltageElm.WF_SQUARE:
	{
	    const wm = w % (2*VoltageElm.pi);
	    const dutyPhase = 2*VoltageElm.pi*this.dutyCycle;
	    if (this.riseTime > 0) {
		const risePhase = this.riseTime * this.frequency * 2 * VoltageElm.pi;
		const halfRise = risePhase/2;
		// rising edge centered at phase 0 (wraps around cycle boundary)
		if (wm < halfRise) {
		    const t = (wm + halfRise) / risePhase;
		    return this.bias + this.maxVoltage * (2*t - 1);
		}
		// high plateau
		else if (wm < dutyPhase - halfRise)
		    return this.bias + this.maxVoltage;
		// falling edge centered at dutyPhase
		else if (wm < dutyPhase + halfRise) {
		    const t = (wm - dutyPhase + halfRise) / risePhase;
		    return this.bias + this.maxVoltage * (1 - 2*t);
		}
		// low plateau
		else if (wm < 2*VoltageElm.pi - halfRise)
		    return this.bias - this.maxVoltage;
		// rising edge wrapping around end of cycle
		else {
		    const t = (wm - (2*VoltageElm.pi - halfRise)) / risePhase;
		    return this.bias + this.maxVoltage * (2*t - 1);
		}
	    }
	    return this.bias+((wm > dutyPhase) ? -this.maxVoltage : this.maxVoltage);
	}
	case VoltageElm.WF_TRIANGLE:
	    return this.bias+this.triangleFunc(w % (2*VoltageElm.pi))*this.maxVoltage;
	case VoltageElm.WF_SAWTOOTH:
	    return this.bias+(w % (2*VoltageElm.pi))*(this.maxVoltage/VoltageElm.pi)-this.maxVoltage;
	case VoltageElm.WF_PULSE:
	{
	    const wm = w % (2*VoltageElm.pi);
	    const dutyPhase = 2*VoltageElm.pi*this.dutyCycle;
	    if (this.riseTime > 0) {
		const risePhase = this.riseTime * this.frequency * 2 * VoltageElm.pi;
		const halfRise = risePhase/2;
		// rising edge centered at phase 0 (wraps around cycle boundary)
		if (wm < halfRise) {
		    const t = (wm + halfRise) / risePhase;
		    return this.bias + this.maxVoltage * t;
		}
		// high plateau
		else if (wm < dutyPhase - halfRise)
		    return this.bias + this.maxVoltage;
		// falling edge centered at dutyPhase
		else if (wm < dutyPhase + halfRise) {
		    const t = (wm - dutyPhase + halfRise) / risePhase;
		    return this.bias + this.maxVoltage * (1 - t);
		}
		// low for the rest of the cycle
		else if (wm < 2*VoltageElm.pi - halfRise)
		    return this.bias;
		// rising edge wrapping around end of cycle
		else {
		    const t = (wm - (2*VoltageElm.pi - halfRise)) / risePhase;
		    return this.bias + this.maxVoltage * t;
		}
	    }
	    return (wm < dutyPhase) ? this.maxVoltage+this.bias : this.bias;
	}
	case VoltageElm.WF_NOISE:
	    return this.noiseValue;
	default: return 0;
	}
    }
    readonly circleSize = 17;
    setPoints(): void {
	super.setPoints();
	if (this.waveform == VoltageElm.WF_DC && (this.flags & VoltageElm.FLAG_CIRCLE_SYMBOL) != 0)
	    this.calcLeads(this.circleSize*2);
	else
	    this.calcLeads((this.waveform == VoltageElm.WF_DC || this.waveform == VoltageElm.WF_VAR) ? 8 : this.circleSize*2);
    }
    draw(g: Graphics): void {
	this.setBbox(this.x, this.y, this.x2, this.y2);
	this.draw2Leads(g);
	if (this.waveform == VoltageElm.WF_DC && (this.flags & VoltageElm.FLAG_CIRCLE_SYMBOL) != 0) {
	    this.setBbox(this.point1, this.point2, this.circleSize);
	    this.interpPoint(this.lead1!, this.lead2!, CircuitElm.ps1, .5);
	    const xc = CircuitElm.ps1.x; const yc = CircuitElm.ps1.y;
	    g.setColor(this.needsHighlight() ? VoltageElm.selectColor : Color.gray);
	    this.setPowerColor(g, false);
	    CircuitElm.drawThickCircle(g, xc, yc, this.circleSize);
	    this.adjustBbox(xc-this.circleSize, yc-this.circleSize,
			   xc+this.circleSize, yc+this.circleSize);
	    // draw + and - signs inside the circle
	    const signSize = 4;
	    const plusPos = 0.74;
	    const minusPos = 0.26;
	    // + sign: perpendicular bar
	    this.interpPoint2(this.lead1!, this.lead2!, CircuitElm.ps1, CircuitElm.ps2, plusPos, signSize);
	    CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
	    // + sign: along-axis bar
	    const delta = signSize / (this.circleSize * 2.0);
	    const pA = this.interpPoint(this.lead1!, this.lead2!, plusPos - delta);
	    const pB = this.interpPoint(this.lead1!, this.lead2!, plusPos + delta);
	    CircuitElm.drawThickLine(g, pA, pB);
	    // - sign: perpendicular bar only
	    this.interpPoint2(this.lead1!, this.lead2!, CircuitElm.ps1, CircuitElm.ps2, minusPos, signSize);
	    CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
	} else if (this.waveform == VoltageElm.WF_DC) {
	    this.setVoltageColor(g, this.nodes[0].v);
	    this.setPowerColor(g, false);
	    this.interpPoint2(this.lead1!, this.lead2!, CircuitElm.ps1, CircuitElm.ps2, 0, 10);
	    CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
	    this.setVoltageColor(g, this.nodes[1].v);
	    this.setPowerColor(g, false);
	    const hs = 16;
	    this.setBbox(this.point1, this.point2, hs);
	    this.interpPoint2(this.lead1!, this.lead2!, CircuitElm.ps1, CircuitElm.ps2, 1, hs);
	    CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
	} else {
	    this.setBbox(this.point1, this.point2, this.circleSize);
	    this.interpPoint(this.lead1!, this.lead2!, CircuitElm.ps1, .5);
	    this.drawWaveform(g, CircuitElm.ps1);
	    let inds: string;
	    if (this.bias>0 || (this.bias==0 && this.waveform == VoltageElm.WF_PULSE))
               inds="+";
	    else
               inds="*";
	    g.setColor(VoltageElm.whiteColor);
	    g.setFont(VoltageElm.unitsFont);
	    const plusPoint = this.interpPoint(this.point1, this.point2, (this.dn/2+this.circleSize+4)/this.dn, 10*this.dsign);
            plusPoint.y += 4;
	    const w = Math.round(g.context.measureText(inds).width);
	    g.drawString(inds, plusPoint.x-w/2, plusPoint.y);
	}
	if (this.dx == 0 || this.dy == 0) {
	    const showV = (this.flags & VoltageElm.FLAG_SHOW_VOLTAGE) != 0;
	    const showF = this.showValues() && this.waveform != VoltageElm.WF_DC && this.waveform != VoltageElm.WF_NOISE;
	    let s: string | null = null;
	    if (showV && showF)
		s = this.getShortVoltageText() + " " + VoltageElm.getShortUnitText(this.frequency, "Hz");
	    else if (showV)
		s = this.getShortVoltageText();
	    else if (showF)
		s = VoltageElm.getShortUnitText(this.frequency, "Hz");
	    if (s != null) {
		const hs = (this.waveform == VoltageElm.WF_DC && (this.flags & VoltageElm.FLAG_CIRCLE_SYMBOL) == 0) ? 16 : this.circleSize;
		this.drawValues(g, s, hs);
	    }
	}
	this.updateDotCount();
	if (!this.isCreating()) {
	    if (this.waveform == VoltageElm.WF_DC && (this.flags & VoltageElm.FLAG_CIRCLE_SYMBOL) == 0)
		this.drawDots(g, this.point1, this.point2, this.curcount);
	    else {
		this.drawDots(g, this.point1, this.lead1!, this.curcount);
		this.drawDots(g, this.point2, this.lead2!, -this.curcount);
	    }
	}
	this.drawPosts(g);
    }

    drawWaveform(g: Graphics, center: Point): void {
	g.setColor(this.needsHighlight() ? VoltageElm.selectColor : Color.gray);
	this.setPowerColor(g, false);
	const xc = center.x; const yc = center.y;
	if (this.waveform != VoltageElm.WF_NOISE)
	    CircuitElm.drawThickCircle(g, xc, yc, this.circleSize);
	const wl = 8;
	this.adjustBbox(xc-this.circleSize, yc-this.circleSize,
			   xc+this.circleSize, yc+this.circleSize);
	let xc2: number;
	switch (this.waveform) {
	case VoltageElm.WF_DC:
	{
	    break;
	}
	case VoltageElm.WF_SQUARE:
	    xc2 = Math.round(wl*2*this.dutyCycle-wl+xc);
	    xc2 = VoltageElm.max(xc-wl+3, VoltageElm.min(xc+wl-3, xc2));
	    CircuitElm.drawThickLine(g, xc-wl, yc-wl, xc-wl, yc   );
	    CircuitElm.drawThickLine(g, xc-wl, yc-wl, xc2  , yc-wl);
	    CircuitElm.drawThickLine(g, xc2  , yc-wl, xc2  , yc+wl);
	    CircuitElm.drawThickLine(g, xc+wl, yc+wl, xc2  , yc+wl);
	    CircuitElm.drawThickLine(g, xc+wl, yc   , xc+wl, yc+wl);
	    break;
	case VoltageElm.WF_PULSE:
	{
	    const ycp = yc + wl/2;
	    CircuitElm.drawThickLine(g, xc-wl, ycp-wl, xc-wl, ycp   );
	    CircuitElm.drawThickLine(g, xc-wl, ycp-wl, xc-wl/2, ycp-wl);
	    CircuitElm.drawThickLine(g, xc-wl/2, ycp-wl, xc-wl/2, ycp);
	    CircuitElm.drawThickLine(g, xc-wl/2, ycp, xc+wl, ycp);
	    break;
	}
	case VoltageElm.WF_SAWTOOTH:
	    CircuitElm.drawThickLine(g, xc   , yc-wl, xc-wl, yc   );
	    CircuitElm.drawThickLine(g, xc   , yc-wl, xc   , yc+wl);
	    CircuitElm.drawThickLine(g, xc   , yc+wl, xc+wl, yc   );
	    break;
	case VoltageElm.WF_TRIANGLE:
	{
	    const xl = 5;
	    CircuitElm.drawThickLine(g, xc-xl*2, yc   , xc-xl, yc-wl);
	    CircuitElm.drawThickLine(g, xc-xl, yc-wl, xc, yc);
	    CircuitElm.drawThickLine(g, xc   , yc, xc+xl, yc+wl);
	    CircuitElm.drawThickLine(g, xc+xl, yc+wl, xc+xl*2, yc);
	    break;
	}
	case VoltageElm.WF_NOISE:
	{
	    g.setColor(this.needsHighlight() ? VoltageElm.selectColor : VoltageElm.whiteColor);
	    this.setPowerColor(g, false);
	    this.drawLabeledNode(g, Locale.LS("Noise"), this.point1, this.lead1!);
	    break;
	}
	case VoltageElm.WF_AC:
	{
	    const xl = 10;
	    g.context.beginPath();
	    g.context.lineWidth = 3.0;

	    for (let i = -xl; i <= xl; i++) {
		const yy = yc+Math.round(.95*Math.sin(i*VoltageElm.pi/xl)*wl);
		if (i == -xl)
		    g.context.moveTo(xc+i, yy);
		else
		    g.context.lineTo(xc+i, yy);
	    }
	    g.context.stroke();
	    g.context.lineWidth = 1.0;
	    break;
	}
	}
	if (this.isRailElm() && (this.dx == 0 || this.dy == 0)) {
	    const showV = (this.flags & VoltageElm.FLAG_SHOW_VOLTAGE_RAIL) != 0;
	    const showF = this.showValues() && this.waveform != VoltageElm.WF_NOISE;
	    let s: string | null = null;
	    if (showV && showF)
		s = this.getShortVoltageText() + " " + VoltageElm.getShortUnitText(this.frequency, "Hz");
	    else if (showV)
		s = this.getShortVoltageText();
	    else if (showF)
		s = VoltageElm.getShortUnitText(this.frequency, "Hz");
	    if (s != null)
		this.drawValues(g, s, this.circleSize);
	}
    }

    addRoutingObstacle(wr: WireRouter): void { this.addRoutingObstacleWithLeads(wr, 16); }

    static diffFromInteger(x: number): number {
	return Math.abs(x-Math.round(x));
    }

    // check if RMS would be a rounder number to display than peak
    useRmsDisplay(peakValue: number): boolean {
	const rmsMult = this.getRmsMultiplier();
	const rmsVal = peakValue * rmsMult;
	return rmsMult != 1 && Math.abs(peakValue) > 1e-4 &&
	    VoltageElm.diffFromInteger(rmsVal*1e4) < VoltageElm.diffFromInteger(peakValue*1e4);
    }

    // return a short voltage string, using RMS if that's a rounder number
    getShortVoltageText(): string {
	if (this.bias != 0)
	    return VoltageElm.getShortUnitText(this.bias + this.maxVoltage, "V");
	if (this.useRmsDisplay(this.maxVoltage))
	    return VoltageElm.getShortUnitText(this.maxVoltage * this.getRmsMultiplier(), "V") + "rms";
	return VoltageElm.getShortUnitText(this.maxVoltage, "V");
    }

    // return the RMS-to-peak multiplier for the current waveform.
    // RMS = amplitude * getRmsMultiplier(), so multiplier = 1/sqrt(2) for sine, etc.
    getRmsMultiplier(): number {
	switch (this.waveform) {
	case VoltageElm.WF_DC:       return 1;
	case VoltageElm.WF_AC:       return 1/Math.sqrt(2);       // sine: Vpk/sqrt(2)
	case VoltageElm.WF_SQUARE:   return 1;                     // square swings +A/-A, RMS=A
	case VoltageElm.WF_TRIANGLE: return 1/Math.sqrt(3);        // triangle: Vpk/sqrt(3)
	case VoltageElm.WF_SAWTOOTH: return 1/Math.sqrt(3);        // sawtooth: Vpk/sqrt(3)
	case VoltageElm.WF_PULSE:    return Math.sqrt(this.dutyCycle);   // pulse: Vpk*sqrt(d)
	default:          return 1;
	}
    }

    isVoltageElm(): boolean { return true; }

    getVoltageSourceCount(): number {
	return 1;
    }
    getPower(): number { return -this.getVoltageDiff()*this.current; }
    getVoltageDiff(): number { return this.nodes[1].v - this.nodes[0].v; }
    getInfo(arr: string[]): void {
	switch (this.waveform) {
	case VoltageElm.WF_DC: case VoltageElm.WF_VAR:
	    arr[0] = "voltage source"; break;
	case VoltageElm.WF_AC:       arr[0] = "A/C source"; break;
	case VoltageElm.WF_SQUARE:   arr[0] = "square wave gen"; break;
	case VoltageElm.WF_PULSE:    arr[0] = "pulse gen"; break;
	case VoltageElm.WF_SAWTOOTH: arr[0] = "sawtooth gen"; break;
	case VoltageElm.WF_TRIANGLE: arr[0] = "triangle gen"; break;
	case VoltageElm.WF_NOISE:    arr[0] = "noise gen"; break;
	}
	arr[1] = "I = " + VoltageElm.getCurrentText(this.getCurrent());
	arr[2] = ((this.isRailElm()) ? "V = " : "Vd = ") +
	    VoltageElm.getVoltageText(this.getVoltageDiff());
	let i = 3;
	if (this.waveform != VoltageElm.WF_DC && this.waveform != VoltageElm.WF_VAR && this.waveform != VoltageElm.WF_NOISE) {
	    arr[i++] = "f = " + VoltageElm.getUnitText(this.frequency, "Hz");
	    arr[i++] = "Vmax = " + VoltageElm.getVoltageText(this.maxVoltage);
	    if (this.bias == 0)
		arr[i++] = "V(rms) = " + VoltageElm.getVoltageText(this.maxVoltage*this.getRmsMultiplier());
	    if (this.bias != 0)
		arr[i++] = "Voff = " + VoltageElm.getVoltageText(this.bias);
	    else if (this.frequency > 500)
		arr[i++] = "wavelength = " +
		    VoltageElm.getUnitText(2.9979e8/this.frequency, "m");
	}
	if (this.waveform == VoltageElm.WF_DC && this.current != 0 && CircuitElm.app.showResistanceInVoltageSources)
	    arr[i++] = "(R = " + VoltageElm.getUnitText(this.maxVoltage/this.current, Locale.ohmString) + ")";
	arr[i++] = "P = " + VoltageElm.getUnitText(this.getPower(), "W");
    }
    getFrequencyOffset(): number { return 4; }
    hasTimingOptions(): boolean { return this.waveform == VoltageElm.WF_PULSE || this.waveform == VoltageElm.WF_SQUARE; }
    timeSpec(): boolean { return this.hasFlag(VoltageElm.FLAG_TIME_SPEC) && this.hasTimingOptions(); }

    setFrequency(newFreq: number): void {
	const oldfreq = this.frequency;
	this.frequency = newFreq;
	const maxfreq = 1/(8*CircuitElm.sim.maxTimeStep);
	if (this.frequency > maxfreq) {
	    if (window.confirm(Locale.LS("Adjust timestep to allow for higher frequencies?")))
		CircuitElm.sim.maxTimeStep = 1/(32*this.frequency);
	    else
		this.frequency = maxfreq;
	}
	this.freqTimeZero = (this.frequency == 0) ? 0 : CircuitElm.sim.t-oldfreq*(CircuitElm.sim.t-this.freqTimeZero)/this.frequency;
    }

    setFrequencyFromTimes(highTime: number, lowTime: number): void {
	const newFreq = 1 / (highTime + lowTime);
	const newDuty = highTime / (highTime + lowTime);
	this.setFrequency(newFreq);
	this.dutyCycle = newDuty;
    }

    getEditInfo(n: number): EditInfo | null {
	if (n == 0)
	    return new EditInfo(this.waveform == VoltageElm.WF_DC ? "Voltage" :
				"Max Voltage", this.maxVoltage, -20, 20);
	if (n == 1) {
	    const ei = new EditInfo("Waveform", this.waveform, -1, -1);
	    ei.choice = new Choice();
	    ei.choice.add("D/C");
	    ei.choice.add("A/C");
	    ei.choice.add("Square Wave");
	    ei.choice.add("Triangle");
	    ei.choice.add("Sawtooth");
	    ei.choice.add("Pulse");
	    ei.choice.add("Noise");
	    ei.choice.select(this.waveform);
	    return ei;
	}
	if (n == 2)
	    return new EditInfo("DC Offset (V)", this.bias, -20, 20);
	if (n == 3 && !(this.isRailElm() && (this.waveform == VoltageElm.WF_DC || this.waveform == VoltageElm.WF_VAR))) {
	    const ei = new EditInfo("", 0, -1, -1);
	    const svFlag = (this.isRailElm()) ? VoltageElm.FLAG_SHOW_VOLTAGE_RAIL : VoltageElm.FLAG_SHOW_VOLTAGE;
	    ei.checkbox = new Checkbox("Show Voltage", (this.flags & svFlag) != 0);
	    return ei;
	}
	if (n == 4 && this.waveform == VoltageElm.WF_DC && !(this.isRailElm())) {
	    const ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox = new Checkbox("Circle Symbol", (this.flags & VoltageElm.FLAG_CIRCLE_SYMBOL) != 0);
	    return ei;
	}
	const fo = this.getFrequencyOffset();
	if (this.waveform == VoltageElm.WF_DC || this.waveform == VoltageElm.WF_NOISE)
	    return null;
	const n2 = n - fo;
	if (this.hasTimingOptions()) {
	    // square/pulse: dropdown + freq-or-time + phase + duty-or-time + rise
	    if (n2 == 0) {
		const ei = new EditInfo("Specify As", 0, -1, -1);
		ei.choice = new Choice();
		ei.choice.add("Frequency/Duty Cycle");
		ei.choice.add("High Time/Low Time");
		ei.choice.select(this.timeSpec() ? 1 : 0);
		ei.newColumn = true;
		return ei;
	    }
	    if (n2 == 1) {
		if (this.timeSpec())
		    return new EditInfo("High Time (s)", this.dutyCycle / this.frequency, 0, 0);
		return new EditInfo("Frequency (Hz)", this.frequency, 4, 500);
	    }
	    if (n2 == 2)
		return new EditInfo("Phase Offset (degrees)", this.phaseShift*180/VoltageElm.pi,
				    -180, 180).setDimensionless();
	    if (n2 == 3) {
		if (this.timeSpec())
		    return new EditInfo("Low Time (s)", (1 - this.dutyCycle) / this.frequency, 0, 0);
		return new EditInfo("Duty Cycle", this.dutyCycle*100, 0, 100).
		    setDimensionless();
	    }
	    if (n2 == 4)
		return new EditInfo("Rise/Fall Time (s)", this.riseTime, 0, 0);
	} else {
	    // other waveforms: freq + phase only
	    if (n2 == 0)
		return new EditInfo("Frequency (Hz)", this.frequency, 4, 500);
	    if (n2 == 1)
		return new EditInfo("Phase Offset (degrees)", this.phaseShift*180/VoltageElm.pi,
				    -180, 180).setDimensionless();
	}
	return null;
    }
    setEditValue(n: number, ei: EditInfo): void {
	if (n == 0)
	    this.maxVoltage = ei.value;
	if (n == 2)
	    this.bias = ei.value;
	if (n == 3 && ei.checkbox != null) {
	    const svFlag = (this.isRailElm()) ? VoltageElm.FLAG_SHOW_VOLTAGE_RAIL : VoltageElm.FLAG_SHOW_VOLTAGE;
	    this.flags = ei.changeFlag(this.flags, svFlag);
	}
	if (n == 4 && this.waveform == VoltageElm.WF_DC && ei.checkbox != null && !(this.isRailElm())) {
	    this.flags = ei.changeFlag(this.flags, VoltageElm.FLAG_CIRCLE_SYMBOL);
	    this.setPoints();
	}
	if (n == 1) {
	    const ow = this.waveform;
	    this.waveform = ei.choice.getSelectedIndex();
	    if (this.waveform == VoltageElm.WF_DC && ow != VoltageElm.WF_DC) {
		ei.newDialog = true;
		this.bias = 0;
	    } else if (this.waveform != ow)
		ei.newDialog = true;

	    // change duty cycle if we're changing to or from pulse
	    if (this.waveform == VoltageElm.WF_PULSE && ow != VoltageElm.WF_PULSE)
		this.dutyCycle = VoltageElm.defaultPulseDuty;
	    else if (ow == VoltageElm.WF_PULSE && this.waveform != VoltageElm.WF_PULSE)
		this.dutyCycle = .5;

	    this.setPoints();
	}
	const fo = this.getFrequencyOffset();
	const n2 = n - fo;
	if (this.hasTimingOptions()) {
	    if (n2 == 0 && ei.choice != null) {
		const oldFlags = this.flags;
		this.flags = (ei.choice.getSelectedIndex() == 1) ?
		    (this.flags | VoltageElm.FLAG_TIME_SPEC) : (this.flags & ~VoltageElm.FLAG_TIME_SPEC);
		if (this.flags != oldFlags)
		    ei.newDialog = true;
	    }
	    if (n2 == 1) {
		if (this.timeSpec()) {
		    // high time changed; recompute frequency and duty cycle
		    const highTime = ei.value;
		    const lowTime = (1 - this.dutyCycle) / this.frequency;
		    if (highTime > 0 && lowTime > 0) {
			this.setFrequencyFromTimes(highTime, lowTime);
		    }
		} else if (ei.value != 0) {
		    this.setFrequency(ei.value);
		}
	    }
	    if (n2 == 2) {
		this.phaseShift = ei.value*VoltageElm.pi/180;
		this.phaseShift = ((this.phaseShift % (2*VoltageElm.pi)) + 2*VoltageElm.pi) % (2*VoltageElm.pi);
	    }
	    if (n2 == 3) {
		if (this.timeSpec()) {
		    // low time changed; recompute frequency and duty cycle
		    const highTime = this.dutyCycle / this.frequency;
		    const lowTime = ei.value;
		    if (highTime > 0 && lowTime > 0) {
			this.setFrequencyFromTimes(highTime, lowTime);
		    }
		} else {
		    this.dutyCycle = ei.value * .01;
		}
	    }
	    if (n2 == 4)
		this.riseTime = ei.value;
	} else {
	    if (n2 == 0 && this.waveform != VoltageElm.WF_DC && ei.value != 0)
		this.setFrequency(ei.value);
	    if (n2 == 1) {
		this.phaseShift = ei.value*VoltageElm.pi/180;
		this.phaseShift = ((this.phaseShift % (2*VoltageElm.pi)) + 2*VoltageElm.pi) % (2*VoltageElm.pi);
	    }
	}
    }
    validate(): boolean {
	if (this.getPostCount() == 2) {
	    const fpi = new FindPathInfo(FindPathInfo.VOLTAGE, this, this.getNode(1), CircuitElm.sim);
	    if (fpi.findPath(this.getNode(0))) {
		CircuitElm.sim.stop("Voltage source/wire loop with no resistance!", this);
		return false;
	    }
	}
	return true;
    }
}
