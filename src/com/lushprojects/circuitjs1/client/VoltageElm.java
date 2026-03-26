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

package com.lushprojects.circuitjs1.client;

import com.google.gwt.user.client.Window;
import com.lushprojects.circuitjs1.client.util.Locale;

import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.Document;

class VoltageElm extends CircuitElm {
    static final int FLAG_COS = 2;
    static final int FLAG_PULSE_DUTY = 4;
    static final int FLAG_CIRCLE_SYMBOL = 8;
    static final int FLAG_SHOW_VOLTAGE = 16;
    static final int FLAG_TIME_SPEC = 32;
    int waveform;
    static final int WF_DC = 0;
    static final int WF_AC = 1;
    static final int WF_SQUARE = 2;
    static final int WF_TRIANGLE = 3;
    static final int WF_SAWTOOTH = 4;
    static final int WF_PULSE = 5;
    static final int WF_NOISE = 6;
    static final int WF_VAR = 7;
    double frequency, maxVoltage, freqTimeZero, bias,
	phaseShift, dutyCycle, noiseValue, riseTime;
    
    static final double defaultPulseDuty = 1/(2*Math.PI);
    
    VoltageElm(int xx, int yy, int wf) {
	super(xx, yy);
	waveform = wf;
	maxVoltage = 5;
	frequency = 60;
	dutyCycle = .5;
	flags |= FLAG_SHOW_VOLTAGE;
	reset();
    }
    public VoltageElm(int xa, int ya, int xb, int yb, int f,
		      StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	maxVoltage = 5;
	frequency = 40;
	waveform = WF_DC;
	dutyCycle = .5;
	try {
	    waveform = new Integer(st.nextToken()).intValue();
	    frequency = new Double(st.nextToken()).doubleValue();
	    maxVoltage = new Double(st.nextToken()).doubleValue();
	    bias = new Double(st.nextToken()).doubleValue();
	    phaseShift = new Double(st.nextToken()).doubleValue();
	    dutyCycle = new Double(st.nextToken()).doubleValue();
	    // don't change this, we don't generate this format anymore, plus VarRailElm adds more stuff here
	} catch (Exception e) {
	}

	if ((flags & FLAG_COS) != 0) {
	    flags &= ~FLAG_COS;
	    phaseShift = pi/2;
	}
	
	// old circuit files have the wrong duty cycle for pulse waveforms (wasn't configurable in the past)
	if ((flags & FLAG_PULSE_DUTY) == 0 && waveform == WF_PULSE) {
	    dutyCycle = defaultPulseDuty;
	}
	
	reset();
    }
    int getDumpType() { return 'v'; }
    
    void dumpXml(Document doc, Element elem) {
        super.dumpXml(doc, elem);
        XMLSerializer.dumpAttr(elem, "wf", waveform);
	if (waveform != WF_DC)
	    XMLSerializer.dumpAttr(elem, "fr", frequency);
        XMLSerializer.dumpAttr(elem, "maxv", maxVoltage);
	if (bias != 0)
            XMLSerializer.dumpAttr(elem, "bias", bias);
	if (phaseShift != 0)
            XMLSerializer.dumpAttr(elem, "phaseShift", phaseShift);
	if (dutyCycle != .5)
            XMLSerializer.dumpAttr(elem, "dutyCycle", dutyCycle);
	if (riseTime != 0)
            XMLSerializer.dumpAttr(elem, "riseTime", riseTime);
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	waveform = xml.parseIntAttr("wf", waveform);
	frequency = xml.parseDoubleAttr("fr", frequency);
	maxVoltage = xml.parseDoubleAttr("maxv", maxVoltage);
	bias = xml.parseDoubleAttr("bias", bias);
	phaseShift = xml.parseDoubleAttr("phaseShift", phaseShift);
	dutyCycle = xml.parseDoubleAttr("dutyCycle", dutyCycle);
	riseTime = xml.parseDoubleAttr("riseTime", riseTime);
    }

    void reset() {
	freqTimeZero = 0;
	curcount = 0;
    }
    double triangleFunc(double x) {
	if (x < pi)
	    return x*(2/pi)-1;
	return 1-(x-pi)*(2/pi);
    }
    VoltageSource getVoltageSource() { return voltSource; }

    void setVoltageSource(int n, VoltageSource v) {
	super.setVoltageSource(n, v);
	v.setNodes(nodes[0], nodes[1]);
    }

