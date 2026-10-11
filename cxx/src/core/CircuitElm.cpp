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

#include "CircuitElm.h"

#include "WireRouter.h"

#include <cmath>

#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "FindPathInfo.h"
#include "JsNumber.h"
#include "ScopeConstants.h"
#include "SimApp.h"
#include "SimulationManager.h"
#include "StringTokenizer.h"
#include "XmlDoc.h"

double CircuitElm::voltageRange = 5;
SimApp *CircuitElm::app = nullptr;
SimulationManager *CircuitElm::sim = nullptr;
CircuitElm *CircuitElm::mouseElmRef = nullptr;

static int imin(int a, int b) { return a < b ? a : b; }

CircuitElm::CircuitElm(int xx, int yy) {
    x = x2 = xx;
    y = y2 = yy;
    flags = getDefaultFlags();
    allocNodes();
    initBoundingBox();
}

CircuitElm::CircuitElm(int xa, int ya, int xb, int yb, int f) {
    x = xa; y = ya; x2 = xb; y2 = yb; flags = f;
    allocNodes();
    initBoundingBox();
}

std::string CircuitElm::getXmlDumpType() {
    int t = getDumpType();
    if (t > 64 && t < 127)
        return std::string(1, (char) t);
    std::string s = getClassName();
    size_t p = s.find("Elm");
    if (p != std::string::npos)
        s.erase(p, 3);
    return s;
}

void CircuitElm::initBoundingBox() {
    boundingBox.setBounds(imin(x, x2), imin(y, y2), std::abs(x2 - x) + 1, std::abs(y2 - y) + 1);
}

void CircuitElm::allocNodes() {
    int n = getNodeCount();
    if (n == 0)
        n = 1;
    if ((int) nodes.size() != n)
        nodes.assign(n, CircuitNode::ground);
}

std::string CircuitElm::dump() {
    int t = getDumpType();
    return (t < 127 ? std::string(1, (char) t) + " " : std::to_string(t) + " ") +
        std::to_string(x) + " " + std::to_string(y) + " " +
        std::to_string(x2) + " " + std::to_string(y2) + " " + std::to_string(flags);
}

void CircuitElm::deleteElm() {
    if (mouseElmRef == this)
        mouseElmRef = nullptr;
    app->deleteSliders(this);
    app->elementDeleted(this);
}

void CircuitElm::setPoints() {
    dx = x2 - x;
    dy = y2 - y;
    dn = std::sqrt((double) dx * dx + (double) dy * dy);
    dpx1 = dy / dn;
    dpy1 = -dx / dn;
    dsign = (dy == 0) ? sign(dx) : sign(dy);
    point1 = Point(x, y);
    point2 = Point(x2, y2);
}

void CircuitElm::calcLeads(int len) {
    leadsSet = true;
    if (dn < len || len == 0) {
        lead1 = point1;
        lead2 = point2;
        return;
    }
    lead1 = interpPoint(point1, point2, (dn - len) / (2 * dn));
    lead2 = interpPoint(point1, point2, (dn + len) / (2 * dn));
}

bool CircuitElm::pointOnSegmentInterior(int ax, int ay, int bx, int by, int px, int py) {
    if ((px == ax && py == ay) || (px == bx && py == by))
        return false;
    if (ax == bx && px == ax) {
        int miny = std::min(ay, by), maxy = std::max(ay, by);
        return py > miny && py < maxy;
    } else if (ay == by && py == ay) {
        int minx = std::min(ax, bx), maxx = std::max(ax, bx);
        return px > minx && px < maxx;
    }
    return false;
}

int CircuitElm::getLeadPost(int px, int py) {
    // (the TS version's leads are null until set; some elements set them without calcLeads())
    bool hasLeads = leadsSet || lead1 != Point() || lead2 != Point();
    if (hasLeads && lead1 != point1 &&
        pointOnSegmentInterior(point1.x, point1.y, lead1.x, lead1.y, px, py))
        return 0;
    if (hasLeads && lead2 != point2 &&
        pointOnSegmentInterior(lead2.x, lead2.y, point2.x, point2.y, px, py))
        return 1;
    // 1-post elements with no explicit leads (e.g. GroundElm): the whole point1→point2 segment is the lead
    if (!hasLeads && getPostCount() == 1 &&
        pointOnSegmentInterior(point1.x, point1.y, point2.x, point2.y, px, py))
        return 0;
    return -1;
}

