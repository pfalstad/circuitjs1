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

// Base for the two-terminal controlled sources drawn with the usual diamond symbol,
// ported from the ts version.
//
// The ts version takes an arbitrary expression.  Here the output is just a constant
// times one control quantity, which keeps the source linear so it can be stamped
// directly (and included in the transfer function).  The control is referred to by
// name: v(name) is the voltage of a labeled node or across a named scope probe, and
// i(name) is the current through a named ammeter.
//
// The control is saved in the same "ex" attribute as the ts version, as gain*v(name)
// or gain*i(name), so files are compatible as long as they use that form.  Any other
// expression is kept as-is (so saving doesn't destroy it) but the output is zero.
abstract class ControlledSourceElm extends CircuitElm {
    static final int diamondSize = 18;

    double gain;
    boolean currentControl;
    String refName;
    String exprString;
    boolean exprOk;

    ControlledSourceElm(int xx, int yy) {
	super(xx, yy);
	setExpr(getDefaultExpr());
    }
    ControlledSourceElm(int xa, int ya, int xb, int yb, int f,
			StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	setExpr(getDefaultExpr());
    }

    abstract String getDefaultExpr();
    abstract String getElmType();

    void dumpXml(Document doc, Element elem) {
	super.dumpXml(doc, elem);
	XMLSerializer.dumpAttr(elem, "ex", exprString);
    }
    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	setExpr(xml.parseStringAttr("ex", exprString));
    }

    // parse gain*v(name), v(name)*gain, v(name), -v(name), and the same with i()
    void setExpr(String s) {
	exprString = s;
	exprOk = false;
	String e = s.replace(" ", "");
	int vi = e.indexOf("v(");
	int ii = e.indexOf("i(");
	int ix = (vi >= 0 && (ii < 0 || vi < ii)) ? vi : ii;
	if (ix < 0)
	    return;
	int close = e.indexOf(')', ix);
	if (close < 0)
	    return;
	String name = e.substring(ix+2, close);
	if (name.length() == 0 || name.indexOf('(') >= 0)
	    return;
	String pre = e.substring(0, ix);
	String post = e.substring(close+1);
	double k = 1;
	try {
	    if (pre.equals("-"))
		k = -1;
	    else if (pre.equals("+"))
		k = 1;
	    else if (pre.length() > 0) {
		if (!pre.endsWith("*"))
		    return;
		k = Double.parseDouble(pre.substring(0, pre.length()-1));
	    }
	    if (post.length() > 0) {
		if (!post.startsWith("*"))
		    return;
		k *= Double.parseDouble(post.substring(1));
	    }
	} catch (Exception ex) {
	    return;
	}
	gain = k;
	currentControl = (ix == ii);
	refName = name;
	exprOk = true;
    }

    void updateExpr() {
	String s = (currentControl ? "i(" : "v(") + refName + ")";
	if (gain == -1)
	    s = "-" + s;
	else if (gain != 1)
	    s = gain + "*" + s;
	exprString = s;
	exprOk = true;
    }

    // what the control resolved to, set by resolve()
    int refPos, refNeg, refVS;
    CircuitElm refElm;

    // find the control quantity by name.  returns false if it can't be found.
    // a labeled node wins over an element with the same name.
    boolean resolve() {
	refElm = null;
	refPos = refNeg = 0;
	refVS = -1;
	if (!exprOk)
	    return false;
	int i;
	if (!currentControl && LabeledNodeElm.nodeList != null) {
	    Integer nn = LabeledNodeElm.nodeList.get(refName);
	    if (nn != null) {
		refPos = nn.intValue();
		for (i = 0; i != sim.elmList.size(); i++) {
		    CircuitElm ce = sim.getElm(i);
		    if (ce instanceof LabeledNodeElm && refName.equals(((LabeledNodeElm) ce).text)) {
			refElm = ce;
			break;
		    }
		}
		return true;
	    }
	}
	for (i = 0; i != sim.elmList.size(); i++) {
	    CircuitElm ce = sim.getElm(i);
	    if (ce != this && refName.equals(ce.getExprRefName())) {
		refElm = ce;
		break;
	    }
	}
	if (refElm == null || refElm.getPostCount() < 2) {
	    refElm = null;
	    return false;
	}
	if (currentControl) {
	    // need a voltage source to measure current through
	    if (refElm.getVoltageSourceCount() == 0) {
		refElm = null;
		return false;
	    }
	    refVS = refElm.getVoltageSource();
	} else {
	    refPos = refElm.getNode(0);
	    refNeg = refElm.getNode(1);
	}
	return true;
    }

    // value of the control quantity from the last solve, for display (real, imaginary)
    double getControlValue(boolean imag) {
	if (refElm == null)
	    return 0;
	if (currentControl)
	    return imag ? refElm.currenti : refElm.current;
	if (refElm instanceof LabeledNodeElm)
	    return imag ? refElm.voltsi[0] : refElm.volts[0];
	return imag ? refElm.voltsi[0]-refElm.voltsi[1] : refElm.volts[0]-refElm.volts[1];
    }

    Point center, side1, side2;

    // the diamond's long diagonal runs along the element; the leads meet its two tips
    void setPoints() {
	super.setPoints();
	calcLeads(diamondSize*2);
	center = interpPoint(point1, point2, .5);
	side1  = interpPoint(point1, point2, .5,  diamondSize);
	side2  = interpPoint(point1, point2, .5, -diamondSize);
    }

    void drawDiamond(Graphics g) {
	drawThickLine(g, lead1, side1);
	drawThickLine(g, side1, lead2);
	drawThickLine(g, lead2, side2);
	drawThickLine(g, side2, lead1);
    }

    double getVoltageDiff() { return volts[1] - volts[0]; }

    String getControlText() {
	if (!exprOk)
	    return exprString + " (unsupported expression)";
	String s = exprString;
	if (refElm == null && !resolve())
	    s += " (unresolved: " + refName + ")";
	return s;
    }

    void getInfo(String arr[]) {
	arr[0] = getElmType();
	arr[1] = getControlText();
	arr[2] = "V = " + getVoltageText(getVoltageDiff());
	arr[3] = "I = " + getCurrentText(getCurrent());
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("Control", 0, -1, -1);
	    ei.choice = new Choice();
	    ei.choice.add("Voltage, v(name)");
	    ei.choice.add("Current, i(name)");
	    ei.choice.select(currentControl ? 1 : 0);
	    return ei;
	}
	if (n == 1) {
	    EditInfo ei = new EditInfo("Name (labeled node, scope probe, or ammeter)", 0, -1, -1);
	    ei.text = refName;
	    return ei;
	}
	if (n == 2)
	    return new EditInfo("Gain", gain, 0, 0).setDimensionless();
	return null;
    }
    public void setEditValue(int n, EditInfo ei) {
	if (n == 0)
	    currentControl = ei.choice.getSelectedIndex() == 1;
	if (n == 1)
	    refName = ei.textf.getText().trim();
	if (n == 2)
	    gain = ei.value;
	updateExpr();
    }
}
