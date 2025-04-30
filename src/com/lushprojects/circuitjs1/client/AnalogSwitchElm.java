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

class AnalogSwitchElm extends CircuitElm {
    final int FLAG_INVERT = 1;
    final int FLAG_PULLDOWN = 2;

    // Unfortunately we need all three flags to keep track of flipping.
    // FLAG_FLIP_X/Y affect the rounding direction if the elm is an odd grid length.
    // FLAG_FLIP does not.
    final int FLAG_FLIPPED_X = 4;
    final int FLAG_FLIPPED_Y = 8;
    final int FLAG_FLIPPED = 16;

    double resistance, r_on, r_off, threshold;
    public AnalogSwitchElm(int xx, int yy) {
	super(xx, yy);
	r_on = 20;
	r_off = 1e10;
	threshold = 2.5;
	noDiagonal = true;
	flags |= FLAG_PULLDOWN;
    }
    public AnalogSwitchElm(int xa, int ya, int xb, int yb, int f,
			   StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	r_on = 20;
	r_off = 1e10;
	threshold = 2.5;
	noDiagonal = true;
	try {
	    r_on = new Double(st.nextToken()).doubleValue();
	    r_off = new Double(st.nextToken()).doubleValue();
	    threshold = new Double(st.nextToken()).doubleValue();
	} catch (Exception e) { }
    }
    String dump() {
	return super.dump() + " " + r_on + " " + r_off + " " + threshold;
    }
    
    int getDumpType() { return 159; }
    boolean open;
    int openhs;
	
    Point ps, point3, lead3;
    void setPoints() {
	super.setPoints();
	calcLeads(32);
	adjustLeadsToGrid(isFlippedX(), isFlippedY());
	ps = new Point();
	openhs = (isFlippedX() != isFlippedY()) != isFlipped() ? -16 : 16;
	point3 = interpPoint(lead1, lead2, .5, -openhs);
	lead3  = interpPoint(lead1, lead2, .5, -openhs/2);
    }
	
    boolean isFlippedX() { return hasFlag(FLAG_FLIPPED_X); }
    boolean isFlippedY() { return hasFlag(FLAG_FLIPPED_Y); }
    boolean isFlipped () { return hasFlag(FLAG_FLIPPED  ); }

    void flipX(int c2, int count) {
	flags ^= FLAG_FLIPPED_X;
	super.flipX(c2, count);
    }

    void flipY(int c2, int count) {
	flags ^= FLAG_FLIPPED_Y;
	super.flipY(c2, count);
    }

    void flipXY(int c2, int count) {
	flags ^= FLAG_FLIPPED;
	super.flipXY(c2, count);
    }

    void draw(Graphics g) {
	int hs = (open) ? openhs : 0;
	setBbox(point1, point2, openhs);

	draw2Leads(g);
	    
	g.setColor(lightGrayColor);
	interpPoint(lead1, lead2, ps, 1, hs);
	drawThickLine(g, lead1, ps);

	setVoltageColor(g, volts[2]);
	drawThickLine(g, point3, lead3);
	    
	if (!open)
	    doDots(g);
	drawPosts(g);
    }
    void calculateCurrent() {
	if (needsPulldown() && open)
	    current = 0;
	else
	    current = (volts[0]-volts[1])/resistance;
    }
	
    // we need this to be able to change the matrix for each step
    boolean nonLinear() { return true; }

    boolean needsPulldown() { return hasFlag(FLAG_PULLDOWN); }

    void stamp() {
	sim.stampNonLinear(nodes[0]);
	sim.stampNonLinear(nodes[1]);
	if (needsPulldown()) {
	    // pulldown resistor on each side
	    sim.stampResistor(nodes[0], 0, r_off);
	    sim.stampResistor(nodes[1], 0, r_off);
	}
    }
    void doStep() {
	open = (volts[2] < threshold);
	if (hasFlag(FLAG_INVERT))
	    open = !open;

	// if pulldown flag is set, resistance is r_on.  Otherwise, no connection.
	// if pulldown flag is unset, resistance is r_on for on, r_off for off.
	if (!(needsPulldown() && open)) {
	    resistance = (open) ? r_off : r_on;
	    sim.stampResistor(nodes[0], nodes[1], resistance);
	}
    }
    int getPostCount() { return 3; }
    Point getPost(int n) {
	return (n == 0) ? point1 : (n == 1) ? point2 : point3;
    }
    void getInfo(String arr[]) {
	arr[0] = "analog switch";
	arr[1] = open ? "open" : "closed";
	arr[2] = "Vd = " + getVoltageDText(getVoltageDiff());
	arr[3] = "I = " + getCurrentDText(getCurrent());
	arr[4] = "Vc = " + getVoltageText(volts[2]);
    }

    // we have to just assume current will flow either way, even though that
    // might cause singular matrix errors
    boolean getConnection(int n1, int n2) {
	if (n1 == 2 || n2 == 2)
	    return false;
	return true;
    }

    boolean hasGroundConnection(int n1) { 
	return needsPulldown() && (n1 < 2);
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox = new Checkbox("Normally closed", hasFlag(FLAG_INVERT));
	    return ei;
	}
	if (n == 1)
	    return new EditInfo("On Resistance (ohms)", r_on, 0, 0);
	if (n == 2)
	    return new EditInfo("Off Resistance (ohms)", r_off, 0, 0);
	if (n == 3)
	    return EditInfo.createCheckbox("Pulldown Resistor", needsPulldown());
        if (n == 4)
            return new EditInfo("Threshold", threshold, 10, -10);

	return null;
    }
    public void setEditValue(int n, EditInfo ei) {
	if (n == 0)
	    flags = (ei.checkbox.getState()) ?
		(flags | FLAG_INVERT) :
		(flags & ~FLAG_INVERT);
	if (n == 1 && ei.value > 0)
	    r_on = ei.value;
	if (n == 2 && ei.value > 0)
	    r_off = ei.value;
	if (n == 3)
	    flags = ei.changeFlag(flags, FLAG_PULLDOWN);
	if (n == 4)
	    threshold = ei.value;
    }
    
    double getCurrentIntoNode(int n) {
	if (n==2)
	    return 0;
	if (n==0)
	    return -current;
	return current;
    }  
}