void CircuitElm::adjustLeadsToGrid(bool flipX, bool flipY) {
    double cx = (point1.x + point2.x) / 2.0;
    double cy = (point1.y + point2.y) / 2.0;

    // when flipping, it changes the rounding direction.  need to adjust for this
    int roundx = flipX ? 1 : -1;
    int roundy = flipY ? 1 : -1;

    // snapGrid works on integers (JS bitwise ops truncate)
    double adjx = snapGrid((int) (cx + roundx)) - cx;
    double adjy = snapGrid((int) (cy + roundy)) - cy;
    lead1.move((int) adjx, (int) adjy);
    lead2.move((int) adjx, (int) adjy);
}

Point CircuitElm::interpPoint(const Point &a, const Point &b, double f) {
    Point p;
    interpPoint(a, b, p, f);
    return p;
}

// Convert an interpolated coordinate to int.  In TS a NaN coordinate stays NaN and
// the canvas skips it; casting NaN (or a huge value) to int is undefined in C++ and
// gives 0 on arm64, which drew stray lines to the origin (e.g. very short NOR gates
// divide by zero in setPoints()).  Fall back to the start point instead.
static int interpCoord(double v, int fallback) {
    if (!std::isfinite(v) || std::fabs(v) > 1e9)
        return fallback;
    return (int) std::floor(v);
}

void CircuitElm::interpPoint(const Point &a, const Point &b, Point &c, double f) {
    c.x = interpCoord(a.x * (1 - f) + b.x * f + .48, a.x);
    c.y = interpCoord(a.y * (1 - f) + b.y * f + .48, a.y);
}

void CircuitElm::interpPoint(const Point &a, const Point &b, Point &c, double f, double g) {
    int gx = b.y - a.y;
    int gy = a.x - b.x;
    g /= std::sqrt((double) gx * gx + (double) gy * gy);
    c.x = interpCoord(a.x * (1 - f) + b.x * f + g * gx + .48, a.x);
    c.y = interpCoord(a.y * (1 - f) + b.y * f + g * gy + .48, a.y);
}

Point CircuitElm::interpPoint(const Point &a, const Point &b, double f, double g) {
    Point p;
    interpPoint(a, b, p, f, g);
    return p;
}

void CircuitElm::interpPoint2(const Point &a, const Point &b, Point &c, Point &d, double f, double g) {
    int gx = b.y - a.y;
    int gy = a.x - b.x;
    g /= std::sqrt((double) gx * gx + (double) gy * gy);
    c.x = interpCoord(a.x * (1 - f) + b.x * f + g * gx + .48, a.x);
    c.y = interpCoord(a.y * (1 - f) + b.y * f + g * gy + .48, a.y);
    d.x = interpCoord(a.x * (1 - f) + b.x * f - g * gx + .48, a.x);
    d.y = interpCoord(a.y * (1 - f) + b.y * f - g * gy + .48, a.y);
}

int CircuitElm::snapGrid(int z) { return app->snapGrid(z); }

void CircuitElm::drag(int xx, int yy) {
    xx = snapGrid(xx);
    yy = snapGrid(yy);
    if (noDiagonal) {
        if (std::abs(x - xx) < std::abs(y - yy))
            xx = x;
        else
            yy = y;
    }
    x2 = xx;
    y2 = yy;
    setPoints();
}

void CircuitElm::dragPlace(int xa, int ya, bool vertical) {
    vertical = getDragVertical(vertical);
    int len = getDragLength();
    x = xa;
    y = ya;
    x2 = xa + (vertical ? 0 : len);
    y2 = ya + (vertical ? len : 0);
    setPoints();
}

void CircuitElm::swapDragEndpoints() {
    int tx = x, ty = y;
    x = x2; y = y2;
    x2 = tx; y2 = ty;
    setPoints();
}

void CircuitElm::move(int ddx, int ddy) {
    x += ddx; y += ddy; x2 += ddx; y2 += ddy;
    boundingBox.translate(ddx, ddy);
    setPoints();
}

void CircuitElm::setPosition(int x_, int y_, int x2_, int y2_) {
    x = x_;
    y = y_;
    x2 = x2_;
    y2 = y2_;
    initBoundingBox();
    setPoints();
}

