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

class GyratorElm extends CircuitElm {
    double gyrResistance;
    Point ptEnds[], ptCoil[], ptCore[];
    double current[];
    double curcount[];
    int width, flip;
    public static final int FLAG_VERTICAL = 8;
    public static final int FLAG_FLIP = 16;

    public GyratorElm(int xx, int yy) {
	super(xx, yy);
	gyrResistance = 1000;
	width = 32;
	noDiagonal = true;
	current = new double[2];
	curcount = new double[2];
    }

    public GyratorElm(int xa, int ya, int xb, int yb, int f,
		      StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	if (hasFlag(FLAG_VERTICAL))
	    width = -max(32, abs(xb-xa));
	else
	    width = max(32, abs(yb-ya));
	gyrResistance = new Double(st.nextToken()).doubleValue();
	current = new double[2];
	curcount = new double[2];
	try {
	    current[0] = new Double(st.nextToken()).doubleValue();
	    current[1] = new Double(st.nextToken()).doubleValue();
	} catch (Exception e) {}
	noDiagonal = true;
    }

    void drag(int xx, int yy) {
	xx = snapGrid(xx);
	yy = snapGrid(yy);
	if (abs(xx-x) > abs(yy-y))
	    flags &= ~FLAG_VERTICAL;
	else
	    flags |= FLAG_VERTICAL;
	if (hasFlag(FLAG_VERTICAL))
	    width = -max(32, abs(xx-x));
	else
	    width = max(32, abs(yy-y));
	if (xx == x)
	    yy = y;
	x2 = xx; y2 = yy;
	setPoints();
    }

    int getDumpType() { return 433; }

    String dump() {
	return super.dump() + " " + gyrResistance + " " +
	    current[0] + " " + current[1];
    }

    void draw(Graphics g) {
	int i;
	for (i = 0; i != 4; i++) {
	    setVoltageColor(g, volts[i]);
	    drawThickLine(g, ptEnds[i], ptCoil[i]);
	}
	// draw two boxes for the two ports
	for (i = 0; i != 2; i++) {
	    setPowerColor(g, current[i]*(volts[i]-volts[i+2]));
	    drawThickLine(g, ptCoil[i], ptCoil[i+2]);
	}
	// draw core lines
	g.setColor(needsHighlight() ? selectColor : lightGrayColor);
	for (i = 0; i != 2; i++) {
	    drawThickLine(g, ptCore[i], ptCore[i+2]);
	    curcount[i] = updateDotCount(current[i], curcount[i]);
	}
	for (i = 0; i != 2; i++) {
	    drawDots(g, ptEnds[i], ptCoil[i], curcount[i]);
	    drawDots(g, ptCoil[i], ptCoil[i+2], curcount[i]);
	    drawDots(g, ptEnds[i+2], ptCoil[i+2], -curcount[i]);
	}

	drawPosts(g);
	setBbox(ptEnds[0], ptEnds[3], 0);
    }

    void setPoints() {
	super.setPoints();
	if (hasFlag(FLAG_VERTICAL))
	    point2.x = point1.x;
	else
	    point2.y = point1.y;
	ptEnds = newPointArray(4);
	ptCoil = newPointArray(4);
	ptCore = newPointArray(4);
	ptEnds[0] = point1;
	ptEnds[1] = point2;
	flip = hasFlag(FLAG_FLIP) ? -1 : 1;
	interpPoint(point1, point2, ptEnds[2], 0, -dsign*width*flip);
	interpPoint(point1, point2, ptEnds[3], 1, -dsign*width*flip);
	double ce = .5-12/dn;
	double cd = .5-2/dn;
	int i;
	for (i = 0; i != 4; i += 2) {
	    interpPoint(ptEnds[i], ptEnds[i+1], ptCoil[i],   ce);
	    interpPoint(ptEnds[i], ptEnds[i+1], ptCoil[i+1], 1-ce);
	    interpPoint(ptEnds[i], ptEnds[i+1], ptCore[i],   cd);
	    interpPoint(ptEnds[i], ptEnds[i+1], ptCore[i+1], 1-cd);
	}
    }

    Point getPost(int n) {
	return ptEnds[n];
    }

    int getPostCount() { return 4; }

    void reset() {
	current[0] = current[1] = volts[0] = volts[1] = volts[2] = volts[3] = 0;
	curcount[0] = curcount[1] = 0;
    }

    // Gyrator equations (admittance form):
    //   I1 = G * V2   (current into port 1 = conductance * voltage across port 2)
    //   I2 = -G * V1  (current into port 2 = -conductance * voltage across port 1)
    // where G = 1/R (gyration conductance)
    //
    // This is a linear, memoryless element -- no time-stepping needed.
    void stamp() {
	double g = 1.0 / gyrResistance;
	// port 1 (nodes 0,2): current proportional to port 2 voltage (nodes 1,3)
	sim.stampVCCurrentSource(nodes[0], nodes[2], nodes[1], nodes[3], g);
	// port 2 (nodes 1,3): current proportional to -port 1 voltage (nodes 0,2)
	sim.stampVCCurrentSource(nodes[1], nodes[3], nodes[0], nodes[2], -g);
    }

    void calculateCurrent() {
	double g = 1.0 / gyrResistance;
	double v1 = volts[0] - volts[2];
	double v2 = volts[1] - volts[3];
	current[0] = g * v2;
	current[1] = -g * v1;
    }

    @Override double getCurrentIntoNode(int n) {
	if (n < 2)
	    return -current[n];
	return current[n-2];
    }

    boolean getConnection(int n1, int n2) {
	// port 1 terminals connect to each other, port 2 terminals connect to each other
	// but port 1 and port 2 are not directly connected (coupled via VCCS)
	if (comparePair(n1, n2, 0, 2))
	    return true;
	if (comparePair(n1, n2, 1, 3))
	    return true;
	return false;
    }

    void getInfo(String arr[]) {
	arr[0] = "gyrator";
	arr[1] = "R = " + getUnitText(gyrResistance, "\u2126");
	arr[2] = "Vd1 = " + getVoltageText(volts[0]-volts[2]);
	arr[3] = "Vd2 = " + getVoltageText(volts[1]-volts[3]);
	arr[4] = "I1 = " + getCurrentText(current[0]);
	arr[5] = "I2 = " + getCurrentText(current[1]);
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("Gyration Resistance (\u2126)", gyrResistance, 1, 0);
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {
	if (n == 0 && ei.value > 0)
	    gyrResistance = ei.value;
    }

    void flipX(int c2, int count) {
	if (hasFlag(FLAG_VERTICAL))
	    flags ^= FLAG_FLIP;
	super.flipX(c2, count);
    }

    void flipY(int c2, int count) {
	if (!hasFlag(FLAG_VERTICAL))
	    flags ^= FLAG_FLIP;
	super.flipY(c2, count);
    }

    void flipXY(int xmy, int count) {
	flags ^= FLAG_VERTICAL;
	width *= -1;
	super.flipXY(xmy, count);
    }
}
