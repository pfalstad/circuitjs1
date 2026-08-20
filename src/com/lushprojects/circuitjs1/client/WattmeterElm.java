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

class WattmeterElm extends CircuitElm {
    int width;
    VoltageSource voltSources[];
    double currents[];
    double curcounts[];
    int meter; // 0=instantaneous, 1=average
    final int PM_INST = 0;
    final int PM_AVG = 1;
    double avgPower, totalEnergy, cycleTime, lastCycleTime;
    double runEnergy, runTime, zeroTime, peak, trough;
    boolean wasAboveMid, haveFullCycle;

    public WattmeterElm(int xx, int yy) {
	super(xx, yy);
	setup();
    }
    public WattmeterElm(int xa, int ya, int xb, int yb, int f,
	    StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	width = Integer.parseInt(st.nextToken());
	try {
	    meter = Integer.parseInt(st.nextToken());
	} catch (Exception e) {}
	setup();
    }

    void setup() {
	voltSources = new VoltageSource[2];
	currents = new double[2];
	curcounts = new double[2];
    }

    String dump() { return super.dump() + " " + width + " " + meter; }

    void dumpXml(Document doc, Element elem) {
	super.dumpXml(doc, elem);
	XMLSerializer.dumpAttr(elem, "w", width);
	XMLSerializer.dumpAttr(elem, "meter", meter);
    }
    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	width = xml.parseIntAttr("w", width);
	meter = xml.parseIntAttr("meter", meter);
	setup();
    }

    int getVoltageSourceCount() { return 2; }
    int getDumpType() { return 420; }
    int getPostCount() { return 4; }

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

    Point posts[];
    Point inner[];
    int maxTextLen;

    void setPoints() {
	super.setPoints();
	int ds = (dy == 0) ? sign(dx) : -sign(dy);
	
	// get 2 more terminals
	Point p3 = interpPoint(point1, point2, 0, -width*ds);
	Point p4 = interpPoint(point1, point2, 1, -width*ds);
	
	// get stubs
	int sep = app.gridSize;
	Point p5 = interpPoint(point1, point2,   sep/dn);
	Point p6 = interpPoint(point1, point2, 1-sep/dn);
	Point p7 = interpPoint(p3, p4,   sep/dn);
	Point p8 = interpPoint(p3, p4, 1-sep/dn);

	// we number the posts like this because we want the lower-numbered
	// points to be on the bottom, so that if some of them are unconnected
	// (which is often true) then the bottom ones will get automatically
	// attached to ground.
	posts = new Point[] { p3, p4, point1, point2 };
	inner = new Point[] { p7, p8, p5, p6 };

	// get rectangle
	Point r1 = interpPoint(point1, point2,   sep/dn, ds*sep);
	Point r2 = interpPoint(point1, point2, 1-sep/dn, ds*sep);
	Point r3 = interpPoint(point1, point2,   sep/dn, -ds*(sep+width));
	Point r4 = interpPoint(point1, point2, 1-sep/dn, -ds*(sep+width));
	rectPointsX = new int[] { r1.x, r2.x, r4.x, r3.x };
	rectPointsY = new int[] { r1.y, r2.y, r4.y, r3.y };

	center = interpPoint(r1, r4, .5);
	maxTextLen = max(abs(r1.x-r4.x)-5, 5);
    }

    int rectPointsX[], rectPointsY[];
    Point center;

    Point getPost(int n) {
	return posts[n];
    }

    void stamp() {
	// zero-valued voltage sources from 0 to 1 and 2 to 3, so we can measure current
	sim.stampVoltageSource(nodes[0], nodes[1], voltSources[0], 0);
	sim.stampVoltageSource(nodes[2], nodes[3], voltSources[1], 0);
    }

    void setVoltageSource(int j, VoltageSource vs) {
	voltSources[j] = vs;
	vs.setNodes(nodes[j*2], nodes[j*2+1]);
    }

    void stepFinished() {
	double p = getPower();
	double dt = sim.timeStep;
	cycleTime += dt;
	totalEnergy += p * dt;
	runTime += dt;
	runEnergy += p * dt;

	// Average over whole cycles, delimited by rising crossings of the long-run mean.
	// The previous code delimited them by the local extremes of the power waveform,
	// which is half a period for a sine wave, and for a waveform with a flat section -
	// such as the output of a half-wave rectifier - gives a window that falls either
	// side of the conducting part instead of spanning a period.
	double mid = runEnergy / runTime;

	// Compare against the threshold with hysteresis. While the power is constant it
	// equals its own running mean, and a bare p > mid then chatters on rounding noise
	// alone, manufacturing crossings a fraction of a timestep apart. Those leave a
	// period estimate orders of magnitude too short behind, which the timeout and the
	// zero check below would then act on.
	if (p > peak)
	    peak = p;
	if (p < trough)
	    trough = p;
	double band = (peak - trough) * .05 + Math.abs(peak) * 1e-9;
	boolean above = wasAboveMid ? p > mid - band : p > mid + band;

	if (above && !wasAboveMid) {
	    if (haveFullCycle) {
		avgPower = totalEnergy / cycleTime;
		if (Double.isNaN(avgPower))
		    avgPower = 0;
		lastCycleTime = cycleTime;
	    } else {
		// The run up to the first crossing is a partial cycle. Measuring it would
		// leave a period estimate far shorter than the real one.
		haveFullCycle = true;
	    }
	    totalEnergy = 0;
	    cycleTime = 0;
	} else if (lastCycleTime > 0 && cycleTime > lastCycleTime * 8) {
	    // the waveform stopped or changed shape; don't freeze on a stale reading
	    avgPower = totalEnergy / cycleTime;
	    if (Double.isNaN(avgPower))
		avgPower = 0;
	    totalEnergy = 0;
	    cycleTime = 0;
	}
	wasAboveMid = above;

	// Constant power never crosses its own mean, so no period is ever measured. Report
	// the running mean until one is, which is the right answer for DC anyway.
	if (lastCycleTime == 0)
	    avgPower = mid;

	// Clear the reading once the power has been off for longer than a period. The
	// previous code cleared after five zero samples, which a rectified waveform reaches
	// during every cycle; tying it to the measured period does not.
	if (p == 0) {
	    zeroTime += dt;
	    if (lastCycleTime > 0 && zeroTime > lastCycleTime * 1.5) {
		avgPower = 0;
		totalEnergy = 0;
		cycleTime = 0;
	    }
	} else {
	    zeroTime = 0;
	}
    }

    void draw(Graphics g) {
	int i;
	for (i = 0; i != 2; i++)
	    curcounts[i] = updateDotCount(currents[i], curcounts[i]);
	double flip = 1;
	for (i = 0; i != 4; i++) {
	    setVoltageColor(g, volts[i]);
	    drawThickLine(g, posts[i], inner[i]);
	    drawDots(g, posts[i], inner[i], curcounts[i/2]*flip);
	    flip *= -1;
	}

        g.setColor(needsHighlight() ? selectColor : lightGrayColor);
	drawThickPolygon(g, rectPointsX, rectPointsY, 4);

	setBbox(posts[0].x, posts[0].y, posts[3].x, posts[3].y);
	drawPosts(g);

	String str;
	switch (meter) {
	case PM_AVG:  str = getUnitText(avgPower, "W(avg)"); break;
	default:      str = getUnitText(getPower(), "W"); break;
	}
	g.save();
	int fsize = 15;
	int w;
	// adjust font size to fit
	while (true) {
	    g.setFont(new Font("SansSerif", 0, fsize));
	    w=(int)g.context.measureText(str).getWidth();
	    if (w < maxTextLen)
		break;
	    fsize--;
	}
	g.setColor(whiteColor);
	g.context.setTextBaseline("middle");
	g.drawString(str, center.x-w/2, center.y);
	g.restore();
    }

    double getPower() { return getVoltageDiff()*getCurrent(); }

    void setCurrent(VoltageSource vs, double c) {
	currents[vs == voltSources[0] ? 0 : 1] = c;
    }
    double getCurrentIntoNode(int n) {
	if (n % 2 == 0)
	    return -currents[n/2];
	else
	    return currents[n/2];
    }

    boolean getConnection(int n1, int n2) { return (n1/2) == (n2/2); }
    boolean hasGroundConnection(int n1) { return false; }

    void getInfo(String arr[]) {
	arr[0] = "wattmeter (old)";
	getBasicInfo(arr);
	arr[3] = "P = " + getUnitText(getPower(), "W");
	if (meter == PM_AVG)
	    arr[4] = "Pavg = " + getUnitText(avgPower, "W");
    }
    boolean canViewInScope() { return true; }
    double getCurrent() { return currents[1]; }
    double getVoltageDiff() { return volts[2]-volts[0]; }
    boolean canFlipX() { return false; }
    boolean canFlipY() { return false; }

    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("Value", 0, -1, -1);
	    ei.choice = new Choice();
	    ei.choice.add("Instantaneous");
	    ei.choice.add("Average");
	    ei.choice.select(meter);
	    return ei;
	}
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {
	if (n == 0)
	    meter = ei.choice.getSelectedIndex();
    }
}
