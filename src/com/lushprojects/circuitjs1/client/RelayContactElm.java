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

import com.google.gwt.user.client.ui.Button;
import com.lushprojects.circuitjs1.client.util.Locale;

// 0 = switch
// 1 = switch end 1
// 2 = switch end 2
// ...
// 3n   = coil
// 3n+1 = coil
// 3n+2 = end of coil resistor

class RelayContactElm extends CircuitElm {
    double r_on, r_off;
    Point swposts[], swpoles[], ptSwitch;
    double switchCurrent, switchCurCount;
    String label;
    final int FLAG_NORMALLY_CLOSED = 2;
    final int FLAG_IEC = 4;
    int type;

    // fractional position, between 0 and 1 inclusive
//    double d_position;
    
    // integer position, can be 0 (off), 1 (on), 2 (in between)
    int i_position;
    
    int poleCount;
    int openhs;
    final int nSwitch0 = 0;
    final int nSwitch1 = 1;
    double currentOffset1, currentOffset2;
    Point extraPoints[];

    public RelayContactElm(int xx, int yy) {
	super(xx, yy);
	noDiagonal = true;
	r_on = .05;
	r_off = 1e6;
	label = "label";
	flags |= FLAG_IEC;
    }
    public RelayContactElm(int xa, int ya, int xb, int yb, int f,
		    StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	label = CustomLogicModel.unescape(st.nextToken());
	r_on = new Double(st.nextToken()).doubleValue();
	r_off = new Double(st.nextToken()).doubleValue();
	try {
	    i_position = Integer.parseInt(st.nextToken());
	} catch (Exception e) {}	
	noDiagonal = true;
        allocNodes();
    }
    
    int getDumpType() { return 426; }
    boolean useIECSymbol() { return (flags & FLAG_IEC) != 0; }

    String dump() {
	// escape label
	return super.dump() + " " + CustomLogicModel.escape(label) + " " + r_on + " " + r_off + " " + i_position;
    }
    
    void draw(Graphics g) {
	int i;
	for (i = 0; i != 2; i++) {
	    // draw lead
	    setVoltageColor(g, volts[nSwitch0+i]);
	    drawThickLine(g, swposts[i], swpoles[i]);
	}
	
	interpPoint(swpoles[1], swpoles[2], ptSwitch, i_position);
	//setVoltageColor(g, volts[nSwitch0]);
	g.setColor(Color.lightGray);
	drawThickLine(g, swpoles[0], ptSwitch);
	
	g.setColor(needsHighlight() ? selectColor : whiteColor);
	if (x == x2)
	    g.drawString(label, x+10, swpoles[y < y2 ? 0 : 1].y-5);
	else {
            g.save();
            g.context.setTextAlign("center");
            g.drawString(label, (x+x2)/2, y+15);
	    g.restore();
	}

	if (useIECSymbol() && (type == RelayCoilElm.TYPE_ON_DELAY || type == RelayCoilElm.TYPE_OFF_DELAY)) {
	    g.setColor(Color.lightGray);
	    interpPoint(lead1, lead2, extraPoints[0], .5-2/32., i_position == 1 ? openhs/2 : 0);
	    interpPoint(lead1, lead2, extraPoints[1], .5+2/32., i_position == 1 ? openhs/2 : 0);
	    g.drawLine(extraPoints[0], extraPoints[2]);
	    g.drawLine(extraPoints[1], extraPoints[3]);
	    g.context.beginPath();
	    double ang = -Math.atan2(-dy*dsign, dx*dsign);
	    int ds = 22*dsign;
	    if (type == RelayCoilElm.TYPE_OFF_DELAY) {
		ang += Math.PI;
		interpPoint(lead1, lead2, extraPoints[4], .5, ds+6*dsign);
	    } else {
		interpPoint(lead1, lead2, extraPoints[4], .5, ds-5*dsign);
	    }
	    g.context.arc(extraPoints[4].x, extraPoints[4].y, 6, -Math.PI/8+ang, Math.PI*9/8+ang, true);
	    g.context.stroke();
	}

	switchCurCount = updateDotCount(switchCurrent, switchCurCount);
	drawDots(g, swposts[0], swpoles[0], switchCurCount);
	
	if (i_position == 0)
	    drawDots(g, swpoles[i_position+1], swposts[i_position+1], switchCurCount);
	
	drawPosts(g);
	setBbox(point1, point2, openhs);
    }
	
