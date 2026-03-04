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

import java.util.ArrayList;
import java.util.List;

    class RoutedWireElm extends WireElm {
	ArrayList<Point> routePoints;

	public RoutedWireElm(int xx, int yy) { super(xx, yy); }
	public RoutedWireElm(int xa, int ya, int xb, int yb, int f,
			     StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st);
	}

	int getDumpType() { return 0; }

	void setPoints() {
	    super.setPoints();
	    routePoints = new ArrayList<Point>();
	    routePoints.add(point1);

	    int gridSize = app.gridSize;
	    Rectangle bounds = UIManager.theUI.getCircuitBounds();
	    if (bounds == null) {
		routePoints.add(point2);
		return;
	    }

	    // grid coordinates: row = y/gridSize, col = x/gridSize
	    int maxRow = (bounds.y + bounds.height) / gridSize + 1;
	    int maxCol = (bounds.x + bounds.width) / gridSize + 1;
	    WireRouter router = new WireRouter(maxRow + 1, maxCol + 1);
	    router.initGrid(maxRow + 1, maxCol + 1, this);

	    List<int[]> path = router.routeWire(x / gridSize, y / gridSize, x2 / gridSize, y2 / gridSize);
	    if (path.size() < 2) {
		sim.console("routing failed");
		// fallback: simple L-shape
		routePoints.add(new Point(x2, y));
		routePoints.add(point2);
		return;
	    }
	    sim.console("route success");

	    // convert grid coords back to pixels, skip first and last (they're point1/point2)
	    for (int i = 1; i < path.size() - 1; i++) {
		int[] pt = path.get(i);
		routePoints.add(new Point(pt[1] * gridSize, pt[0] * gridSize));
	    }
	    routePoints.add(point2);
	}

	void draw(Graphics g) {
	    setVoltageColor(g, volts[0]);
	    for (int i = 0; i < routePoints.size() - 1; i++)
		drawThickLine(g, routePoints.get(i), routePoints.get(i + 1));
	    doDots(g);
	    setBbox(point1.x, point1.y, point2.x, point2.y);
	    String s = "";
	    if (mustShowCurrent()) {
		s = getShortUnitText(Math.abs(getCurrent()), "A");
	    }
	    if (mustShowVoltage()) {
		s = (s.length() > 0 ? s + " " : "") + getShortUnitText(volts[0], "V");
	    }
	    if (s.length() > 0)
		drawValues(g, s, 4);
	    drawPosts(g);
	}

	void doDots(Graphics g) {
	    updateDotCount();
	    if (isCreating())
		return;
	    double cc = curcount;
	    for (int i = 0; i < routePoints.size() - 1; i++) {
		Point a = routePoints.get(i);
		Point b = routePoints.get(i + 1);
		drawDots(g, a, b, cc);
		// offset by segment length for continuity
		double dx = b.x - a.x;
		double dy = b.y - a.y;
		double segLen = Math.sqrt(dx * dx + dy * dy);
		cc = addCurCount(cc, segLen);
	    }
	}

	int getMouseDistance(int gx, int gy) {
	    int thresh = 10;
	    int best = Integer.MAX_VALUE;
	    for (int i = 0; i < routePoints.size() - 1; i++) {
		Point a = routePoints.get(i);
		Point b = routePoints.get(i + 1);
		int d = lineDistanceSq(a.x, a.y, b.x, b.y, gx, gy);
		if (d < best)
		    best = d;
	    }
	    if (best <= thresh * thresh)
		return best;
	    return -1;
	}

	void getInfo(String arr[]) {
	    arr[0] = "routed wire";
	    arr[1] = "I = " + getCurrentDText(getCurrent());
	    arr[2] = "V = " + getVoltageText(volts[0]);
	}
    }
