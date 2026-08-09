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

import com.google.gwt.canvas.dom.client.Context2d;

    class AndGateElm extends GateElm {
	public AndGateElm(int xx, int yy) { super(xx, yy); }
	public AndGateElm(int xa, int ya, int xb, int yb, int f,
			  StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st);
	}
	
	String getGateText() { return "&"; }
	
	public final native void ellipse(Context2d g, double x, double y, double rx, double ry, double ro, double sa, double ea, boolean ccw) /*-{
	    if (rx >= 0 && ry >= 0) g.ellipse(x, y, rx, ry, ro, sa, ea, ccw);
	}-*/;

	void drawGatePolygon(Graphics g) {
	    g.setLineWidth(3.0);
	    g.context.beginPath();
		if (hasFlag(FLAG_DEMORGAN))
		{
			g.context.moveTo(gatePoly.xpoints[0], gatePoly.ypoints[0]);
			g.context.lineTo(gatePoly.xpoints[1], gatePoly.ypoints[1]);
			g.context.bezierCurveTo(
				gatePoly.xpoints[2], gatePoly.ypoints[2],
				gatePoly.xpoints[2], gatePoly.ypoints[2],
				gatePoly.xpoints[3], gatePoly.ypoints[3]);
			g.context.bezierCurveTo(
				gatePoly.xpoints[4], gatePoly.ypoints[4],
				gatePoly.xpoints[4], gatePoly.ypoints[4],
				gatePoly.xpoints[5], gatePoly.ypoints[5]);
			g.context.lineTo(gatePoly.xpoints[6], gatePoly.ypoints[6]);
			g.context.bezierCurveTo(
				gatePoly.xpoints[7], gatePoly.ypoints[7],
				gatePoly.xpoints[7], gatePoly.ypoints[7],
				gatePoly.xpoints[0], gatePoly.ypoints[0]);
		}
		else
		{
			g.context.moveTo(gatePoly.xpoints[0], gatePoly.ypoints[0]);
			g.context.lineTo(gatePoly.xpoints[1], gatePoly.ypoints[1]);
			g.context.bezierCurveTo(
				gatePoly.xpoints[1], gatePoly.ypoints[1],
				gatePoly.xpoints[2], gatePoly.ypoints[2],
				gatePoly.xpoints[3], gatePoly.ypoints[3]);
			g.context.bezierCurveTo(
				gatePoly.xpoints[3], gatePoly.ypoints[3],
				gatePoly.xpoints[4], gatePoly.ypoints[4],
				gatePoly.xpoints[5], gatePoly.ypoints[5]);
			g.context.lineTo(gatePoly.xpoints[6], gatePoly.ypoints[6]);
		}
	    g.context.closePath();
	    g.context.stroke();
	    g.setLineWidth(1.0);
	}
	
	void setPoints() {
	    super.setPoints();
	 
	    if (useEuroGates()) {
		createEuroGatePolygon();
	    } else {
			Point triPoints[] = newPointArray(11);
			// 0 = top left, 1 = top of curve, 2 = bezier, 3 = center,
			// 4 = bezier, 5 = bottom of curve, 6 = bottom left
			if (hasFlag(FLAG_DEMORGAN))
			{
				interpPoint2(lead1, lead2, triPoints[0], triPoints[6], 0, hs2);
				interpPoint2(lead1, lead2, triPoints[1], triPoints[5], .3, hs2);
				triPoints[3] = lead2;
				interpPoint2(lead1, lead2, triPoints[2], triPoints[4], .733, hs2*.85);
				interpPoint(lead1, lead2, triPoints[7], .105);
			}
			else
			{
				interpPoint2(lead1, lead2, triPoints[0], triPoints[6], 0, hs2);
				interpPoint2(lead1, lead2, triPoints[1], triPoints[5], .5, hs2);
				interpPoint2(lead1, lead2, triPoints[2], triPoints[4], 1, hs2);
				interpPoint(lead1, lead2, triPoints[3], 1);
			}
		gatePoly = createPolygon(triPoints);
	    }
	    if (isInverting() ^ hasFlag(FLAG_DEMORGAN)) {
			pcircle = interpPoint(point1, point2, .5+(ww+4)/dn);
			lead2 = interpPoint(point1, point2, .5+(ww+8)/dn);
	    }
	}
	String getGateName() { return "AND gate"; }
	boolean calcFunction() {
	    int i;
	    boolean f = true;
	    for (i = 0; i != inputCount; i++)
		f &= getInput(i);
	    return f;
	}
	int getDumpType() { return 150; }
	int getShortcut() { return '2'; }
    }