    double getCurrentIntoNode(int n) {
	if (n == 0)
	    return -switchCurrent;
	if (n == 1+i_position)
	    return switchCurrent;
	return 0;
    }

    void setPoints() {
	super.setPoints();
	allocNodes();
	openhs = dsign*16;

	// switch
	calcLeads(32);
	swposts = new Point[3];
	swpoles = new Point[3];
	int i, j;
	for (j = 0; j != 3; j++) {
	    swposts[j] = new Point();
	    swpoles[j] = new Point();
	}
	interpPoint(lead1,  lead2, swpoles[0], 0, 0);
	interpPoint(lead1,  lead2, swpoles[1], 1, 0);
	interpPoint(lead1,  lead2, swpoles[2], 1, openhs);
	interpPoint(point1, point2, swposts[0], 0, 0);
	interpPoint(point1, point2, swposts[1], 1, 0);
	interpPoint(point1, point2, swposts[2], 1, openhs);
	ptSwitch = new Point();
	
	if (useIECSymbol()) {
	    extraPoints = newPointArray(5);
	    int ds = 22*dsign;
	    interpPoint(lead1, lead2, extraPoints[2], .5-2/32., ds);
	    interpPoint(lead1, lead2, extraPoints[3], .5+2/32., ds);
	}
    }
    
    public void setPosition(int i_position_, int type_) {
	i_position = (isNormallyClosed()) ? (1-i_position_) : i_position_;
	type = type_;
    }

    boolean isNormallyClosed() { return (flags & FLAG_NORMALLY_CLOSED) != 0; }
    
    Point getPost(int n) {
	return swposts[n];
    }
    int getPostCount() { return 2; }
    void reset() {
	super.reset();
	switchCurrent = switchCurCount = 0;
	i_position = 0;

	// preserve onState because if we don't, Relay Flip-Flop gets left in a weird state on reset.
	// onState = false;
    }

    void stamp() {
	sim.stampNonLinear(nodes[nSwitch0]);
	sim.stampNonLinear(nodes[nSwitch1]);
    }
    
    // we need this to be able to change the matrix for each step
    boolean nonLinear() { return true; }

    void doStep() {
	sim.stampResistor(nodes[nSwitch0], nodes[nSwitch1], i_position == 0 ? r_on : r_off);
    }
    void calculateCurrent() {
	// actually this isn't correct, since there is a small amount
	// of current through the switch when off
	if (i_position == 1)
	    switchCurrent = 0;
	else
	    switchCurrent = (volts[nSwitch0]-volts[nSwitch1+i_position])/r_on;
    }
    void getInfo(String arr[]) {
	arr[0] = Locale.LS("relay");
	if (i_position == 0)
	    arr[0] += " (" + Locale.LS("off") + ")";
	else if (i_position == 1)
	    arr[0] += " (" + Locale.LS("on") + ")";
	int i;
	int ln = 1;
	arr[ln++] = "I = " + getCurrentDText(switchCurrent);
    }
    public EditInfo getEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("On Resistance (ohms)", r_on, 0, 0);
	if (n == 1)
	    return new EditInfo("Off Resistance (ohms)", r_off, 0, 0);
	if (n == 2)
	    return new EditInfo("Label (for linking)", label);
	if (n == 3)
	    return EditInfo.createCheckbox("Normally Closed", isNormallyClosed());
	if (n == 4)
	    return EditInfo.createCheckbox("IEC Symbol", useIECSymbol());
	return null;
    }
    
    public void setEditValue(int n, EditInfo ei) {
	if (n == 0 && ei.value > 0)
	    r_on = ei.value;
	if (n == 1 && ei.value > 0)
	    r_off = ei.value;
        if (n == 2)
	    label = ei.textf.getText();
        if (n == 3)
            flags = ei.changeFlag(flags, FLAG_NORMALLY_CLOSED);
	if (n == 4) {
	    flags = ei.changeFlag(flags, FLAG_IEC);
	    setPoints();
	}
    }
    
    boolean getConnection(int n1, int n2) {
	return true;
    }
}
