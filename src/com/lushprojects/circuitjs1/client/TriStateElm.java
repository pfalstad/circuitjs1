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

// contributed by Edward Calver

class TriStateElm extends CircuitElm {
    double resistance, r_on, r_off, r_off_ground, highVoltage;
    int busWidth = 1;
    VoltageSource voltageSources[];

    // Unfortunately we need all three flags to keep track of flipping.
    // FLAG_FLIP_X/Y affect the rounding direction if the elm is an odd grid length.
    // FLAG_FLIP does not.
    final int FLAG_FLIP = 1;
    final int FLAG_FLIP_X = 2;
    final int FLAG_FLIP_Y = 4;

    public TriStateElm(int xx, int yy) {
	super(xx, yy);
	r_on = 0.1;
	r_off = 1e10;
	r_off_ground = 1e8;
	noDiagonal = true;

        // copy defaults from last gate edited
        highVoltage = GateElm.lastHighVoltage;
    }

    public TriStateElm(int xa, int ya, int xb, int yb, int f, StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	r_on = 0.1;
	r_off = 1e10;
	r_off_ground = 0;
	noDiagonal = true;
	highVoltage = 5;
	try {
	    r_on = new Double(st.nextToken()).doubleValue();
	    r_off = new Double(st.nextToken()).doubleValue();
	    r_off_ground = new Double(st.nextToken()).doubleValue();
            highVoltage = new Double (st.nextToken()).doubleValue();
	} catch (Exception e) {
	}

    }

    String dump() {
	return super.dump() + " " + r_on + " " + r_off + " " + r_off_ground + " " + highVoltage;
    }

    void dumpXml(Document doc, Element elem) {
        super.dumpXml(doc, elem);
        XMLSerializer.dumpAttr(elem, "ron", r_on);
        XMLSerializer.dumpAttr(elem, "roff", r_off);
        XMLSerializer.dumpAttr(elem, "rog", r_off_ground);
        XMLSerializer.dumpAttr(elem, "hi", highVoltage);
	if (busWidth != 1)
	    XMLSerializer.dumpAttr(elem, "bw", busWidth);
    }

    void undumpXml(XMLDeserializer xml) {
        super.undumpXml(xml);
        r_on = xml.parseDoubleAttr("ron", r_on);
        r_off = xml.parseDoubleAttr("roff", r_off);
        r_off_ground = xml.parseDoubleAttr("rog", r_off_ground);
        highVoltage = xml.parseDoubleAttr("hi", highVoltage);
	busWidth = xml.parseIntAttr("bw", 1);
    }

    int getDumpType() { return 180; }
    String getXmlDumpType() { return "ts"; }
    void setHighVoltage(double hv) { highVoltage = hv; }

    boolean open;

    Point ps, point3, lead3, busLead1;

    Polygon gatePoly;

    void setPoints() {
	super.setPoints();
	int len = 32;
	calcLeads(len);
	adjustLeadsToGrid((flags & FLAG_FLIP_X) != 0, (flags & FLAG_FLIP_Y) != 0);

	ps = new Point();
	int hs = 16;

	int ww = 16;
	if (ww > dn / 2)
	    ww = (int) (dn / 2);
	Point triPoints[] = newPointArray(3);
	interpPoint2(lead1, lead2, triPoints[0], triPoints[1], 0, hs + 2);
	triPoints[2] = interpPoint(lead1, lead2, .5 + (ww - 2) / (double)len);
	gatePoly = createPolygon(triPoints);

	// busLead1 is lead1 pulled back slightly so thick bus line doesn't bleed into triangle
	busLead1 = interpPoint(point1, lead1, 1 - 2 / dn);

	int sign = ((flags & FLAG_FLIP) == 0) ? -1 : 1;
	point3 = interpPoint(lead1, lead2, .5, sign*hs);
	lead3 = interpPoint(lead1, lead2, .5, sign*(hs/2 + 2));
    }

    void draw(Graphics g) {
	int hs = 16;
	setBbox(point1, point2, hs);

	// draw control lead underneath the triangle
	setVoltageColor(g, volts[2 * busWidth]);
	drawThickLine(g, point3, lead3);

	// draw leads with bus thickness if bus mode
	if (busWidth > 1) {
	    setVoltageColor(g, volts[0]);
	    drawThickLine(g, point1, busLead1, 5);
	    setVoltageColor(g, volts[busWidth]);
	    drawThickLine(g, lead2, point2, 5);
	} else {
	    draw2Leads(g);
	}

	g.setColor(lightGrayColor);
	drawThickPolygon(g, gatePoly);
	curcount = updateDotCount(current, curcount);
	drawDots(g, lead2, point2, curcount);
	drawPosts(g);
    }

    // node layout:
    // nodes[0..busWidth-1]: input bus
    // nodes[busWidth..2*busWidth-1]: output bus
    // nodes[2*busWidth]: control
    // nodes[2*busWidth+1..3*busWidth]: internal nodes (one per bit)

    int controlNode() { return 2 * busWidth; }
    int internalNode(int bit) { return 2 * busWidth + 1 + bit; }

    void calculateCurrent() {
	current = 0;
	for (int i = 0; i < busWidth; i++) {
	    int intNode = internalNode(i);
	    int outNode = busWidth + i;
	    double current31 = (volts[intNode] - volts[outNode]) / resistance;
	    double current10 = (r_off_ground == 0) ? 0 : volts[outNode] / r_off_ground;
	    current += current31 - current10;
	}
    }