void CircuitElm::setPositionFromXml(const XmlElement *elem) {
    const std::string *xs = elem->getAttribute("x");
    if (xs == nullptr)
        return;
    StringTokenizer st(*xs, " ");
    int a = parseIntStrict(st.nextToken());
    int b = parseIntStrict(st.nextToken());
    int c = parseIntStrict(st.nextToken());
    int d = parseIntStrict(st.nextToken());
    setPosition(a, b, c, d);
}

bool CircuitElm::allowMove(int ddx, int ddy) {
    int nx = x + ddx;
    int ny = y + ddy;
    int nx2 = x2 + ddx;
    int ny2 = y2 + ddy;
    for (CircuitElm *ce : app->elmList) {
        if (ce->x == nx && ce->y == ny && ce->x2 == nx2 && ce->y2 == ny2)
            return false;
        if (ce->x == nx2 && ce->y == ny2 && ce->x2 == nx && ce->y2 == ny)
            return false;
    }
    return true;
}

void CircuitElm::movePoint(int n, int ddx, int ddy) {
    // modified by IES to prevent the user dragging points to create zero sized nodes
    // that then render improperly
    int oldx = x, oldy = y, oldx2 = x2, oldy2 = y2;
    if (noDiagonal) {
        if (x == x2)
            ddx = 0;
        else
            ddy = 0;
    }
    if (n == 0) {
        x += ddx; y += ddy;
    } else {
        x2 += ddx; y2 += ddy;
    }
    if (x == x2 && y == y2) {
        x = oldx;
        y = oldy;
        x2 = oldx2;
        y2 = oldy2;
    }
    setPoints();
}

void CircuitElm::flipX(int center2, int) {
    x = center2 - x;
    x2 = center2 - x2;
    initBoundingBox();
    setPoints();
}

void CircuitElm::flipY(int center2, int) {
    y = center2 - y;
    y2 = center2 - y2;
    initBoundingBox();
    setPoints();
}

void CircuitElm::flipXY(int xmy, int) {
    int nx = y + xmy;
    int ny = x - xmy;
    int nx2 = y2 + xmy;
    int ny2 = x2 - xmy;
    x = nx; y = ny; x2 = nx2; y2 = ny2;
    initBoundingBox();
    setPoints();
}

void CircuitElm::setNode(int p, const NodeRef &n) {
    // JS arrays grow on assignment
    if (p >= (int) nodes.size())
        nodes.resize(p + 1);
    // a reference node is one we only observe, so don't push our stale voltage onto it
    if (isRefNode(p)) {
        nodes[p] = n;
        return;
    }
    double v = 0;

    // preserve voltages if possible
    if (nodes[p])
        v = nodes[p]->v;
    nodes[p] = n;
    if (v != 0 && nodes[p]->index > 0)
        nodes[p]->v = v;
}

void CircuitElm::getWireSegments(std::vector<std::unique_ptr<WireSegment>> &list) {
    int bw = getBusWidth();
    for (int b = 0; b < bw; b++) {
        Point p0 = getPost(b);
        std::optional<Point> p1 = getConnectedPost(b);
        std::string ep0 = SimulationManager::pointKey(p0);
        std::optional<std::string> ep1;
        if (p1 && !p1->equals(p0))
            ep1 = SimulationManager::pointKey(*p1);
        list.push_back(std::make_unique<WireSegment>(this, b, ep0, ep1));
    }
}

int CircuitElm::getNodeAtPoint(const Point &pt) {
    for (int i = 0; i != getPostCount(); i++) {
        if (getPost(i).equals(pt))
            return i;
    }
    return 0;
}

void CircuitElm::setBbox(double x1, double y1, double xb, double yb) {
    if (x1 > xb) { double q = x1; x1 = xb; xb = q; }
    if (y1 > yb) { double q = y1; y1 = yb; yb = q; }
    boundingBox.setBounds(x1, y1, xb - x1 + 1, yb - y1 + 1);
}

void CircuitElm::setBbox(const Point &p1, const Point &p2, double w) {
    setBbox(p1.x, p1.y, p2.x, p2.y);
    int dpx = (int) (dpx1 * w);
    int dpy = (int) (dpy1 * w);
    adjustBbox(p1.x + dpx, p1.y + dpy, p1.x - dpx, p1.y - dpy);
}

