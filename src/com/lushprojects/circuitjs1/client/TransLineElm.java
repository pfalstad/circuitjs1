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

import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.Document;

import com.lushprojects.circuitjs1.client.util.Locale;

class TransLineElm extends CircuitElm {
    double delay, imped;
    double resistance;  // total series resistance (ohms), 0 = lossless
    double conductance;  // total shunt conductance (siemens), 0 = no leakage

    // lossless model state
    double voltageL[], voltageR[];
    int lenSteps, ptr, width;
    int lastStepCount;

    // lossy RLGC ladder model state
    int actualSegments;
    double[] indCurSrc;     // inductor companion current source per segment
    double[] indCurrent;    // inductor current per segment
    double[] capVoltDiff;   // capacitor voltage per shunt point
    double[] capCurSrc;     // capacitor companion current source per shunt point
    double indCompR;        // inductor companion resistance = 2*L_seg/dt
    double capCompG;        // capacitor companion conductance = 2*C_seg/dt
    double totalSeriesR;    // R_seg + indCompR per segment

    boolean isLossy() { return resistance > 0 || conductance > 0; }

    // Map ladder position (0..actualSegments) to volts[] index.
    // Position 0 = Port 2, position actualSegments = Port 3,
    // positions 1..actualSegments-1 = internal nodes[4..].
    int topNodeIndex(int i) {
	if (i == 0) return 2;
	if (i == actualSegments) return 3;
	return 4 + i - 1;
    }

    public TransLineElm(int xx, int yy) {
	super(xx, yy);
	delay = 1000*sim.maxTimeStep;
	imped = 75;
	noDiagonal = true;
	reset();
    }
    public TransLineElm(int xa, int ya, int xb, int yb, int f,
			StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	delay = new Double(st.nextToken()).doubleValue();
	imped = new Double(st.nextToken()).doubleValue();
	width = new Integer(st.nextToken()).intValue();
	try {
	    resistance = new Double(st.nextToken()).doubleValue();
	} catch (Exception e) {}
	try {
	    conductance = new Double(st.nextToken()).doubleValue();
	} catch (Exception e) {}
	noDiagonal = true;
	reset();
    }
    int getDumpType() { return 171; }
    int getPostCount() { return 4; }
    int getInternalNodeCount() {
	if (isLossy()) {
	    computeSegments();
	    return actualSegments - 1;
	}
	return 2;
    }
    int getVoltageSourceCount() { return isLossy() ? 0 : 2; }

    String getXmlDumpType() { return "tl"; }
    String dump() {
	return super.dump() + " " + delay + " " + imped + " " + width + " " + resistance + " " + conductance;
    }

    void dumpXml(Document doc, Element elem) {
        super.dumpXml(doc, elem);
        XMLSerializer.dumpAttr(elem, "de", delay);
        XMLSerializer.dumpAttr(elem, "im", imped);
        XMLSerializer.dumpAttr(elem, "wi", width);
	if (resistance != 0)
	    XMLSerializer.dumpAttr(elem, "rs", resistance);
	if (conductance != 0)
	    XMLSerializer.dumpAttr(elem, "gs", conductance);
    }

    void undumpXml(XMLDeserializer xml) {
        super.undumpXml(xml);
        delay = xml.parseDoubleAttr("de", delay);
        imped = xml.parseDoubleAttr("im", imped);
        width = xml.parseIntAttr("wi", width);
	resistance = xml.parseDoubleAttr("rs", resistance);
	conductance = xml.parseDoubleAttr("gs", conductance);
	reset();
    }

    void drag(int xx, int yy) {
	xx = snapGrid(xx);
	yy = snapGrid(yy);
	int w1 = max(app.gridSize, abs(yy-y));
	int w2 = max(app.gridSize, abs(xx-x));
	if (w1 > w2) {
	    xx = x;
	    width = w2;
	} else {
	    yy = y;
	    width = w1;
	}
	x2 = xx; y2 = yy;
	setPoints();
    }

    Point posts[], inner[];

    void computeSegments() {
	if (sim.maxTimeStep == 0) {
	    actualSegments = 10;
	    return;
	}
	int ls = (int) (delay / sim.maxTimeStep);
	// ensure at least 2 timesteps per segment for stability
	actualSegments = Math.max(4, Math.min(50, ls / 4));
	if (actualSegments > ls)
	    actualSegments = Math.max(2, ls);
    }