    void stamp() {
	if (waveform == WF_DC)
	    sim.stampVoltageSource(nodes[0], nodes[1], voltSource,
			       getVoltage());
	else
	    sim.stampVoltageSource(nodes[0], nodes[1], voltSource);
    }
    void doStep() {
	if (waveform != WF_DC)
	    sim.updateVoltageSource(nodes[0], nodes[1], voltSource,
				getVoltage());
    }
    void stepFinished() {
	if (waveform == WF_NOISE)
	    noiseValue = (app.random.nextDouble()*2-1) * maxVoltage + bias;
    }
    double getVoltage() {
	if (waveform != WF_DC && doDcAnalysis())
	    return bias;
	
	double w = 2*pi*(sim.t-freqTimeZero)*frequency + phaseShift;
	switch (waveform) {
	case WF_DC: return maxVoltage+bias;
	case WF_AC: return Math.sin(w)*maxVoltage+bias;
	case WF_SQUARE:
	{
	    double wm = w % (2*pi);
	    double dutyPhase = 2*pi*dutyCycle;
	    if (riseTime > 0) {
		double risePhase = riseTime * frequency * 2 * pi;
		double halfRise = risePhase/2;
		// rising edge centered at phase 0 (wraps around cycle boundary)
		if (wm < halfRise) {
		    double t = (wm + halfRise) / risePhase;
		    return bias + maxVoltage * (2*t - 1);
		}
		// high plateau
		else if (wm < dutyPhase - halfRise)
		    return bias + maxVoltage;
		// falling edge centered at dutyPhase
		else if (wm < dutyPhase + halfRise) {
		    double t = (wm - dutyPhase + halfRise) / risePhase;
		    return bias + maxVoltage * (1 - 2*t);
		}
		// low plateau
		else if (wm < 2*pi - halfRise)
		    return bias - maxVoltage;
		// rising edge wrapping around end of cycle
		else {
		    double t = (wm - (2*pi - halfRise)) / risePhase;
		    return bias + maxVoltage * (2*t - 1);
		}
	    }
	    return bias+((wm > dutyPhase) ? -maxVoltage : maxVoltage);
	}
	case WF_TRIANGLE:
	    return bias+triangleFunc(w % (2*pi))*maxVoltage;
	case WF_SAWTOOTH:
	    return bias+(w % (2*pi))*(maxVoltage/pi)-maxVoltage;
	case WF_PULSE:
	{
	    double wm = w % (2*pi);
	    double dutyPhase = 2*pi*dutyCycle;
	    if (riseTime > 0) {
		double risePhase = riseTime * frequency * 2 * pi;
		double halfRise = risePhase/2;
		// rising edge centered at phase 0 (wraps around cycle boundary)
		if (wm < halfRise) {
		    double t = (wm + halfRise) / risePhase;
		    return bias + maxVoltage * t;
		}
		// high plateau
		else if (wm < dutyPhase - halfRise)
		    return bias + maxVoltage;
		// falling edge centered at dutyPhase
		else if (wm < dutyPhase + halfRise) {
		    double t = (wm - dutyPhase + halfRise) / risePhase;
		    return bias + maxVoltage * (1 - t);
		}
		// low for the rest of the cycle
		else if (wm < 2*pi - halfRise)
		    return bias;
		// rising edge wrapping around end of cycle
		else {
		    double t = (wm - (2*pi - halfRise)) / risePhase;
		    return bias + maxVoltage * t;
		}
	    }
	    return (wm < dutyPhase) ? maxVoltage+bias : bias;
	}
	case WF_NOISE:
	    return noiseValue;
	default: return 0;
	}
    }
    final int circleSize = 17;
    void setPoints() {
	super.setPoints();
	if (waveform == WF_DC && (flags & FLAG_CIRCLE_SYMBOL) != 0)
	    calcLeads(circleSize*2);
	else
	    calcLeads((waveform == WF_DC || waveform == WF_VAR) ? 8 : circleSize*2);
    }
    void draw(Graphics g) {
	setBbox(x, y, x2, y2);
	draw2Leads(g);
	if (waveform == WF_DC && (flags & FLAG_CIRCLE_SYMBOL) != 0) {
	    setBbox(point1, point2, circleSize);
	    interpPoint(lead1, lead2, ps1, .5);
	    int xc = ps1.x; int yc = ps1.y;
	    g.setColor(needsHighlight() ? selectColor : Color.gray);
	    setPowerColor(g, false);
	    drawThickCircle(g, xc, yc, circleSize);
	    adjustBbox(xc-circleSize, yc-circleSize,
		       xc+circleSize, yc+circleSize);
	    // draw + and - signs inside the circle
	    int signSize = 4;
	    double plusPos = 0.74;
	    double minusPos = 0.26;
	    // + sign: perpendicular bar
	    interpPoint2(lead1, lead2, ps1, ps2, plusPos, signSize);
	    drawThickLine(g, ps1, ps2);
	    // + sign: along-axis bar
	    double delta = signSize / (circleSize * 2.0);
	    Point pA = interpPoint(lead1, lead2, plusPos - delta);
	    Point pB = interpPoint(lead1, lead2, plusPos + delta);
	    drawThickLine(g, pA, pB);
	    // - sign: perpendicular bar only
	    interpPoint2(lead1, lead2, ps1, ps2, minusPos, signSize);
	    drawThickLine(g, ps1, ps2);
	} else if (waveform == WF_DC) {
	    setVoltageColor(g, volts[0]);
	    setPowerColor(g, false);
	    interpPoint2(lead1, lead2, ps1, ps2, 0, 10);
	    drawThickLine(g, ps1, ps2);
	    setVoltageColor(g, volts[1]);
	    setPowerColor(g, false);
	    int hs = 16;
	    setBbox(point1, point2, hs);
	    interpPoint2(lead1, lead2, ps1, ps2, 1, hs);
	    drawThickLine(g, ps1, ps2);
	} else {
	    setBbox(point1, point2, circleSize);
	    interpPoint(lead1, lead2, ps1, .5);
	    drawWaveform(g, ps1);
	    String inds;
	    if (bias>0 || (bias==0 && waveform == WF_PULSE))
               inds="+";
	    else
               inds="*";
	    g.setColor(whiteColor);
	    g.setFont(unitsFont);
	    Point plusPoint = interpPoint(point1, point2, (dn/2+circleSize+4)/dn, 10*dsign );
            plusPoint.y += 4;
	    int w = (int)g.context.measureText(inds).getWidth();;
	    g.drawString(inds, plusPoint.x-w/2, plusPoint.y);
	}
	if (dx == 0 || dy == 0) {
	    boolean showV = (flags & FLAG_SHOW_VOLTAGE) != 0;
	    boolean showF = showValues() && waveform != WF_DC && waveform != WF_NOISE;
	    String s = null;
	    if (showV && showF)
		s = getShortVoltageText() + " " +
		    getShortUnitText(frequency, "Hz");
	    else if (showV)
		s = getShortVoltageText();
	    else if (showF)
		s = getShortUnitText(frequency, "Hz");
	    if (s != null) {
		int hs = (waveform == WF_DC && (flags & FLAG_CIRCLE_SYMBOL) == 0) ? 16 : circleSize;
		drawValues(g, s, hs);
	    }
	}
	updateDotCount();
	if (!isCreating()) {
	    if (waveform == WF_DC && (flags & FLAG_CIRCLE_SYMBOL) == 0)
		drawDots(g, point1, point2, curcount);
	    else {
		drawDots(g, point1, lead1, curcount);
		drawDots(g, point2, lead2, -curcount);
	    }
	}
	drawPosts(g);
    }
	