void CircuitElm::adjustBbox(double x1, double y1, double xb, double yb) {
    if (x1 > xb) { double q = x1; x1 = xb; xb = q; }
    if (y1 > yb) { double q = y1; y1 = yb; yb = q; }
    x1 = std::min(boundingBox.x, x1);
    y1 = std::min(boundingBox.y, y1);
    xb = std::max(boundingBox.x + boundingBox.width, xb);
    yb = std::max(boundingBox.y + boundingBox.height, yb);
    boundingBox.setBounds(x1, y1, xb - x1, yb - y1);
}

double CircuitElm::getScopeValue(int v) {
    using namespace ScopeConstants;
    return (v == VAL_CURRENT) ? getCurrent() : (v == VAL_POWER) ? getPower() : getVoltageDiff();
}

int CircuitElm::getScopeUnits(int v) {
    using namespace ScopeConstants;
    return (v == VAL_CURRENT) ? UNITS_A : (v == VAL_POWER) ? UNITS_W : UNITS_V;
}

void CircuitElm::selectRect(const Rectangle &r, bool add) {
    if (r.intersects(boundingBox))
        selected = true;
    else if (!add)
        selected = false;
}

double CircuitElm::distance(const Point &p1, const Point &p2) {
    double xx = p1.x - p2.x;
    double yy = p1.y - p2.y;
    return std::sqrt(xx * xx + yy * yy);
}

bool CircuitElm::showValues() { return app->options.showValues; }
bool CircuitElm::showPower() { return app->options.power; }
bool CircuitElm::showEuroResistors() { return app->options.euroResistor; }
bool CircuitElm::showOhmSymbol() { return app->options.showOhm; }
bool CircuitElm::useSmallGrid() { return app->options.smallGrid; }
bool CircuitElm::doDcAnalysis() { return app->dcAnalysisFlag; }

bool CircuitElm::validateRailNode(int n) {
    FindPathInfo fpi(FindPathInfo::VOLTAGE, this, getNode(n), sim);
    if (fpi.findPath(CircuitNode::ground)) {
        sim->stop("Path to ground with no resistance!", this);
        return false;
    }
    return true;
}

void CircuitElm::setMouseElm(bool v) {
    if (v)
        mouseElmRef = this;
    else if (mouseElmRef == this)
        mouseElmRef = nullptr;
}

double CircuitElm::lineDistanceSq(double xa, double ya, double xb, double yb, double gx, double gy) {
    double dtop = (yb - ya) * gx - (xb - xa) * gy + xb * ya - yb * xa;
    double dbot = (yb - ya) * (yb - ya) + (xb - xa) * (xb - xa);
    return dtop * dtop / dbot;
}

double CircuitElm::getMouseDistance(int gx, int gy) {
    if (getPostCount() == 0) {
        double cx = (x2 + x) / 2.0 - gx, cy = (y2 + y) / 2.0 - gy;
        return cx * cx + cy * cy;
    }
    return lineDistanceSq(x, y, x2, y2, gx, gy);
}

double CircuitElm::getCurrentIntoNode(int n) {
    // no current flows into a node we only refer to by name
    if (isRefNode(n))
        return 0;
    // if we take out the getPostCount() == 2 it gives the wrong value for rails
    if (n == 0 && getPostCount() == 2)
        return -current;
    return current;
}

void CircuitElm::flipPosts() {
    int oldx = x, oldy = y;
    x = x2;
    y = y2;
    x2 = oldx;
    y2 = oldy;
    setPoints();
}

void CircuitElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitXMLSerializer::dumpAttr(elem, "x", std::to_string(x) + " " + std::to_string(y) + " " +
                                   std::to_string(x2) + " " + std::to_string(y2));
    // can't skip this when 0 because some elements set flags to a nonzero value in constructor
    CircuitXMLSerializer::dumpAttr(elem, "f", flags);
}

void CircuitElm::undumpXml(CircuitXMLDeserializer &xml) {
    flags = xml.parseIntAttr("f", flags);
}

void CircuitElm::addRoutingObstacle(WireRouter &router) {
    if (x == x2 || y == y2) {
        router.addWire(x, y, x2, y2);
        if (leadsSet)
            router.addObstacle(lead1.x, lead1.y, lead2.x, lead2.y);
    }
}

void CircuitElm::addRoutingObstacleWithLeads(WireRouter &router, double width) {
    if (x == x2 || y == y2) {
        router.addWire(x, y, x2, y2);
        Point pa = interpPoint(lead1, lead2, 0, width);
        Point pb = interpPoint(lead1, lead2, 1, -width);
        router.addObstacle(pa.x, pa.y, pb.x, pb.y);
    }
}