    void reset() {
	if (sim.maxTimeStep == 0)
	    return;
	lenSteps = (int) (delay/sim.maxTimeStep);
	if (isLossy()) {
	    computeSegments();
	    indCurSrc = new double[actualSegments];
	    indCurrent = new double[actualSegments];
	    capVoltDiff = new double[actualSegments];
	    capCurSrc = new double[actualSegments];
	    voltageL = voltageR = null;
	} else {
	    if (lenSteps > 100000)
		voltageL = voltageR = null;
	    else {
		voltageL = new double[lenSteps];
		voltageR = new double[lenSteps];
	    }
	    indCurSrc = null;
	}
	ptr = 0;
	super.reset();
	lastStepCount = 0;
    }
    void setPoints() {
	super.setPoints();
	int ds = (dy == 0) ? sign(dx) : -sign(dy);
	Point p3 = interpPoint(point1, point2, 0, -width*ds);
	Point p4 = interpPoint(point1, point2, 1, -width*ds);
	int sep = app.gridSize/2;
	Point p5 = interpPoint(point1, point2, 0, -(width/2-sep)*ds);
	Point p6 = interpPoint(point1, point2, 1, -(width/2-sep)*ds);
	Point p7 = interpPoint(point1, point2, 0, -(width/2+sep)*ds);
	Point p8 = interpPoint(point1, point2, 1, -(width/2+sep)*ds);

	// we number the posts like this because we want the lower-numbered
	// points to be on the bottom, so that if some of them are unconnected
	// (which is often true) then the bottom ones will get automatically
	// attached to ground.
	posts = new Point[] { p3, p4, point1, point2 };
	inner = new Point[] { p7, p8, p5, p6 };
    }
    void draw(Graphics g) {
	setBbox(posts[0], posts[3], 0);
	int segments = (int) (dn/2);
	double segf = 1./segments;
	int i;
	g.setColor(Color.darkGray);
	g.fillRect(inner[2].x, inner[2].y,
		   inner[1].x-inner[2].x+2, inner[1].y-inner[2].y+2);
	for (i = 0; i != 4; i++) {
	    setVoltageColor(g, volts[i]);
	    drawThickLine(g, posts[i], inner[i]);
	}
	if (isLossy() && indCurSrc != null) {
	    // draw voltage distribution from internal node voltages
	    for (i = 0; i != segments; i++) {
		// map visual segment to ladder position
		double frac = (double) i / segments;
		int ladderPos = (int) (frac * actualSegments);
		if (ladderPos > actualSegments) ladderPos = actualSegments;
		double v = volts[topNodeIndex(ladderPos)];
		setVoltageColor(g, v);
		interpPoint(inner[0], inner[1], ps1, i*segf);
		interpPoint(inner[2], inner[3], ps2, i*segf);
		g.drawLine(ps1.x, ps1.y, ps2.x, ps2.y);
		interpPoint(inner[2], inner[3], ps1, (i+1)*segf);
		drawThickLine(g, ps1, ps2);
	    }
	} else if (voltageL != null) {
	    int ix0 = ptr-1+lenSteps;
	    for (i = 0; i != segments; i++) {
		int ix1 = (ix0-lenSteps*i/segments) % lenSteps;
		int ix2 = (ix0-lenSteps*(segments-1-i)/segments) % lenSteps;
		double v = (voltageL[ix1]+voltageR[ix2])/2;
		setVoltageColor(g, v);
		interpPoint(inner[0], inner[1], ps1, i*segf);
		interpPoint(inner[2], inner[3], ps2, i*segf);
		g.drawLine(ps1.x, ps1.y, ps2.x, ps2.y);
		interpPoint(inner[2], inner[3], ps1, (i+1)*segf);
		drawThickLine(g, ps1, ps2);
	    }
	}
	setVoltageColor(g, volts[0]);
	drawThickLine(g, inner[0], inner[1]);
	drawPosts(g);

	curCount1 = updateDotCount(-current1, curCount1);
	curCount2 = updateDotCount(current2, curCount2);
	if (!isCreating()) {
	    drawDots(g, posts[0], inner[0], curCount1);
	    drawDots(g, posts[2], inner[2], -curCount1);
	    drawDots(g, posts[1], inner[1], -curCount2);
	    drawDots(g, posts[3], inner[3], curCount2);
	}
    }

