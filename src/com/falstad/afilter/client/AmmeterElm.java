/*    
    Copyright (C) Paul Falstad
    
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

// ammeter: a 0V voltage source, so we can measure the current through it.
// ported from the ts version, without the meter modes (rms etc.) that
// don't apply to AC analysis.
class AmmeterElm extends CircuitElm {
    static final int FLAG_SHOWCURRENT = 1;
    final int circleSize = 12;

    // optional name, drawn next to the reading and usable as i(name) in a controlled source
    String label = "";

    public AmmeterElm(int xx, int yy) {
	super(xx, yy);
	flags = FLAG_SHOWCURRENT;
    }
    public AmmeterElm(int xa, int ya, int xb, int yb, int f,
		      StringTokenizer st) {
	super(xa, ya, xb, yb, f);
    }
    int getDumpType() { return 370; }

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

    Point center, plusPoint;
    void setPoints() {
	super.setPoints();
	center = interpPoint(point1, point2, .5);
	calcLeads(circleSize*2);
	plusPoint = interpPoint(point1, point2, (dn/2-circleSize-4)/dn, -10*dsign);
    }

    void draw(Graphics g) {
	setBbox(point1, point2, circleSize);
	draw2Leads(g);
	g.setColor(needsHighlight() ? selectColor : lightGrayColor);
	drawThickCircle(g, center.x, center.y, circleSize);
	g.setFont(new Font("SansSerif", Font.BOLD, 12));
	drawCenteredText(g, "A", center.x, center.y, true);

	// current is measured from post 1 to post 2; mark post 1 with a +
	g.setColor(whiteColor);
	g.setFont(unitsFont);
	drawCenteredText(g, "+", plusPoint.x, plusPoint.y, true);

	doDots(g);
	String s = null;
	if (mustShowCurrent())
	    s = getCurrentText(getCurrent());
	if (label.length() > 0)
	    s = (s == null) ? label : label + " " + s;
	drawValues(g, s, circleSize);
	drawPosts(g);
    }

    boolean mustShowCurrent() { return (flags & FLAG_SHOWCURRENT) != 0; }

    void stamp() {
	sim.stampVoltageSource(nodes[0], nodes[1], voltSource, 0);
    }
    void polyStamp() {
	sim.stampPolyVoltageSource(nodes[0], nodes[1], voltSource, 0);
    }
    int getVoltageSourceCount() { return 1; }

    void getInfo(String arr[]) {
	arr[0] = "ammeter";
	if (label.length() > 0)
	    arr[0] += " (" + label + ")";
	arr[1] = "I = " + getCurrentText(getCurrent());
	if (sim.animateFreq > 0)
	    arr[2] = getPeakIText(current, currenti);
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox = new Checkbox("Show Current", mustShowCurrent());
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
		flags |= FLAG_SHOWCURRENT;
	    else
		flags &= ~FLAG_SHOWCURRENT;
	}
	if (n == 1)
	    label = ei.textf.getText().trim();
    }
}
