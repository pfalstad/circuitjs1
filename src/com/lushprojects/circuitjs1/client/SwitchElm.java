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

// SPST switch
class SwitchElm extends CircuitElm {
    boolean momentary;
    // position 0 == closed, position 1 == open
    int position, posCount;
    final int FLAG_IEC = 2;
    final int FLAG_LABEL = 4;
    String label;
    
    public SwitchElm(int xx, int yy) {
	super(xx, yy);
	momentary = false;
	position = 0;
	posCount = 2;
	label = null;
    }
    SwitchElm(int xx, int yy, boolean mm) {
	super(xx, yy);
	position = (mm) ? 1 : 0;
	momentary = mm;
	posCount = 2;
	label = null;
    }
    public SwitchElm(int xa, int ya, int xb, int yb, int f,
		     StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	String str = st.nextToken();
	if (str.compareTo("true") == 0)
	    position = (this instanceof LogicInputElm) ? 0 : 1;
	else if (str.compareTo("false") == 0)
	     position = (this instanceof LogicInputElm) ? 1 : 0;
	else
	    position = new Integer(str).intValue();
	momentary = new Boolean(st.nextToken()).booleanValue();
	posCount = 2;
	label = null;
	if ((flags & FLAG_LABEL) != 0)
	    label = CustomLogicModel.unescape(st.nextToken());
    }
    int getDumpType() { return 's'; }
    String dump() {
	String s = super.dump() + " " + position + " " + momentary;
	if ((flags & FLAG_LABEL) != 0)
	    s += " " + CustomLogicModel.escape(label);
	return s;
    }

    Point ps, ps2;
    Point extraPoints[];
    
    void setPoints() {
	super.setPoints();
	calcLeads(32);
	ps  = new Point();
	ps2 = new Point();
	
	if (useIECSymbol()) {
	    extraPoints = newPointArray(7);
	    interpPoint(lead1, lead2, extraPoints[0], .5, openhs/2);
	    interpPoint(lead1, lead2, extraPoints[1], .5, 24);
	    interpPoint(lead1, lead2, extraPoints[2], .5-.1, 24);
	    interpPoint(lead1, lead2, extraPoints[3], .5+.1, 24);
	    interpPoint(lead1, lead2, extraPoints[4], .5, 19);
	    interpPoint(lead1, lead2, extraPoints[5], .5-.1, 16);
	    interpPoint(lead1, lead2, extraPoints[6], .5, 13);
	}
    }
    
    final int openhs = 16;
	
    void draw(Graphics g) {
	int hs1 = (position == 1) ? 0 : 2;
	int hs2 = (position == 1) ? openhs : 2;
	setBbox(point1, point2, openhs);

	draw2Leads(g);
	    
	if (position == 0)
	    doDots(g);
	    
	if (!needsHighlight())
	    g.setColor(whiteColor);
	interpPoint(lead1, lead2, ps,  0, hs1);
	interpPoint(lead1, lead2, ps2, 1, hs2);
	    
	drawThickLine(g, ps, ps2);
	
	if (label != null) {
	    g.setColor(needsHighlight() ? selectColor : whiteColor);
	    if (Math.abs(dy) > Math.abs(dx))
		g.drawString(label, x+10, (y < y2 ? lead1 : lead2).y-5);
	    else {
		g.save();
		g.context.setTextAlign("center");
		g.drawString(label, (x+x2)/2, (x2 > x) ? y+15 : y-15);
		g.restore();
	    }
	}

	if (useIECSymbol()) {
	    g.drawLine(extraPoints[2], extraPoints[3]);
	    g.setLineDash(3, 3);
	    interpPoint(lead1, lead2, extraPoints[0], .5, position == 1 ? openhs/2 : 2);
	    if (momentary)
		g.drawLine(extraPoints[1], extraPoints[0]);
	    else {
		g.drawLine(extraPoints[6], extraPoints[0]);
		g.drawLine(extraPoints[1], extraPoints[4]);
	    }
	    g.setLineDash(0, 0);
	    if (!momentary) {
		g.drawLine(extraPoints[4], extraPoints[5]);
		g.drawLine(extraPoints[6], extraPoints[5]);
	    }
	}
	
	drawPosts(g);
    }
    
    Rectangle getSwitchRect() {
	interpPoint(lead1, lead2, ps,  0, openhs);
	return new Rectangle(lead1).union(new Rectangle(lead2)).union(new Rectangle(ps));
    }
    
    void calculateCurrent() {
	if (position == 1)
	    current = 0;
    }
    
    void mouseUp() {
	if (momentary)
	    toggle();
    }
    
    void simpleToggle() {
	position++;
	if (position >= posCount)
	    position = 0;
    }
    
    void toggle() {
	simpleToggle();
        if (label != null) {
            int i;
            for (i = 0; i != sim.elmList.size(); i++) {
                Object o = sim.elmList.elementAt(i);
                if (o instanceof SwitchElm && o != this) {
                    SwitchElm s2 = (SwitchElm) o;
                    if (label.equals(s2.label))
                	s2.simpleToggle();
                }
            }
        }
    }
    void getInfo(String arr[]) {
	arr[0] = (momentary) ? "push switch (SPST)" : "switch (SPST)";
	if (position == 1) {
	    arr[1] = "open";
	    arr[2] = "Vd = " + getVoltageDText(getVoltageDiff());
	} else {
	    arr[1] = "closed";
	    arr[2] = "V = " + getVoltageText(volts[0]);
	    arr[3] = "I = " + getCurrentDText(getCurrent());
	}
    }
    boolean getConnection(int n1, int n2) { return position == 0; }
    boolean isWireEquivalent() { return position == 0; }
    boolean isRemovableWire() { return position == 0; }
    boolean useIECSymbol() { return (flags & FLAG_IEC) != 0; }
    
    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox = new Checkbox("Momentary Switch", momentary);
	    return ei;
	}
	if (n == 1)
	    return EditInfo.createCheckbox("IEC Symbol", useIECSymbol());
        if (n == 2)
            return new EditInfo("Label (for linking)", label == null ? "" : label);
	return null;
    }
    public void setEditValue(int n, EditInfo ei) {
	if (n == 0)
	    momentary = ei.checkbox.getState();
	if (n == 1) {
	    flags = ei.changeFlag(flags, FLAG_IEC);
	    setPoints();
	}
        if (n == 2) {
            label = ei.textf.getText();
            if (label.length() == 0) {
        	label = null;
        	flags &= ~FLAG_LABEL;
            } else
        	flags |= FLAG_LABEL;
        }
    }

    int getShortcut() { return 's'; }
}
