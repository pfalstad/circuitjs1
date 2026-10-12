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

package com.falstad.afilter.client;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;

    class WireElm extends CircuitElm {
	public WireElm(int xx, int yy) { super(xx, yy); }
	public WireElm(int xa, int ya, int xb, int yb, int f,
		       StringTokenizer st) {
	    super(xa, ya, xb, yb, f);
	}
	static final int FLAG_SHOWCURRENT = 1;
	static final int FLAG_SHOWVOLTAGE = 2;
	void draw(Graphics g) {
	    setVoltageColor(g, volts[0]);
	    drawThickLine(g, point1, point2);
	    doDots(g);
	    setBbox(point1, point2, 3);
	    if (mustShowCurrent()) {
	        String s = getShortUnitText(Math.abs(getCurrent()), "A");
	        drawValues(g, s, 4);
	    } else if (mustShowVoltage()) {
	        String s = getShortUnitText(volts[0], "V");
	        drawValues(g, s, 4);
	    }
	    drawPosts(g);
	}
	void stamp() {
	    sim.stampVoltageSource(nodes[0], nodes[1], voltSource, 0);
	}
	void polyStamp() {
	    sim.stampPolyVoltageSource(nodes[0], nodes[1], voltSource, 0);
	}
	boolean mustShowCurrent() {
	    return (flags & FLAG_SHOWCURRENT) != 0;
	}
	boolean mustShowVoltage() {
	    return (flags & FLAG_SHOWVOLTAGE) != 0;
	}
	int getVoltageSourceCount() { return 1; }
	void getInfo(String arr[]) {
	    arr[0] = "wire";
	    arr[1] = "I = " + getCurrentDText(getCurrent());
	    arr[2] = "V = " + getVoltageText(volts[0]);
	}
	int getDumpType() { return 'w'; }
	double getPower() { return 0; }
	double getVoltageDiff() { return volts[0]; }
	boolean isWire() { return true; }
	public EditInfo getEditInfo(int n) {
	    if (n == 0) {
		EditInfo ei = new EditInfo("", 0, -1, -1);
		ei.checkbox = new Checkbox("Show Current", mustShowCurrent());
		return ei;
	    }
	    if (n == 1) {
		EditInfo ei = new EditInfo("", 0, -1, -1);
		ei.checkbox = new Checkbox("Show Voltage", mustShowVoltage());
		return ei;
	    }
	    return null;
	}
	public void setEditValue(int n, EditInfo ei) {
	    if (n == 0) {
		if (ei.checkbox.getState())
		    flags = FLAG_SHOWCURRENT;
		else
		    flags &= ~FLAG_SHOWCURRENT;
	    }
	    if (n == 1) {
		if (ei.checkbox.getState())
		    flags = FLAG_SHOWVOLTAGE;
		else
		    flags &= ~FLAG_SHOWVOLTAGE;
	    }
	}
        int getShortcut() { return 'w'; }

	boolean pointOnWireInterior(int px, int py) {
	    return pointOnSegmentInterior(x, y, x2, y2, px, py);
	}

	// split this wire at (px,py), returning the new second half
	WireElm split(int px, int py) {
	    WireElm newWire = new WireElm(px, py);
	    newWire.drag(x2, y2);
	    drag(px, py);
	    return newWire;
	}

	// True if some other 2-terminal element already connects (ax,ay) directly to
	// (bx,by). Used to avoid laying a redundant parallel wire segment on top of
	// an existing colinear element, which would create an electrical loop.
	boolean hasDirectConnection(int ax, int ay, int bx, int by) {
	    for (CircuitElm ce : sim.elmList) {
		if (ce == this || ce.getPostCount() != 2)
		    continue;
		Point p0 = ce.getPost(0);
		Point p1 = ce.getPost(1);
		if ((p0.x == ax && p0.y == ay && p1.x == bx && p1.y == by) ||
		    (p0.x == bx && p0.y == by && p1.x == ax && p1.y == ay))
		    return true;
	    }
	    return false;
	}

	// After a wire is newly drawn, split it at any point where another
	// element's post lies in its interior, so it connects there instead of just
	// crossing over it.  Any sub-segment that would duplicate an existing colinear
	// element is dropped instead of added, since adding it would just create a
	// parallel loop.
	void draggingDone() {
	    // only split at dead ends and real junctions (as of the last analysis, i.e. before
	    // this wire), not at plain pass-through connections between two elements, so we
	    // don't tap into an already-connected pair that isn't meant to be a distinct node.
	    ArrayList<Point> splitPoints = new ArrayList<Point>();
	    if (sim.nodeList != null)
		for (int i = 0; i != sim.nodeList.size(); i++) {
		    CircuitNode cn = sim.getCircuitNode(i);
		    if (cn.internal || cn.links.size() == 2)
			continue;
		    if (pointOnSegmentInterior(x, y, x2, y2, cn.x, cn.y))
			splitPoints.add(new Point(cn.x, cn.y));
		}
	    if (splitPoints.isEmpty())
		return;
	    final int x0 = x, y0 = y;
	    Collections.sort(splitPoints, new Comparator<Point>() {
		public int compare(Point a, Point b) {
		    long da = (long)(a.x-x0)*(a.x-x0) + (long)(a.y-y0)*(a.y-y0);
		    long db = (long)(b.x-x0)*(b.x-x0) + (long)(b.y-y0)*(b.y-y0);
		    return (da < db) ? -1 : ((da > db) ? 1 : 0);
		}
	    });
	    // full ordered list of boundary points: original endpoints plus dedup'd splits
	    ArrayList<Point> pts = new ArrayList<Point>();
	    pts.add(new Point(x, y));
	    for (Point p : splitPoints) {
		Point last = pts.get(pts.size() - 1);
		if (p.x != last.x || p.y != last.y)
		    pts.add(p);
	    }
	    Point last = pts.get(pts.size() - 1);
	    if (last.x != x2 || last.y != y2)
		pts.add(new Point(x2, y2));

	    boolean first = true;
	    for (int i = 0; i < pts.size() - 1; i++) {
		Point a = pts.get(i);
		Point b = pts.get(i + 1);
		if (hasDirectConnection(a.x, a.y, b.x, b.y))
		    continue;
		if (first) {
		    x = a.x; y = a.y;
		    drag(b.x, b.y);
		    first = false;
		} else {
		    WireElm seg = new WireElm(a.x, a.y);
		    seg.drag(b.x, b.y);
		    sim.elmList.addElement(seg);
		}
	    }
	    if (first) {
		sim.elmList.remove(this);
		delete();
	    }
	}
    }
