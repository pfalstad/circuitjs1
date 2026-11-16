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

#pragma once

#include "WireElm.h"

class RoutedWireElm : public WireElm {
public:
    ELM_CLASS(RoutedWireElm)
    // the path, from point1 to point2 (empty: none yet; TS: null)
    std::vector<Point> routePoints;

    RoutedWireElm(int xx, int yy) : WireElm(xx, yy) {}
    RoutedWireElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : WireElm(xa, ya, xb, yb, f, st) {}
    // a new routed wire along the given path (TS: new RoutedWireElm(points))
    static RoutedWireElm *create(const std::vector<Point> &points);

    int getDumpType() override { return 0; }
    std::string getXmlDumpType() override { return "rw"; }
    bool isRoutedWireElm() override { return true; }

    // RoutedWireElm routes around other elements' posts rather than splitting to
    // connect to them, so don't auto-split like a plain WireElm would.
    void draggingDone() override {}

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void move(int dx, int dy) override;
    int getShortcut() override { return 'W'; }
    void setPoints() override { setPointsRouting(true); }
    void setPointsRouting(bool routing);
    // set the path (TS: setPoints(points))
    void setRoutePoints(const std::vector<Point> &points);
    // split this routed wire at the point nearest (mx, my)
    WireElm *split(int mx, int my) override;
    void selectRect(const Rectangle &r, bool add) override;
    // test whether an axis-aligned segment (a-b) intersects rectangle r
    static bool segmentIntersectsRect(const Point &a, const Point &b, const Rectangle &r);
    bool pointOnWireInterior(int px, int py) override;
    void rerouteVia(int vx, int vy);
    void addRoutingObstacle(WireRouter &router) override;
    void draw(Graphics &g) override;
    void drawValuesOnLongestSegment(Graphics &g, const std::string &s);
    void doDots(Graphics &g);
    double getMouseDistance(int gx, int gy) override;
    static int segmentDistanceSq(int ax, int ay, int bx, int by, int gx, int gy);
    bool pointOnPath(const Point &p);
    std::optional<Point> getSnapPointOnWire(int mx, int my);
    void getInfo(std::vector<std::string> &arr) override;
};
