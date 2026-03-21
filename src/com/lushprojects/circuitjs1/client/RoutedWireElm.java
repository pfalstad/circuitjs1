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

import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;

    class RoutedWireElm extends WireElm {
	ArrayList<Point> routePoints;

	public RoutedWireElm(int xx, int yy) { super(xx, yy); }
	public RoutedWireElm(int xa, int ya, int xb, int yb, int f,
			     StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st);
	}

	public RoutedWireElm(ArrayList<Point> points) {
	    super(points.get(0).x, points.get(0).y);
	    setPoints(points);
	}

	int getDumpType() { return 0; }
	String getXmlDumpType() { return "rw"; }

	void dumpXml(Document doc, Element elem) {
	    super.dumpXml(doc, elem);
	    if (routePoints != null && routePoints.size() > 0) {
		StringBuilder sb = new StringBuilder();
		for (int i = 0; i < routePoints.size(); i++) {
		    if (i > 0)
			sb.append(';');
		    Point p = routePoints.get(i);
		    sb.append(p.x).append(',').append(p.y);
		}
		elem.appendChild(doc.createTextNode(sb.toString()));
	    }
	}

	void undumpXml(XMLDeserializer xml) {
	    super.undumpXml(xml);
	    try {
		String contents = xml.parseContents();
		if (contents != null && contents.length() > 0) {
		    ArrayList<Point> points = new ArrayList<Point>();
		    String[] pairs = contents.split(";");
		    for (String pair : pairs) {
			String[] xy = pair.split(",");
			points.add(new Point(Integer.parseInt(xy[0]), Integer.parseInt(xy[1])));
		    }
		    if (points.size() >= 2)
			routePoints = points;
		}
	    } catch (Exception e) {}
	}

	int getShortcut() { return 'W'; }

	void setPoints() {
	    setPoints(true);
	}

	void setPoints(boolean routing) {
	    super.setPoints();

	    // if endpoints haven't changed, keep existing route
	    if (routePoints != null && routePoints.size() >= 2) {
		Point first = routePoints.get(0);
		Point last = routePoints.get(routePoints.size() - 1);
		if (first.x == x && first.y == y && last.x == x2 && last.y == y2)
		    return;
	    }

	    if (!routing) {
		// just set up a straight line, no routing
		routePoints = new ArrayList<Point>();
		routePoints.add(point1);
		routePoints.add(point2);
		return;
	    }

	    WireRouter router = new WireRouter();
	    router.initGrid(this);

	    routePoints = router.routeWire(x, y, x2, y2);
	    if (routePoints.size() < 2) {
		sim.console("routing failed");
		// fallback: simple L-shape
		routePoints = new ArrayList<Point>();
		routePoints.add(point1);
		routePoints.add(new Point(x2, y));
		routePoints.add(point2);
		return;
	    }
	    sim.console("route success");
	}

	void setPoints(ArrayList<Point> points) {
	    Point first = points.get(0);
	    Point last = points.get(points.size() - 1);
	    x = first.x; y = first.y;
	    x2 = last.x; y2 = last.y;
	    setPoints(false);
	    routePoints = points;
	}

	// split this routed wire at the point nearest (mx, my).
	// returns the new second-half wire, or null if split is not possible.
	RoutedWireElm split(int mx, int my) {
	    if (routePoints == null || routePoints.size() < 2)
		return null;

	    // find the nearest segment
	    int bestSeg = -1;
	    int bestDist = Integer.MAX_VALUE;
	    for (int i = 0; i < routePoints.size() - 1; i++) {
		Point a = routePoints.get(i);
		Point b = routePoints.get(i + 1);
		int d = lineDistanceSq(a.x, a.y, b.x, b.y, mx, my);
		if (d < bestDist) {
		    bestDist = d;
		    bestSeg = i;
		}
	    }

	    Point a = routePoints.get(bestSeg);
	    Point b = routePoints.get(bestSeg + 1);

	    // snap the click point onto the segment (horizontal or vertical)
	    int sx, sy;
	    if (a.x == b.x) {
		sx = a.x;
		sy = snapGrid(my);
		sy = Math.max(Math.min(a.y, b.y), Math.min(sy, Math.max(a.y, b.y)));
	    } else {
		sy = a.y;
		sx = snapGrid(mx);
		sx = Math.max(Math.min(a.x, b.x), Math.min(sx, Math.max(a.x, b.x)));
	    }

	    // don't split at an existing endpoint
	    if ((sx == x && sy == y) || (sx == x2 && sy == y2))
		return null;

	    // build route points for the two halves
	    ArrayList<Point> rp1 = new ArrayList<Point>();
	    for (int i = 0; i <= bestSeg; i++)
		rp1.add(routePoints.get(i));
	    rp1.add(new Point(sx, sy));

	    ArrayList<Point> rp2 = new ArrayList<Point>();
	    rp2.add(new Point(sx, sy));
	    for (int i = bestSeg + 1; i < routePoints.size(); i++)
		rp2.add(routePoints.get(i));

	    // update this wire to be the first half
	    setPoints(rp1);

	    // create and return the second half
	    return new RoutedWireElm(rp2);
	}

	// reroute this wire through an intermediate point
	void rerouteVia(int vx, int vy) {
	    WireRouter router = new WireRouter();
	    router.initGrid(this);
	    ArrayList<Point> rp1 = router.routeWire(x, y, vx, vy);
	    if (rp1.size() < 2)
		return;

	    // write the first route into the grid so the second avoids it
	    for (int i = 0; i < rp1.size() - 1; i++) {
		Point a = rp1.get(i);
		Point b = rp1.get(i + 1);
		router.addWire(a.x, a.y, b.x, b.y);
	    }

	    ArrayList<Point> rp2 = router.routeWire(vx, vy, x2, y2);
	    if (rp2.size() < 2)
		return;

	    // combine the two routes, removing the duplicate via point
	    ArrayList<Point> combined = new ArrayList<Point>(rp1);
	    for (int i = 1; i < rp2.size(); i++)
		combined.add(rp2.get(i));
	    routePoints = combined;
	}

	void addRoutingObstacle(WireRouter router) {
	    if (routePoints == null)
		return;
	    for (int i = 0; i < routePoints.size() - 1; i++) {
		Point a = routePoints.get(i);
		Point b = routePoints.get(i + 1);
		router.addWire(a.x, a.y, b.x, b.y);
	    }
	}

	void draw(Graphics g) {
	    setVoltageColor(g, volts[0]);
	    if (busWidth > 1)
		g.setLineWidth(5.0);
	    for (int i = 0; i < routePoints.size() - 1; i++)
		drawThickLine(g, routePoints.get(i), routePoints.get(i + 1));
	    if (busWidth > 1)
		g.setLineWidth(1.0);
	    doDots(g);

	    final int m = 5;
	    int minX = point1.x, minY = point1.y, maxX = point1.x, maxY = point1.y;
	    for (int i = 1; i < routePoints.size(); i++) {
		Point p = routePoints.get(i);
		minX = min(minX, p.x);
		minY = min(minY, p.y);
		maxX = max(maxX, p.x);
		maxY = max(maxY, p.y);
	    }
	    setBbox(minX - m, minY - m, maxX + m, maxY + m);
	    String s = "";
	    if (busWidth > 1 && mustShowBusValue()) {
		int value = getBusValue();
		s = ""+value;
	    } else if (busWidth == 1) {
		if (mustShowCurrent())
		    s = getShortUnitText(Math.abs(getCurrent()), "A");
		if (mustShowVoltage())
		    s = (s.length() > 0 ? s + " " : "") + getShortUnitText(volts[0], "V");
	    }
	    if (s.length() > 0)
		drawValuesOnLongestSegment(g, s);
	    drawPosts(g);
	}

	void drawValuesOnLongestSegment(Graphics g, String s) {
	    // find longest segment
	    double bestLen = 0;
	    int bestSeg = 0;
	    for (int i = 0; i < routePoints.size() - 1; i++) {
		Point a = routePoints.get(i);
		Point b = routePoints.get(i + 1);
		double dx = b.x - a.x;
		double dy = b.y - a.y;
		double len = dx * dx + dy * dy;
		if (len > bestLen) {
		    bestLen = len;
		    bestSeg = i;
		}
	    }
	    Point a = routePoints.get(bestSeg);
	    Point b = routePoints.get(bestSeg + 1);
	    int mx = (a.x + b.x) / 2;
	    int my = (a.y + b.y) / 2;
	    g.setFont(unitsFont);
	    int w = (int)g.context.measureText(s).getWidth();
	    int ya = (int)g.currentFontSize/2;
	    g.setColor(whiteColor);
	    if (a.y == b.y)
		// horizontal segment: draw above
		g.drawString(s, mx - w/2, my - 6);
	    else
		// vertical segment: draw to the right
		g.drawString(s, mx + 4, my + ya);
	}

	void doDots(Graphics g) {
	    updateDotCount();
	    if (isCreating() || curcount == 0)
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

	// return the snapped point on the wire nearest to (mx, my), or null
	Point getSnapPointOnWire(int mx, int my) {
	    if (routePoints == null || routePoints.size() < 2)
		return null;

	    int bestSeg = -1;
	    int bestDist = Integer.MAX_VALUE;
	    for (int i = 0; i < routePoints.size() - 1; i++) {
		Point a = routePoints.get(i);
		Point b = routePoints.get(i + 1);
		int d = lineDistanceSq(a.x, a.y, b.x, b.y, mx, my);
		if (d < bestDist) {
		    bestDist = d;
		    bestSeg = i;
		}
	    }

	    Point a = routePoints.get(bestSeg);
	    Point b = routePoints.get(bestSeg + 1);

	    int sx, sy;
	    if (a.x == b.x) {
		sx = a.x;
		sy = snapGrid(my);
		//sy = Math.max(Math.min(a.y, b.y), Math.min(sy, Math.max(a.y, b.y)));
	    } else {
		sy = a.y;
		sx = snapGrid(mx);
		//sx = Math.max(Math.min(a.x, b.x), Math.min(sx, Math.max(a.x, b.x)));
	    }

	    return new Point(sx, sy);
	}

	void getInfo(String arr[]) {
	    super.getInfo(arr);
	    arr[0] = (busWidth > 1) ? "routed bus wire (" + busWidth + ")" : "routed wire";
	}
    }
