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

// Two-terminal controlled current source: the diamond symbol with an arrow inside.
// Output current (from post 1 to post 2 through the source) is gain times the control.
class ControlledCurrentElm extends ControlledSourceElm {
    boolean broken;

    public ControlledCurrentElm(int xx, int yy) { super(xx, yy); }
    public ControlledCurrentElm(int xa, int ya, int xb, int yb, int f,
				StringTokenizer st) {
	super(xa, ya, xb, yb, f, st);
    }

    String getDefaultExpr() { return ".001*v(in)"; }
    String getXmlDumpType() { return "ci"; }
    String getElmType() { return "controlled current source"; }

    Point ashaft1, ashaft2;
    Polygon arrow;
    void setPoints() {
	super.setPoints();
	// arrow along the diamond's long axis, pointing from post 1 to post 2
	ashaft1 = interpPoint(lead1, lead2, .3);
	ashaft2 = interpPoint(lead1, lead2, .6);
	Point tip = interpPoint(lead1, lead2, .75);
	arrow = calcArrow(center, tip, 7, 6);
    }

    // a current source with nowhere for the current to go makes the matrix singular
    void validate() {
	CirSim.FindPathInfo fpi = sim.new FindPathInfo(CirSim.FindPathInfo.INDUCT, this, nodes[1]);
	broken = !fpi.findPath(nodes[0]);
    }

    void stamp() {
	if (broken) {
	    sim.stampResistor(nodes[0], nodes[1], 1e8);
	    return;
	}
	if (!resolve())
	    return;
	if (currentControl)
	    sim.stampCCCS(nodes[0], nodes[1], refVS, gain);
	else
	    sim.stampVCCurrentSource(nodes[0], nodes[1], refPos, refNeg, gain);
    }

    void polyStamp() {
	if (broken) {
	    sim.stampPolyAdmittance(nodes[0], nodes[1], new Polynomial(0, 1e-8));
	    return;
	}
	if (!resolve())
	    return;
	// everything in the poly matrix is multiplied by s
	if (currentControl)
	    sim.stampPolyCCCS(nodes[0], nodes[1], refVS, new Polynomial(0, gain));
	else
	    sim.stampPolyVCCurrentSource(nodes[0], nodes[1], refPos, refNeg, new Polynomial(0, gain));
    }

    // we don't get our current from the solve, so compute it from the control
    double getCurrent() {
	if (broken || refElm == null)
	    return 0;
	return gain*getControlValue(false);
    }

    void draw(Graphics g) {
	setBbox(point1, point2, diamondSize);
	draw2Leads(g);
	g.setColor(needsHighlight() ? selectColor : lightGrayColor);
	setPowerColor(g, false);
	drawDiamond(g);
	drawThickLine(g, ashaft1, ashaft2);
	g.fillPolygon(arrow);
	current = getCurrent();
	doDots(g);
	drawPosts(g);
    }

    void getInfo(String arr[]) {
	super.getInfo(arr);
	if (broken)
	    arr[4] = "(no current path)";
    }
}
