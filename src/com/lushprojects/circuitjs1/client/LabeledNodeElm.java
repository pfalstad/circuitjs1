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

import java.util.HashMap;
import com.lushprojects.circuitjs1.client.util.Locale;

class LabeledNodeElm extends CircuitElm {
    final int FLAG_ESCAPE = 4;
    final int FLAG_INTERNAL = 1;
    final int FLAG_ROTATE_TEXT = 8;
    
    public LabeledNodeElm(int xx, int yy) {
	super(xx, yy);
	text = "label";
    }
    public LabeledNodeElm(int xa, int ya, int xb, int yb, int f,
	    StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	text = st.nextToken();
	if ((flags & FLAG_ESCAPE) == 0) {
	    // old-style dump before escape/unescape
	    while (st.hasMoreTokens())
		text += ' ' + st.nextToken();
	} else {
	    // new-style dump
	    text = CustomLogicModel.unescape(text); 
	}
    }
    String dump() {
	flags |= FLAG_ESCAPE;
	return super.dump() + " " + CustomLogicModel.escape(text);
    }

    void dumpXml(Document doc, Element elem) {
        super.dumpXml(doc, elem);
        XMLSerializer.dumpAttr(elem, "te", text);
    }

    void undumpXml(XMLDeserializer xml) {
        super.undumpXml(xml);
        text = xml.parseStringAttr("te", text);
    }

    String text;
    int busWidth = 1;
    double[] currents;

    class LabelEntry {
	Point point;
	int node;
    }

    static HashMap<String,LabelEntry> labelList;
    boolean isInternal() { return (flags & FLAG_INTERNAL) != 0; }
    boolean isRotateText() { return (flags & FLAG_ROTATE_TEXT) != 0; }

    public static native void console(String text)
    /*-{
	    console.log(text);
	}-*/;

    static void resetNodeList() {
	labelList = new HashMap<String,LabelEntry>();
    }
    final int circleSize = 17;
    void setPoints() {
	super.setPoints();
	lead1 = interpPoint(point1, point2, 1-circleSize/dn);
    }
    
    // get post we're connected to
    Point getConnectedPost() {
	return getConnectedPost(0);
    }

    Point getConnectedPost(int n) {
	String key = (busWidth > 1) ? text + ":" + n : text;
	Point myPost = getPost(n);
	LabelEntry le = labelList.get(key);
	if (le != null)
	    return le.point;

	// this is the first time calcWireClosure() encountered this label.  so save our post and
	// return null for now, but return it the next time we see this label so that all nodes
	// with the same label are connected
	le = new LabelEntry();
	le.point = myPost;
	labelList.put(key, le);
	return null;
    }
    
    void setNode(int p, CircuitNode n) {
	super.setNode(p, n);

	// save node number so we can return it in getByName()
	String key = (busWidth > 1) ? text + ":" + p : text;
	LabelEntry le = labelList.get(key);
	if (le != null) // should never happen
	    le.node = n.index;
    }
    
    int getDumpType() { return 207; }
    String getXmlDumpType() { return "ln"; }
    int getPostCount() { return busWidth; }
    int getPostWidth(int n) { return busWidth; }
    int getBusWidth() { return busWidth; }

    Point getPost(int n) {
	if (busWidth == 1)
	    return point1;
	return new Point(point1.x, point1.y, n);
    }
    
    // this is basically a wire, since it just connects two or more nodes together
    boolean isWireEquivalent() { return true; }
    boolean isRemovableWire() { return true; }
    boolean getConnection(int n1, int n2) { return n1 == n2; }
    
    static Integer getByName(String n) {
	if (labelList == null)
	    return null;
	LabelEntry le = labelList.get(n);
	if (le == null)
	    return null;
	return le.node;
    }
    