    void drawWaveform(Graphics g, Point center) {
	g.setColor(needsHighlight() ? selectColor : Color.gray);
	setPowerColor(g, false);
	int xc = center.x; int yc = center.y;
	if (waveform != WF_NOISE)
	    drawThickCircle(g, xc, yc, circleSize);
	int wl = 8;
	adjustBbox(xc-circleSize, yc-circleSize,
		   xc+circleSize, yc+circleSize);
	int xc2;
	switch (waveform) {
	case WF_DC:
	{
	    break;
	}
	case WF_SQUARE:
	    xc2 = (int) (wl*2*dutyCycle-wl+xc);
	    xc2 = max(xc-wl+3, min(xc+wl-3, xc2));
	    drawThickLine(g, xc-wl, yc-wl, xc-wl, yc   );
	    drawThickLine(g, xc-wl, yc-wl, xc2  , yc-wl);
	    drawThickLine(g, xc2  , yc-wl, xc2  , yc+wl);
	    drawThickLine(g, xc+wl, yc+wl, xc2  , yc+wl);
	    drawThickLine(g, xc+wl, yc   , xc+wl, yc+wl);
	    break;
	case WF_PULSE:
	    yc += wl/2;
	    drawThickLine(g, xc-wl, yc-wl, xc-wl, yc   );
	    drawThickLine(g, xc-wl, yc-wl, xc-wl/2, yc-wl);
	    drawThickLine(g, xc-wl/2, yc-wl, xc-wl/2, yc);
	    drawThickLine(g, xc-wl/2, yc, xc+wl, yc);
	    break;
	case WF_SAWTOOTH:
	    drawThickLine(g, xc   , yc-wl, xc-wl, yc   );
	    drawThickLine(g, xc   , yc-wl, xc   , yc+wl);
	    drawThickLine(g, xc   , yc+wl, xc+wl, yc   );
	    break;
	case WF_TRIANGLE:
	{
	    int xl = 5;
	    drawThickLine(g, xc-xl*2, yc   , xc-xl, yc-wl);
	    drawThickLine(g, xc-xl, yc-wl, xc, yc);
	    drawThickLine(g, xc   , yc, xc+xl, yc+wl);
	    drawThickLine(g, xc+xl, yc+wl, xc+xl*2, yc);
	    break;
	}
	case WF_NOISE:
	{
	    g.setColor(needsHighlight() ? selectColor : whiteColor);
	    setPowerColor(g, false);
	    drawLabeledNode(g, Locale.LS("Noise"), point1, lead1);
	    break;
	}
	case WF_AC:
	{
	    int i;
	    int xl = 10;
	    g.context.beginPath();
	    g.context.setLineWidth(3.0);

	    for (i = -xl; i <= xl; i++) {
		int yy = yc+(int) (.95*Math.sin(i*pi/xl)*wl);
		if (i == -xl)
		    g.context.moveTo(xc+i, yy);
		else
		    g.context.lineTo(xc+i, yy);
	    }
	    g.context.stroke();
	    g.context.setLineWidth(1.0);
	    break;
	}
	}
	if (this instanceof RailElm && showValues() && waveform != WF_NOISE) {
	    String s = getShortUnitText(frequency, "Hz");
	    if (dx == 0 || dy == 0)
		drawValues(g, s, circleSize);
	}
    }