    int voltSource1, voltSource2;
    double current1, current2, curCount1, curCount2;
    void setVoltageSource(int n, int v) {
	if (n == 0)
	    voltSource1 = v;
	else
	    voltSource2 = v;
    }
    void setCurrent(int v, double c) {
	if (v == voltSource1)
	    current1 = c;
	else
	    current2 = c;
    }

    void stamp() {
	if (isLossy())
	    stampLossy();
	else
	    stampLossless();
    }

    void stampLossless() {
	sim.stampVoltageSource(nodes[4], nodes[0], voltSource1);
	sim.stampVoltageSource(nodes[5], nodes[1], voltSource2);
	sim.stampResistor(nodes[2], nodes[4], imped);
	sim.stampResistor(nodes[3], nodes[5], imped);
    }

    void stampLossy() {
	// Derive total L and C from delay and impedance:
	//   Z0 = sqrt(L/C), delay = sqrt(L*C)
	//   => L_total = Z0 * delay, C_total = delay / Z0
	double lTotal = imped * delay;
	double cTotal = delay / imped;
	int n = actualSegments;
	double lSeg = lTotal / n;
	double cSeg = cTotal / n;
	double rSeg = resistance / n;
	double gSeg = conductance / n;

	// Inductor companion model (trapezoidal): R_comp = 2*L/dt
	indCompR = 2 * lSeg / sim.timeStep;
	// Capacitor companion model (trapezoidal): G_comp = 2*C/dt
	capCompG = 2 * cSeg / sim.timeStep;
	// Combined series R + inductor companion resistance
	totalSeriesR = rSeg + indCompR;

	// Stamp N series R+L segments (combined companion model)
	for (int i = 0; i < n; i++) {
	    int nodeA = nodes[topNodeIndex(i)];
	    int nodeB = nodes[topNodeIndex(i + 1)];
	    sim.stampResistor(nodeA, nodeB, totalSeriesR);
	    sim.stampRightSide(nodeA);
	    sim.stampRightSide(nodeB);
	}

	// Stamp N shunt C (+G) elements at each segment endpoint
	// (L-section model: shunt after each series element)
	for (int i = 0; i < n; i++) {
	    int topNode = nodes[topNodeIndex(i + 1)];
	    int botNode = nodes[0];  // ground reference
	    // Capacitor companion conductance
	    sim.stampConductance(topNode, botNode, capCompG);
	    sim.stampRightSide(topNode);
	    sim.stampRightSide(botNode);
	    // Shunt conductance G (constant)
	    if (gSeg > 0)
		sim.stampConductance(topNode, botNode, gSeg);
	}

	// Prevent Port 1 from floating: connect to Port 0 with high impedance
	sim.stampResistor(nodes[0], nodes[1], 1e8);
    }

    void startIteration() {
	if (isLossy())
	    startIterationLossy();
	else
	    startIterationLossless();
    }

    void startIterationLossless() {
	if (voltageL == null) {
	    sim.stop("Transmission line delay too large!", this);
	    return;
	}
	voltageL[ptr] = volts[2]-volts[0] + volts[2]-volts[4];
	voltageR[ptr] = volts[3]-volts[1] + volts[3]-volts[5];
    }

    void startIterationLossy() {
	if (indCurSrc == null)
	    return;
	int n = actualSegments;

	// Update inductor companion sources: curSrc_new = 2*I_prev - curSrc_old
	for (int i = 0; i < n; i++)
	    indCurSrc[i] = 2 * indCurrent[i] - indCurSrc[i];

	// Update capacitor companion sources (trapezoidal):
	// curSrc_new = -2*V/compR - curSrc_old  (where compR = 1/capCompG)
	for (int i = 0; i < n; i++)
	    capCurSrc[i] = -2 * capVoltDiff[i] * capCompG - capCurSrc[i];
    }

    void doStep() {
	if (isLossy())
	    doStepLossy();
	else
	    doStepLossless();
    }

    void doStepLossless() {
	if (voltageL == null) {
	    sim.stop("Transmission line delay too large!", this);
	    return;
	}
	int nextPtr = (ptr + 1) % lenSteps;
	sim.updateVoltageSource(nodes[4], nodes[0], voltSource1, -voltageR[nextPtr]);
	sim.updateVoltageSource(nodes[5], nodes[1], voltSource2, -voltageL[nextPtr]);
	if (Math.abs(volts[0]) > 1e-5 || Math.abs(volts[1]) > 1e-5) {
	    sim.stop("Need to ground transmission line!", this);
	    return;
	}
    }