    double getCurrentIntoNode(int n) {
	if (n >= busWidth && n < 2 * busWidth)
	    return current / busWidth;
	return 0;
    }

    // we need this to be able to change the matrix for each step
    boolean nonLinear() {
	return true;
    }

    void stamp() {
	for (int i = 0; i < busWidth; i++) {
	    sim.stampVoltageSource(CircuitNode.ground, nodes[internalNode(i)], voltageSources[i]);
	    sim.stampNonLinear(nodes[internalNode(i)]);
	    sim.stampNonLinear(nodes[busWidth + i]);
	}
    }

    void doStep() {
	open = (volts[controlNode()] < highVoltage * .5);
	resistance = (open) ? r_off : r_on;
	for (int i = 0; i < busWidth; i++) {
	    int intNode = internalNode(i);
	    int outNode = busWidth + i;
	    int inNode = i;
	    sim.stampResistor(nodes[intNode], nodes[outNode], resistance);

	    if (r_off_ground > 0)
		sim.stampResistor(nodes[outNode], CircuitNode.ground, r_off_ground);

	    sim.updateVoltageSource(CircuitNode.ground, nodes[intNode], voltageSources[i],
		volts[inNode] > highVoltage * .5 ? highVoltage : 0);
	}
    }

    void drag(int xx, int yy) {
	// use mouse to select which side the buffer enable should be on
	boolean flip = (xx < x) == (yy < y);

	xx = snapGrid(xx);
	yy = snapGrid(yy);
	if (abs(x - xx) < abs(y - yy))
	    xx = x;
	else {
	    flip = !flip;
	    yy = y;
	}
	flags = flip ? (flags | FLAG_FLIP) : (flags & ~FLAG_FLIP);
	super.drag(xx, yy);
    }

    // posts: busWidth inputs + busWidth outputs + 1 control
    int getPostCount() {
	return 2 * busWidth + 1;
    }

    int getInternalNodeCount() {
	return busWidth;
    }

    int getVoltageSourceCount() {
	return busWidth;
    }

    void setVoltageSource(int n, VoltageSource v) {
	if (voltageSources == null || voltageSources.length != busWidth)
	    voltageSources = new VoltageSource[busWidth];
	voltageSources[n] = v;
	v.setNodes(CircuitNode.ground, nodes[internalNode(n)]);
    }

    boolean getMatrixConnection(int n1, int n2) {
	// each internal node connects to its corresponding output node
	for (int i = 0; i < busWidth; i++)
	    if (comparePair(n1, n2, busWidth + i, internalNode(i)))
		return true;
	return false;
    }

    Point getPost(int n) {
	if (n < busWidth)
	    return (busWidth > 1) ? new Point(point1.x, point1.y, n) : point1;
	if (n < 2 * busWidth)
	    return (busWidth > 1) ? new Point(point2.x, point2.y, n - busWidth) : point2;
	return point3;
    }

    int getPostWidth(int n) {
	if (n < 2 * busWidth)
	    return busWidth;
	return 1;
    }

    void getInfo(String arr[]) {
	arr[0] = "tri-state buffer";
	if (busWidth > 1)
	    arr[0] += " (" + busWidth + ")";
	arr[1] = open ? "open" : "closed";
	arr[2] = "Vd = " + getVoltageDText(getVoltageDiff());
	arr[3] = "I = " + getCurrentDText(getCurrent());
	arr[4] = "Vc = " + getVoltageText(volts[controlNode()]);
    }

    // there is no current path through the input, but there
    // is an indirect path through the output to ground.
    boolean getConnection(int n1, int n2) {
	return false;
    }

    boolean hasGroundConnection(int n1) {
	return (n1 >= busWidth && n1 < 2 * busWidth);
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("On Resistance (ohms)", r_on, 0, 0).setPositive();
	if (n == 1)
	    return new EditInfo("Off Resistance (ohms)", r_off, 0, 0).setPositive();
	if (n == 2)
	    return new EditInfo("Output Pulldown Resistance (ohms)", r_off_ground, 0, 0).setPositive();
        if (n == 3)
            return new EditInfo("High Logic Voltage", highVoltage, 1, 10);
	if (n == 4)
	    return new EditInfo("Bus Width", busWidth, 1, 32).setDimensionless();
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {

	if (n == 0 && ei.value > 0)
	    r_on = ei.value;
	if (n == 1 && ei.value > 0)
	    r_off = ei.value;
	if (n == 2 && ei.value > 0)
	    r_off_ground = ei.value;
	if (n == 3)
            highVoltage = GateElm.lastHighVoltage = ei.value;
	if (n == 4) {
	    if (ei.value >= 1) {
		busWidth = (int) ei.value;
		allocNodes();
	    } else
		ei.setError("must be >= 1");
	}
    }

    void flipX(int c2, int count) {
	flags ^= FLAG_FLIP|FLAG_FLIP_X;
	super.flipX(c2, count);
    }

    void flipY(int c2, int count) {
	flags ^= FLAG_FLIP|FLAG_FLIP_Y;
	super.flipY(c2, count);
    }

    void flipXY(int c2, int count) {
	flags ^= FLAG_FLIP;
	super.flipXY(c2, count);
    }
}
