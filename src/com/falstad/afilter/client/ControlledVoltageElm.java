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

// Two-terminal controlled voltage source: the diamond symbol with + and - inside.
// Output voltage (post 2 relative to post 1) is gain times the control.
class ControlledVoltageElm extends ControlledSourceElm {
    public ControlledVoltageElm(int xx, int yy) { super(xx, yy); }
    public ControlledVoltageElm(int xa, int ya, int xb, int yb, int f,
				StringTokenizer st) {
	super(xa, ya, xb, yb, f, st);
    }

    String getDefaultExpr() { return "v(in)"; }
    String getXmlDumpType() { return "cv"; }
    String getElmType() { return "controlled voltage source"; }

    int getVoltageSourceCount() { return 1; }

    void stamp() {
	sim.stampVoltageSource(nodes[0], nodes[1], voltSource, 0);
	if (!resolve())
	    return;
	if (currentControl)
	    sim.stampCCVS(voltSource, refVS, gain);
	else
	    sim.stampVCVS(refPos, refNeg, new Complex(-gain, 0), voltSource);
    }

    void polyStamp() {
	sim.stampPolyVoltageSource(nodes[0], nodes[1], voltSource, 0);
	if (!resolve())
	    return;
	// everything in the poly matrix is multiplied by s
	if (currentControl)
	    sim.stampPolyCCVS(voltSource, refVS, new Polynomial(0, gain));
	else
	    sim.stampPolyVCVS(refPos, refNeg, new Polynomial(0, -gain), voltSource);
    }

    void draw(Graphics g) {
	setBbox(point1, point2, diamondSize);
	draw2Leads(g);
	g.setColor(needsHighlight() ? selectColor : lightGrayColor);
	setPowerColor(g, false);
	drawDiamond(g);

	// post 2 is the + terminal, matching VoltageElm
	g.setFont(new Font("SansSerif", 0, 12));
	Point pm = interpPoint(lead1, lead2, .3);
	Point pp = interpPoint(lead1, lead2, .7);
	drawCenteredText(g, "−", pm.x, pm.y, true);
	drawCenteredText(g, "+", pp.x, pp.y, true);

	doDots(g);
	drawPosts(g);
    }
}