    void drawLabeledNode(Graphics g, String str, Point pt1, Point pt2) {
	if (isRotateText() && pt1.x == pt2.x) {
	    drawRotatedLabeledNode(g, str, pt1, pt2);
	    return;
	}
	super.drawLabeledNode(g, str, pt1, pt2);
    }

    void drawRotatedLabeledNode(Graphics g, String str, Point pt1, Point pt2) {
	boolean lineOver = false;
	if (str.startsWith("/")) {
	    lineOver = true;
	    str = str.substring(1);
	}
	int w = (int) g.context.measureText(str).getWidth();
	int h = (int) g.currentFontSize;
	g.save();
	g.context.setTextBaseline("middle");
	int dir = sign(pt2.y - pt1.y);
	// offset text further from the wire to avoid overlap with long names
	int offset = h + Math.max(0, w / 2 - h);
	int tx = pt2.x;
	int ty = pt2.y + dir * offset;
	g.context.translate(tx, ty);
	g.context.rotate(-Math.PI / 2);
	g.context.setTextAlign("center");
	g.drawString(str, 0, 0);
	// bbox for rotated text: width becomes height and vice versa
	adjustBbox(tx - h / 2, ty - w / 2, tx + h / 2, ty + w / 2);
	g.restore();
	if (lineOver) {
	    int xa = -h / 2 - 1;
	    g.save();
	    g.context.translate(tx, ty);
	    g.context.rotate(-Math.PI / 2);
	    g.drawLine(-w / 2, xa, w / 2, xa);
	    g.restore();
	}
    }

    void draw(Graphics g) {
	setVoltageColor(g, volts[0]);
	drawThickLine(g, point1, lead1, (busWidth > 1) ? 5 : 3);
	g.setColor(needsHighlight() ? selectColor : whiteColor);
	setPowerColor(g, false);
	interpPoint(point1, point2, ps2, 1+11./dn);
	setBbox(point1, ps2, circleSize);
	drawLabeledNode(g, text, point1, lead1);

	curcount = updateDotCount(current, curcount);
	drawDots(g, point1, lead1, curcount);
	drawPosts(g);
    }
    double getCurrentIntoNode(int n) {
	if (currents != null)
	    return -currents[n];
	return -current;
    }
    void setCurrent(VoltageSource vs, double c) { current = c; }
    void setWireCurrent(int bit, double c) {
	if (currents != null)
	    currents[bit] = c;
	else
	    current = c;
    }
    int getShortcut() { return 'b'; }
    double getVoltageDiff() { return volts[0]; }
    String getElmType() { return "Labeled Node"; }
    int getBusValue() {
	int value = 0;
	for (int i = 0; i < busWidth; i++)
	    if (volts[i] > 2.5)
		value |= 1 << i;
	return value;
    }

    void getInfo(String arr[]) {
	arr[0] = Locale.LS(text) + " (" + Locale.LS("Labeled Node") + ")";
	if (busWidth > 1) {
	    int value = getBusValue();
	    arr[1] = "value = " + value;
	    arr[2] = "hex = 0x" + Integer.toHexString(value).toUpperCase();
	} else {
	    arr[1] = "I = " + getCurrentText(getCurrent());
	    arr[2] = "V = " + getVoltageText(volts[0]);
	}
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("Text", 0, -1, -1);
	    ei.text = text;
	    return ei;
	}
        if (n == 1) {
            EditInfo ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Internal Node", isInternal());
            return ei;
        }
	if (n == 2) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox = new Checkbox("Rotate Text When Vertical", isRotateText());
	    return ei;
	}
	return null;
    }
    public void setEditValue(int n, EditInfo ei) {
	if (n == 0)
	    text = ei.textf.getText();
	if (n == 1)
	    flags = ei.changeFlag(flags, FLAG_INTERNAL);
	if (n == 2)
	    flags = ei.changeFlag(flags, FLAG_ROTATE_TEXT);
    }
    @Override String getScopeText(int v) {
	return text;
    }
    
    String getName() { return text; }
}
