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

package com.falstad.afilter.client;

import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;
//import java.awt.*;
//import java.util.StringTokenizer;

class ProbeElm extends CircuitElm {
    static final int FLAG_SHOWVOLTAGE = 1;
    // optional name, drawn next to the reading and usable as v(name) in a controlled source
    String label = "";
    public ProbeElm(int xx, int yy) { super(xx, yy); }
    public ProbeElm(int xa, int ya, int xb, int yb, int f,
		    StringTokenizer st) {
	super(xa, ya, xb, yb, f);
    }
    int getDumpType() { return 'p'; }
    void dumpXml(Document doc, Element elem) {
	super.dumpXml(doc, elem);
	if (label.length() > 0)
	    XMLSerializer.dumpAttr(elem, "lb", label);
    }
    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	label = xml.parseStringAttr("lb", "");
    }
    String getExprRefName() { return label.length() > 0 ? label : null; }
	
    Point center;
    void setPoints() {
	super.setPoints();
	// swap points so that we subtract higher from lower
	if (point2.y < point1.y) {
	    Point x = point1;
	    point1 = point2;
	    point2 = x;
	}
	center = interpPoint(point1, point2, .5);
    }
    void draw(Graphics g) {
	int hs = 8;
	setBbox(point1, point2, hs);
	boolean selected = (needsHighlight() || sim.plotYElm == this);
	double len = (selected || sim.dragElm == this) ? 16 : dn-32;
	calcLeads((int) len);
	setVoltageColor(g, volts[0]);
	if (selected)
	    g.setColor(selectColor);
	drawThickLine(g, point1, lead1);
	setVoltageColor(g, volts[1]);
	if (selected)
	    g.setColor(selectColor);
	drawThickLine(g, lead2, point2);
	Font f = new Font("SansSerif", Font.BOLD, 14);
	g.setFont(f);
	if (this == sim.plotXElm)
	    drawCenteredText(g, "X", center.x, center.y, true);
	if (this == sim.plotYElm)
	    drawCenteredText(g, "Y", center.x, center.y, true);
	if (mustShowVoltage()) {
	    String s = getVoltageText(getVoltageDiff());
	    if (label.length() > 0)
		s = label + " " + s;
	    drawValues(g, s, 4);
	} else if (label.length() > 0)
	    drawValues(g, label, 4);
	drawPosts(g);
    }
	
    boolean mustShowVoltage() {
	return (flags & FLAG_SHOWVOLTAGE) != 0;
    }

    void getInfo(String arr[]) {
	arr[0] = "scope probe";
	if (label.length() > 0)
	    arr[0] += " (" + label + ")";
	arr[1] = "Vd = " + getVoltageText(getVoltageDiff());
    }
    boolean getConnection(int n1, int n2) { return false; }

	public EditInfo getEditInfo(int n) {
	    if (n == 0) {
		EditInfo ei = new EditInfo("", 0, -1, -1);
		ei.checkbox = new Checkbox("Show Voltage", mustShowVoltage());
		return ei;
	    }
	    if (n == 1) {
		EditInfo ei = new EditInfo("Name (for controlled sources)", 0, -1, -1);
		ei.text = label;
		return ei;
	    }
	    return null;
	}
	public void setEditValue(int n, EditInfo ei) {
	    if (n == 0) {
		if (ei.checkbox.getState())
		    flags = FLAG_SHOWVOLTAGE;
		else
		    flags &= ~FLAG_SHOWVOLTAGE;
	    }
	    if (n == 1)
		label = ei.textf.getText().trim();
	}
}

