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

class RailElm extends VoltageElm {
	public RailElm(int xx, int yy) { 
		super(xx, yy, WF_DC); 

	}
	RailElm(int xx, int yy, int wf) {
		super(xx, yy, wf); 
	}

	public RailElm(int xa, int ya, int xb, int yb, int f,
			StringTokenizer st) {
		super(xa, ya, xb, yb, f, st);
	}

    
    final int FLAG_CLOCK = 1;
    int getDumpType() { return 'R'; }
    int getPostCount() { return 1; }

    void setPoints() {
	super.setPoints();
	lead1 = interpPoint(point1, point2, 1-circleSize/dn);
    }
    
    String getRailText() {
	return null;
    }
    
    void draw(Graphics g) {
	String rt = getRailText();
        double w = rt == null ? circleSize : g.context.measureText(rt).getWidth()/2;
        if (w > dn*.8)
            w = dn*.8;
	lead1 = interpPoint(point1, point2, 1-w/dn);
	setBbox(point1, point2, circleSize);
	setVoltageColor(g, volts[0]);
	drawThickLine(g, point1, lead1);
	drawRail(g);
	drawPosts(g);
	curcount = updateDotCount(-current, curcount);
	if (!isCreating())
	    drawDots(g, point1, lead1, curcount);
    }

    void drawRail(Graphics g) {
	if (waveform == WF_SQUARE && (flags & FLAG_CLOCK) != 0)
	    drawRailText(g, "CLK");
	else if (waveform == WF_DC || waveform == WF_VAR) {
	    g.setColor(needsHighlight() ? selectColor : whiteColor);
	    setPowerColor(g, false);
	    double v = getVoltage();
	    String s;
	    if (Math.abs(v) < 1)
	    	s = showFormat.format(v)+" V";
	    else
	    	s = getShortUnitText(v, "V");
	    if (getVoltage() > 0)
		s = "+" + s;
	    drawLabeledNode(g, s, point1, lead1);
	} else {
	    drawWaveform(g, point2);
	}
    }
    
    void drawRailText(Graphics g, String s) {
	g.setColor(needsHighlight() ? selectColor : whiteColor);
	setPowerColor(g, false);
	drawLabeledNode(g, s, point1, lead1);
    }
    
    double getVoltageDiff() { return volts[0]; }
    void setVoltageSource(int n, VoltageSource v) {
	super.setVoltageSource(n, v);
	if (internalResistance > 0)
	    v.setNodes(CircuitNode.ground, nodes[1]);
	else
	    v.setNodes(CircuitNode.ground, nodes[0]);
    }
    void stamp() {
	CircuitNode vsNode = internalResistance > 0 ? nodes[1] : nodes[0];
	if (waveform == WF_DC)
	    sim.stampVoltageSource(CircuitNode.ground, vsNode, voltSource, getVoltage());
	else
	    sim.stampVoltageSource(CircuitNode.ground, vsNode, voltSource);
	if (internalResistance > 0)
	    sim.stampResistor(nodes[1], nodes[0], internalResistance);
    }
    void doStep() {
	CircuitNode vsNode = internalResistance > 0 ? nodes[1] : nodes[0];
	if (waveform != WF_DC)
	    sim.updateVoltageSource(CircuitNode.ground, vsNode, voltSource, getVoltage());
    }
    boolean hasGroundConnection(int n1) { return true; }
    void addRoutingObstacle(WireRouter router) {
	router.addWire(point1.x, point1.y, point2.x, point2.y);
	router.addObstacle(point2.x - circleSize, point2.y - circleSize,
			   point2.x + circleSize, point2.y + circleSize);
    }

    int getShortcut() { return 'V'; }
    boolean validateRailNode(int n) {
	FindPathInfo fpi = new FindPathInfo(FindPathInfo.VOLTAGE, this, getNode(n), sim);
	if (fpi.findPath(CircuitNode.ground)) {
	    //sim.stop("Path to ground with no resistance!", this);
	    internalResistance = .001;
	    return false;
	}
	return true;
    }
    boolean validate() { return internalResistance > 0 || validateRailNode(0); }

    boolean getDragVertical(boolean requestedVertical) {
        return requestedVertical;
    }

//    void drawHandles(Graphics g, Color c) {
//    	g.setColor(c);
//		g.fillRect(x-3, y-3, 7, 7);
//    }

}
