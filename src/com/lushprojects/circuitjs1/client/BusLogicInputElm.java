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

class BusLogicInputElm extends CircuitElm {
    int busWidth = 4;
    int value = 0;
    double hiV = 5, loV = 0;
    VoltageSource voltageSources[];

    public BusLogicInputElm(int xx, int yy) {
	super(xx, yy);
    }
    public BusLogicInputElm(int xa, int ya, int xb, int yb, int f,
			    StringTokenizer st) {
	super(xa, ya, xb, yb, f);
    }

    void dumpXml(Document doc, Element elem) {
	super.dumpXml(doc, elem);
	XMLSerializer.dumpAttr(elem, "bw", busWidth);
	if (value != 0)
	    XMLSerializer.dumpAttr(elem, "va", value);
	if (hiV != 5)
	    XMLSerializer.dumpAttr(elem, "hi", hiV);
	if (loV != 0)
	    XMLSerializer.dumpAttr(elem, "lo", loV);
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	busWidth = xml.parseIntAttr("bw", busWidth);
	value = xml.parseIntAttr("va", 0);
	hiV = xml.parseDoubleAttr("hi", hiV);
	loV = xml.parseDoubleAttr("lo", loV);
    }

    int getPostCount() { return busWidth; }
    int getPostWidth(int n) { return busWidth; }
    int getVoltageSourceCount() { return busWidth; }

    Point getPost(int n) {
	return new Point(x, y, n);
    }

    void setVoltageSource(int n, VoltageSource v) {
	if (voltageSources == null || voltageSources.length != busWidth)
	    voltageSources = new VoltageSource[busWidth];
	voltageSources[n] = v;
    }

    void setCurrent(VoltageSource vs, double c) {
	// find which voltage source this is
	for (int i = 0; i < busWidth; i++)
	    if (voltageSources[i] == vs) {
		current = c;  // just track total for display
		break;
	    }
    }

    void setPoints() {
	super.setPoints();
	lead1 = interpPoint(point1, point2, 1 - 12 / dn);
    }

    void draw(Graphics g) {
	g.save();
	Font f = new Font("SansSerif", Font.BOLD, 20);
	g.setFont(f);
	g.setColor(needsHighlight() ? selectColor : whiteColor);
	String s = "" + value;
	setBbox(point1, lead1, 0);
	drawCenteredText(g, s, x2, y2, true);
	setVoltageColor(g, volts[0]);
	drawThickLine(g, point1, lead1, 5);
	drawPosts(g);
	g.restore();
    }

    void stamp() {
	for (int i = 0; i < busWidth; i++) {
	    double v = ((value & (1 << i)) != 0) ? hiV : loV;
	    sim.stampVoltageSource(CircuitNode.ground, nodes[i], voltageSources[i], v);
	}
    }

    void calculateCurrent() {}
    boolean hasGroundConnection(int n) { return true; }

    int getDumpType() { return 434; }
    String getXmlDumpType() { return "bli"; }

    void getInfo(String arr[]) {
	arr[0] = "bus input (" + busWidth + ")";
	arr[1] = "value = " + value;
	arr[2] = "hex = 0x" + Integer.toHexString(value).toUpperCase();
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("Bus Width", busWidth, 2, 32).setDimensionless();
	if (n == 1)
	    return new EditInfo("Value", value).setDimensionless();
	if (n == 2)
	    return new EditInfo("High Voltage", hiV);
	if (n == 3)
	    return new EditInfo("Low Voltage", loV);
	return null;
    }
    public void setEditValue(int n, EditInfo ei) {
	if (n == 0 && ei.value >= 2) {
	    busWidth = (int) ei.value;
	    allocNodes();
	}
	if (n == 1)
	    value = (int) ei.value;
	if (n == 2)
	    hiV = ei.value;
	if (n == 3)
	    loV = ei.value;
    }
}
