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

import java.util.Vector;
import com.google.gwt.user.client.ui.TextArea;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;

class InstructionDisplayElm extends CircuitElm {
    int busWidth = 4;
    double threshold = 2.5;
    String lookupText;
    Vector<LookupEntry> entries = new Vector<LookupEntry>();

    public InstructionDisplayElm(int xx, int yy) {
	super(xx, yy);
	lookupText = "0=text0\n1=text1\n0x2-0xF=other ({a})\n";
	parseEntries();
    }

    String getXmlDumpType() { return "ins"; }
    int getPostCount() { return busWidth; }
    int getPostWidth(int n) { return busWidth; }
    int getNumHandles() { return 1; }
    int getVoltageSourceCount() { return 0; }

    void dumpXml(Document doc, Element elem) {
	super.dumpXml(doc, elem);
	XMLSerializer.dumpAttr(elem, "bw", busWidth);
	if (threshold != 2.5)
	    XMLSerializer.dumpAttr(elem, "th", threshold);
	if (lookupText != null && lookupText.length() > 0)
	    elem.appendChild(doc.createTextNode(lookupText));
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	busWidth = xml.parseIntAttr("bw", busWidth);
	threshold = xml.parseDoubleAttr("th", threshold);
	lookupText = "";
	try {
	    lookupText = xml.parseContents();
	} catch (Exception e) {
	    CirSim.console("exception in undump " + e);
	}
	CirSim.console("lookupText: " + lookupText);
	if (lookupText == null)
	    lookupText = "";
	parseEntries();
    }

    Point getPost(int n) {
	return new Point(x, y, n);
    }

    void setPoints() {
	super.setPoints();
	lead1 = new Point();
    }

    int readInputValue() {
	int value = 0;
	for (int i = 0; i != busWidth; i++)
	    if (volts[i] > threshold)
		value |= 1 << i;
	return value;
    }

    String getDisplayText() {
	int value = readInputValue();
	for (int i = 0; i != entries.size(); i++) {
	    LookupEntry entry = entries.get(i);
	    if (value >= entry.lo && value <= entry.hi)
		return entry.getText(value);
	}
	return String.valueOf(value);
    }

    void draw(Graphics g) {
	g.save();
	boolean selected = needsHighlight();
	Font f = new Font("SansSerif", selected ? Font.BOLD : 0, 14);
	g.setFont(f);
	g.setColor(selected ? selectColor : lightGrayColor);
	String s = getDisplayText();
	interpPoint(point1, point2, lead1, 1 - ((int) g.context.measureText(s).getWidth() / 2 + 8) / dn);
	setBbox(point1, lead1, 0);
	drawCenteredText(g, s, x2, y2, true);
	setVoltageColor(g, volts[0]);
	if (selected)
	    g.setColor(selectColor);
	drawThickLine(g, point1, lead1, 5);
	drawPosts(g);
	g.restore();
    }

    void addRoutingObstacle(WireRouter router) {
	router.addWire(point1.x, point1.y, x2, y2);
	router.addObstacle(x2 - 10, y2 - 10, x2 + 10, y2 + 10);
    }

    double getVoltageDiff() { return volts[0]; }

    void getInfo(String arr[]) {
	arr[0] = "instruction display";
	int value = readInputValue();
	arr[1] = "in = " + value + " (0x" + Integer.toHexString(value).toUpperCase() + ")";
	arr[2] = "text = " + getDisplayText();
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("Bus Width", busWidth, 2, 32).setDimensionless();
	if (n == 1)
	    return new EditInfo("Threshold Voltage", threshold);
	if (n == 2) {
	    EditInfo ei = new EditInfo("Lookup Table", 0);
	    ei.textArea = new TextArea();
	    ei.textArea.setVisibleLines(10);
	    ei.textArea.setText(lookupText);
	    return ei;
	}
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {
	if (n == 0 && ei.value >= 1 && ei.value <= 32) {
	    busWidth = (int) ei.value;
	    allocNodes();
	}
	if (n == 1)
	    threshold = ei.value;
	if (n == 2) {
	    lookupText = ei.textArea.getText();
	    parseEntries();
	}
    }

    void parseEntries() {
	entries = new Vector<LookupEntry>();
	if (lookupText == null || lookupText.length() == 0)
	    return;
	String lines[] = lookupText.split("\n");
	for (int i = 0; i != lines.length; i++) {
	    String line = lines[i].trim();
	    if (line.length() == 0)
		continue;
	    int eq = line.indexOf('=');
	    if (eq < 0)
		continue;
	    String key = line.substring(0, eq).trim();
	    String val = line.substring(eq + 1);
	    try {
		int dash = findDash(key);
		if (dash >= 0) {
		    int lo = parseNumber(key.substring(0, dash));
		    int hi = parseNumber(key.substring(dash + 1));
		    entries.add(new LookupEntry(lo, hi, val));
		} else {
		    int k = parseNumber(key);
		    entries.add(new LookupEntry(k, k, val));
		}
	    } catch (Exception e) {}
	}
    }

    int findDash(String s) {
	int start = 0;
	if (s.startsWith("0x") || s.startsWith("0X"))
	    start = 2;
	else if (s.startsWith("0b") || s.startsWith("0B"))
	    start = 2;
	return s.indexOf('-', start);
    }

    int parseNumber(String s) {
	s = s.trim();
	if (s.startsWith("0x") || s.startsWith("0X"))
	    return Integer.parseInt(s.substring(2), 16);
	if (s.startsWith("0b") || s.startsWith("0B"))
	    return Integer.parseInt(s.substring(2), 2);
	return Integer.parseInt(s);
    }

    static class LookupEntry {
	int lo, hi;
	String template;

	LookupEntry(int lo, int hi, String template) {
	    this.lo = lo;
	    this.hi = hi;
	    this.template = template;
	}

	String getText(int value) {
	    StringBuilder sb = new StringBuilder();
	    int pos = 0;
	    while (pos < template.length()) {
		int open = template.indexOf('{', pos);
		if (open < 0) {
		    sb.append(template.substring(pos));
		    break;
		}
		sb.append(template.substring(pos, open));
		int close = template.indexOf('}', open);
		if (close < 0) {
		    sb.append(template.substring(open));
		    break;
		}
		String exprStr = template.substring(open + 1, close);
		try {
		    ExprParser ep = new ExprParser(exprStr);
		    Expr expr = ep.parseExpression();
		    if (ep.gotError() == null) {
			ExprState es = new ExprState(1);
			es.values[0] = value; // a = input value
			double result = expr.eval(es);
			int intResult = (int) result;
			if (result == intResult)
			    sb.append(intResult);
			else
			    sb.append(result);
		    } else {
			CirSim.console("ep.got error: " + exprStr);
			sb.append("{" + exprStr + "}");
		    }
		} catch (Exception e) {
		    sb.append("{" + exprStr + "}");
		}
		pos = close + 1;
	    }
	    return sb.toString();
	}
    }

    boolean getConnection(int n1, int n2) { return false; }

}