    void addRoutingObstacle(WireRouter wr) { addRoutingObstacleWithLeads(wr, 16); }

    static double diffFromInteger(double x) {
	return Math.abs(x-Math.round(x));
    }

    // check if RMS would be a rounder number to display than peak
    boolean useRmsDisplay(double peakValue) {
	double rmsMult = getRmsMultiplier();
	double rmsVal = peakValue * rmsMult;
	return rmsMult != 1 && Math.abs(peakValue) > 1e-4 &&
	    diffFromInteger(rmsVal*1e4) < diffFromInteger(peakValue*1e4);
    }

    // return a short voltage string, using RMS if that's a rounder number
    String getShortVoltageText() {
	if (useRmsDisplay(maxVoltage))
	    return getShortUnitText(maxVoltage * getRmsMultiplier(), "V") + "rms";
	return getShortUnitText(maxVoltage, "V");
    }

    // return the RMS-to-peak multiplier for the current waveform.
    // RMS = amplitude * getRmsMultiplier(), so multiplier = 1/sqrt(2) for sine, etc.
    double getRmsMultiplier() {
	switch (waveform) {
	case WF_DC:       return 1;
	case WF_AC:       return 1/Math.sqrt(2);       // sine: Vpk/sqrt(2)
	case WF_SQUARE:   return 1;                     // square swings +A/-A, RMS=A
	case WF_TRIANGLE: return 1/Math.sqrt(3);        // triangle: Vpk/sqrt(3)
	case WF_SAWTOOTH: return 1/Math.sqrt(3);        // sawtooth: Vpk/sqrt(3)
	case WF_PULSE:    return Math.sqrt(dutyCycle);   // pulse: Vpk*sqrt(d)
	default:          return 1;
	}
    }