    void doStepLossy() {
	if (indCurSrc == null)
	    return;
	int n = actualSegments;

	// Stamp inductor companion current sources.
	// For combined R+L: I_norton = curSrc * indCompR / totalSeriesR
	for (int i = 0; i < n; i++) {
	    int nodeA = nodes[topNodeIndex(i)];
	    int nodeB = nodes[topNodeIndex(i + 1)];
	    double iNorton = indCurSrc[i] * indCompR / totalSeriesR;
	    sim.stampCurrentSource(nodeA, nodeB, iNorton);
	}

	// Stamp capacitor companion current sources
	for (int i = 0; i < n; i++) {
	    int topNode = nodes[topNodeIndex(i + 1)];
	    sim.stampCurrentSource(topNode, nodes[0], capCurSrc[i]);
	}
    }

    void stepFinished() {
	if (isLossy())
	    stepFinishedLossy();
	else
	    stepFinishedLossless();
    }

    void stepFinishedLossless() {
	if (sim.timeStepCount == lastStepCount)
	    return;
	lastStepCount = sim.timeStepCount;
	ptr = (ptr+1) % lenSteps;
    }

    void stepFinishedLossy() {
	if (indCurSrc == null)
	    return;
	int n = actualSegments;

	// Update inductor currents from new node voltages
	for (int i = 0; i < n; i++) {
	    double vA = volts[topNodeIndex(i)];
	    double vB = volts[topNodeIndex(i + 1)];
	    double voltDiff = vA - vB;
	    double iNorton = indCurSrc[i] * indCompR / totalSeriesR;
	    indCurrent[i] = voltDiff / totalSeriesR + iNorton;
	}

	// Update capacitor voltages
	for (int i = 0; i < n; i++) {
	    int topIdx = topNodeIndex(i + 1);
	    capVoltDiff[i] = volts[topIdx] - volts[0];
	}

	// Compute port currents for display
	if (n > 0) {
	    current1 = -indCurrent[0];        // into Port 2
	    current2 = -indCurrent[n - 1];    // into Port 1 (return)
	}
    }

    Point getPost(int n) {
	return posts[n];
    }

    //double getVoltageDiff() { return volts[0]; }
    boolean hasGroundConnection(int n1) { return false; }

    boolean getConnection(int n1, int n2) {
	// In lossy mode, all ports are connected via the ladder network
	if (isLossy())
	    return true;
	return false;
    }

    void getInfo(String arr[]) {
	arr[0] = isLossy() ? "lossy \"t\" line" : "\"t\" line";
	arr[1] = getUnitText(imped, Locale.ohmString);
	// use velocity factor for RG-58 cable (65%)
	arr[2] = "length = " + getUnitText(.65*2.9979e8*delay, "m");
	arr[3] = "delay = " + getUnitText(delay, "s");
	int idx = 4;
	if (resistance > 0)
	    arr[idx++] = "R = " + getUnitText(resistance, Locale.ohmString);
	if (conductance > 0)
	    arr[idx++] = "G = " + getUnitText(conductance, "S");
	if (isLossy())
	    arr[idx++] = "segments = " + actualSegments;
    }
    public EditInfo getEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("Delay (s)", delay, 0, 0);
	if (n == 1)
	    return new EditInfo("Impedance (ohms)", imped, 0, 0);
	if (n == 2)
	    return new EditInfo("Resistance (ohms)", resistance, 0, 0);
	if (n == 3)
	    return new EditInfo("Conductance (S)", conductance, 0, 0);
	return null;
    }
    public void setEditValue(int n, EditInfo ei) {
	if (n == 0 && ei.value > 0) {
	    delay = ei.value;
	    allocNodes();
	    reset();
	}
	if (n == 1 && ei.value > 0) {
	    imped = ei.value;
	    reset();
	}
	if (n == 2 && ei.value >= 0) {
	    boolean wasLossy = isLossy();
	    resistance = ei.value;
	    if (wasLossy != isLossy())
		allocNodes();
	    reset();
	}
	if (n == 3 && ei.value >= 0) {
	    boolean wasLossy = isLossy();
	    conductance = ei.value;
	    if (wasLossy != isLossy())
		allocNodes();
	    reset();
	}
    }

    double getCurrentIntoNode(int n) {
	if (n == 0)
	    return current1;
	if (n == 2)
	    return -current1;
	if (n == 3)
	    return -current2;
	return current2;
    }

    boolean canFlipX() { return dy == 0; }
    boolean canFlipY() { return dx == 0; }
}