    int getVoltageSourceCount() {
	return 1;
    }
    double getPower() { return -getVoltageDiff()*current; }
    double getVoltageDiff() { return volts[1] - volts[0]; }
    void getInfo(String arr[]) {
	switch (waveform) {
	case WF_DC: case WF_VAR:
	    arr[0] = "voltage source"; break;
	case WF_AC:       arr[0] = "A/C source"; break;
	case WF_SQUARE:   arr[0] = "square wave gen"; break;
	case WF_PULSE:    arr[0] = "pulse gen"; break;
	case WF_SAWTOOTH: arr[0] = "sawtooth gen"; break;
	case WF_TRIANGLE: arr[0] = "triangle gen"; break;
	case WF_NOISE:    arr[0] = "noise gen"; break;
	}
	arr[1] = "I = " + getCurrentText(getCurrent());
	arr[2] = ((this instanceof RailElm) ? "V = " : "Vd = ") +
	    getVoltageText(getVoltageDiff());
	int i = 3;
	if (waveform != WF_DC && waveform != WF_VAR && waveform != WF_NOISE) {
	    arr[i++] = "f = " + getUnitText(frequency, "Hz");
	    arr[i++] = "Vmax = " + getVoltageText(maxVoltage);
	    if (bias == 0)
		arr[i++] = "V(rms) = " + getVoltageText(maxVoltage*getRmsMultiplier());
	    if (bias != 0)
		arr[i++] = "Voff = " + getVoltageText(bias);
	    else if (frequency > 500)
		arr[i++] = "wavelength = " +
		    getUnitText(2.9979e8/frequency, "m");
	}
	if (waveform == WF_DC && current != 0 && app.showResistanceInVoltageSources)
	    arr[i++] = "(R = " + getUnitText(maxVoltage/current, Locale.ohmString) + ")";
	arr[i++] = "P = " + getUnitText(getPower(), "W");
    }
    // rails don't have Show Voltage or Circle Symbol options, so frequency starts earlier
    int getFrequencyOffset() { return (this instanceof RailElm) ? 3 : 4; }
    boolean hasTimingOptions() { return waveform == WF_PULSE || waveform == WF_SQUARE; }
    boolean timeSpec() { return hasFlag(FLAG_TIME_SPEC) && hasTimingOptions(); }

    void setFrequency(double newFreq) {
	double oldfreq = frequency;
	frequency = newFreq;
	double maxfreq = 1/(8*sim.maxTimeStep);
	if (frequency > maxfreq) {
	    if (Window.confirm(Locale.LS("Adjust timestep to allow for higher frequencies?")))
		sim.maxTimeStep = 1/(32*frequency);
	    else
		frequency = maxfreq;
	}
	freqTimeZero = (frequency == 0) ? 0 : sim.t-oldfreq*(sim.t-freqTimeZero)/frequency;
    }

    void setFrequencyFromTimes(double highTime, double lowTime) {
	double newFreq = 1 / (highTime + lowTime);
	double newDuty = highTime / (highTime + lowTime);
	setFrequency(newFreq);
	dutyCycle = newDuty;
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0)
	    return new EditInfo(waveform == WF_DC ? "Voltage" :
				"Max Voltage", maxVoltage, -20, 20);
	if (n == 1) {
	    EditInfo ei =  new EditInfo("Waveform", waveform, -1, -1);
	    ei.choice = new Choice();
	    ei.choice.add("D/C");
	    ei.choice.add("A/C");
	    ei.choice.add("Square Wave");
	    ei.choice.add("Triangle");
	    ei.choice.add("Sawtooth");
	    ei.choice.add("Pulse");
	    ei.choice.add("Noise");
	    ei.choice.select(waveform);
	    return ei;
	}
	if (n == 2)
	    return new EditInfo("DC Offset (V)", bias, -20, 20);
	if (n == 3 && !(this instanceof RailElm)) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox = new Checkbox("Show Voltage", (flags & FLAG_SHOW_VOLTAGE) != 0);
	    return ei;
	}
	if (n == 4 && waveform == WF_DC && !(this instanceof RailElm)) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox = new Checkbox("Circle Symbol", (flags & FLAG_CIRCLE_SYMBOL) != 0);
	    return ei;
	}
	int fo = getFrequencyOffset();
	if (waveform == WF_DC || waveform == WF_NOISE)
	    return null;
	int n2 = n - fo;
	if (hasTimingOptions()) {
	    // square/pulse: dropdown + freq-or-time + phase + duty-or-time + rise
	    if (n2 == 0) {
		EditInfo ei = new EditInfo("Specify As", 0, -1, -1);
		ei.choice = new Choice();
		ei.choice.add("Frequency/Duty Cycle");
		ei.choice.add("High Time/Low Time");
		ei.choice.select(timeSpec() ? 1 : 0);
		ei.newColumn = true;
		return ei;
	    }
	    if (n2 == 1) {
		if (timeSpec())
		    return new EditInfo("High Time (s)", dutyCycle / frequency, 0, 0);
		return new EditInfo("Frequency (Hz)", frequency, 4, 500);
	    }
	    if (n2 == 2)
		return new EditInfo("Phase Offset (degrees)", phaseShift*180/pi,
				    -180, 180).setDimensionless();
	    if (n2 == 3) {
		if (timeSpec())
		    return new EditInfo("Low Time (s)", (1 - dutyCycle) / frequency, 0, 0);
		return new EditInfo("Duty Cycle", dutyCycle*100, 0, 100).
		    setDimensionless();
	    }
	    if (n2 == 4)
		return new EditInfo("Rise/Fall Time (s)", riseTime, 0, 0);
	} else {
	    // other waveforms: freq + phase only
	    if (n2 == 0)
		return new EditInfo("Frequency (Hz)", frequency, 4, 500);
	    if (n2 == 1)
		return new EditInfo("Phase Offset (degrees)", phaseShift*180/pi,
				    -180, 180).setDimensionless();
	}
	return null;
    }
    public void setEditValue(int n, EditInfo ei) {
	if (n == 0)
	    maxVoltage = ei.value;
	if (n == 2)
	    bias = ei.value;
	if (n == 3 && ei.checkbox != null && !(this instanceof RailElm))
	    flags = ei.changeFlag(flags, FLAG_SHOW_VOLTAGE);
	if (n == 4 && waveform == WF_DC && ei.checkbox != null && !(this instanceof RailElm)) {
	    flags = ei.changeFlag(flags, FLAG_CIRCLE_SYMBOL);
	    setPoints();
	}
	if (n == 1) {
	    int ow = waveform;
	    waveform = ei.choice.getSelectedIndex();
	    if (waveform == WF_DC && ow != WF_DC) {
		ei.newDialog = true;
		bias = 0;
	    } else if (waveform != ow)
		ei.newDialog = true;

	    // change duty cycle if we're changing to or from pulse
	    if (waveform == WF_PULSE && ow != WF_PULSE)
		dutyCycle = defaultPulseDuty;
	    else if (ow == WF_PULSE && waveform != WF_PULSE)
		dutyCycle = .5;

	    setPoints();
	}
	int fo = getFrequencyOffset();
	int n2 = n - fo;
	if (hasTimingOptions()) {
	    if (n2 == 0 && ei.choice != null) {
		int oldFlags = flags;
		flags = (ei.choice.getSelectedIndex() == 1) ?
		    (flags | FLAG_TIME_SPEC) : (flags & ~FLAG_TIME_SPEC);
		if (flags != oldFlags)
		    ei.newDialog = true;
	    }
	    if (n2 == 1) {
		if (timeSpec()) {
		    // high time changed; recompute frequency and duty cycle
		    double highTime = ei.value;
		    double lowTime = (1 - dutyCycle) / frequency;
		    if (highTime > 0 && lowTime > 0) {
			setFrequencyFromTimes(highTime, lowTime);
		    }
		} else if (ei.value != 0) {
		    setFrequency(ei.value);
		}
	    }
	    if (n2 == 2) {
		phaseShift = ei.value*pi/180;
		phaseShift = ((phaseShift % (2*pi)) + 2*pi) % (2*pi);
	    }
	    if (n2 == 3) {
		if (timeSpec()) {
		    // low time changed; recompute frequency and duty cycle
		    double highTime = dutyCycle / frequency;
		    double lowTime = ei.value;
		    if (highTime > 0 && lowTime > 0) {
			setFrequencyFromTimes(highTime, lowTime);
		    }
		} else {
		    dutyCycle = ei.value * .01;
		}
	    }
	    if (n2 == 4)
		riseTime = ei.value;
	} else {
	    if (n2 == 0 && waveform != WF_DC && ei.value != 0)
		setFrequency(ei.value);
	    if (n2 == 1) {
		phaseShift = ei.value*pi/180;
		phaseShift = ((phaseShift % (2*pi)) + 2*pi) % (2*pi);
	    }
	}
    }
}

