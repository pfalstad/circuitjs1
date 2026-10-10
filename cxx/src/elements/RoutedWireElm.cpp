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

#include "RoutedWireElm.h"

#include <algorithm>
#include <climits>
#include <cmath>
#include <cstdio>
#include <iostream>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/ElementFactory.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/WireRouter.h"
#include "../core/XmlDoc.h"

static const long MAX_SAFE_INTEGER = 9007199254740991L;

RoutedWireElm *RoutedWireElm::create(const std::vector<Point> &points) {
    RoutedWireElm *rw = static_cast<RoutedWireElm *>(ElementFactory::create("RoutedWireElm", points[0].x, points[0].y));
    rw->setRoutePoints(points);
    return rw;
}

void RoutedWireElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    WireElm::dumpXml(doc, elem);
    if (!routePoints.empty()) {
        std::string s;
        for (size_t i = 0; i != routePoints.size(); i++)
            s += (i ? ";" : "") + std::to_string(routePoints[i].x) + "," + std::to_string(routePoints[i].y);
        elem->text = s;
    }
}

void RoutedWireElm::undumpXml(CircuitXMLDeserializer &xml) {
    WireElm::undumpXml(xml);
    try {
        std::optional<std::string> contents = xml.parseContents();
        if (contents && !contents->empty()) {
            std::vector<Point> points;
            size_t p = 0;
            while (p <= contents->size()) {
                size_t e = contents->find(';', p);
                if (e == std::string::npos)
                    e = contents->size();
                std::string pair = contents->substr(p, e - p);
                size_t c = pair.find(',');
                points.emplace_back(parseIntStrict(pair.substr(0, c)),
                                    parseIntStrict(c == std::string::npos ? "" : pair.substr(c + 1)));
                p = e + 1;
            }
            if (points.size() >= 2)
                routePoints = points;
        }
    } catch (...) {}
}

void RoutedWireElm::move(int dx, int dy) {
    for (Point &p : routePoints)
        p.move(dx, dy);
    WireElm::move(dx, dy);
}

void RoutedWireElm::setRoutePoints(const std::vector<Point> &points) {
    const Point &first = points.front();
    const Point &last = points.back();
    x = first.x;
    y = first.y;
    x2 = last.x;
    y2 = last.y;
    WireElm::setPoints();
    routePoints = points;
}

void RoutedWireElm::setPointsRouting(bool routing) {
    WireElm::setPoints();

    // if endpoints haven't changed, keep existing route
    if (routePoints.size() >= 2) {
        const Point &first = routePoints.front();
        const Point &last = routePoints.back();
        if (first.x == x && first.y == y && last.x == x2 && last.y == y2)
            return;
    }

    if (!routing) {
        routePoints = {point1, point2};
        return;
    }

    WireRouter router;
    router.initGrid(this, app->gridSize, *app->uiElmList, app->getCircuitBounds());
    std::vector<Point> result = router.routeWire(x, y, x2, y2);
    if (result.size() < 2) {
        std::cerr << "routing failed\n";
        routePoints = {point1, Point(x2, y), point2};
        return;
    }
    routePoints = result;
}

WireElm *RoutedWireElm::split(int mx, int my) {
    if (routePoints.size() < 2)
        return nullptr;

    int bestSeg = -1;
    long bestDist = MAX_SAFE_INTEGER;
    for (size_t i = 0; i + 1 < routePoints.size(); i++) {
        const Point &a = routePoints[i];
        const Point &b = routePoints[i + 1];
        long d = segmentDistanceSq(a.x, a.y, b.x, b.y, mx, my);
        if (d < bestDist) {
            bestDist = d;
            bestSeg = (int) i;
        }
    }

    Point a = routePoints[bestSeg];
    Point b = routePoints[bestSeg + 1];

    int sx, sy;
    if (a.x == b.x) {
        sx = a.x;
        sy = snapGrid(my);
        sy = std::max(std::min(a.y, b.y), std::min(sy, std::max(a.y, b.y)));
    } else {
        sy = a.y;
        sx = snapGrid(mx);
        sx = std::max(std::min(a.x, b.x), std::min(sx, std::max(a.x, b.x)));
    }

    if ((sx == x && sy == y) || (sx == x2 && sy == y2))
        return nullptr;

    // if the split point landed exactly on a bend vertex, avoid adding
    // a duplicate point for it on either half
    bool atA = (sx == a.x && sy == a.y);
    bool atB = (sx == b.x && sy == b.y);

    std::vector<Point> rp1;
    for (int i = 0; i <= bestSeg; i++)
        rp1.push_back(routePoints[i]);
    if (!atA)
        rp1.emplace_back(sx, sy);

    std::vector<Point> rp2 = {Point(sx, sy)};
    for (size_t i = bestSeg + 1; i < routePoints.size(); i++) {
        if ((int) i == bestSeg + 1 && atB)
            continue;
        rp2.push_back(routePoints[i]);
    }

    setRoutePoints(rp1);
    return create(rp2);
}

void RoutedWireElm::selectRect(const Rectangle &r, bool add) {
    if (routePoints.size() < 2) {
        WireElm::selectRect(r, add);
        return;
    }
    bool hit = false;
    for (size_t i = 0; i + 1 < routePoints.size() && !hit; i++)
        if (segmentIntersectsRect(routePoints[i], routePoints[i + 1], r))
            hit = true;
    if (hit)
        selected = true;
    else if (!add)
        selected = false;
}

bool RoutedWireElm::segmentIntersectsRect(const Point &a, const Point &b, const Rectangle &r) {
    double rx1 = r.x, ry1 = r.y, rx2 = r.x + r.width, ry2 = r.y + r.height;
    if (a.y == b.y) {
        // horizontal segment
        if (a.y < ry1 || a.y > ry2)
            return false;
        int lo = std::min(a.x, b.x), hi = std::max(a.x, b.x);
        return hi >= rx1 && lo <= rx2;
    } else {
        // vertical segment
        if (a.x < rx1 || a.x > rx2)
            return false;
        int lo = std::min(a.y, b.y), hi = std::max(a.y, b.y);
        return hi >= ry1 && lo <= ry2;
    }
}

bool RoutedWireElm::pointOnWireInterior(int px, int py) {
    if (routePoints.size() < 2)
        return false;
    return pointOnWireInteriorForPoints(px, py, routePoints);
}

void RoutedWireElm::rerouteVia(int vx, int vy) {
    WireRouter router;
    router.initGrid(this, app->gridSize, *app->uiElmList, app->getCircuitBounds());
    std::vector<Point> rp1 = router.routeWire(x, y, vx, vy);
    if (rp1.size() < 2)
        return;

    for (size_t i = 0; i + 1 < rp1.size(); i++)
        router.addWire(rp1[i].x, rp1[i].y, rp1[i + 1].x, rp1[i + 1].y);

    std::vector<Point> rp2 = router.routeWire(vx, vy, x2, y2);
    if (rp2.size() < 2)
        return;

    routePoints = rp1;
    routePoints.insert(routePoints.end(), rp2.begin() + 1, rp2.end());
}

void RoutedWireElm::addRoutingObstacle(WireRouter &router) {
    for (size_t i = 0; i + 1 < routePoints.size(); i++)
        router.addWire(routePoints[i].x, routePoints[i].y, routePoints[i + 1].x, routePoints[i + 1].y);
}

void RoutedWireElm::draw(Graphics &g) {
    if (routePoints.size() < 2) {
        WireElm::draw(g);
        return;
    }
    setVoltageColor(g, nodes[0]->v);
    for (size_t i = 0; i + 1 < routePoints.size(); i++)
        drawThickLine(g, routePoints[i], routePoints[i + 1], busWidth > 1 ? 5 : 3);

    if (!currents.empty()) {
        current = 0;
        for (double c : currents)
            current += c;
    }
    doDots(g);

    const int m = 5;
    int minX = point1.x, minY = point1.y, maxX = point1.x, maxY = point1.y;
    for (size_t i = 1; i < routePoints.size(); i++) {
        const Point &p = routePoints[i];
        minX = std::min(minX, p.x);
        minY = std::min(minY, p.y);
        maxX = std::max(maxX, p.x);
        maxY = std::max(maxY, p.y);
    }
    setBbox(minX - m, minY - m, maxX + m, maxY + m);

    std::string s;
    if (busWidth > 1 && (mustShowBusValue() || mustShowBusValueHex())) {
        int value = getBusValue();
        if (mustShowBusValue())
            s = std::to_string(value);
        if (mustShowBusValueHex()) {
            char buf[16];
            std::snprintf(buf, sizeof(buf), "%X", value);
            s = (s.empty() ? "" : s + " ") + "0x" + buf;
        }
    } else if (busWidth == 1) {
        if (mustShowCurrent())
            s = getShortUnitText(std::abs(getCurrent()), "A");
        if (mustShowVoltage())
            s = (s.empty() ? "" : s + " ") + getShortUnitText(nodes[0]->v, "V");
    }
    if (!s.empty())
        drawValuesOnLongestSegment(g, s);
    drawPosts(g);
}

void RoutedWireElm::drawValuesOnLongestSegment(Graphics &g, const std::string &s) {
    if (routePoints.size() < 2)
        return;
    int bestLen = 0, bestSeg = 0;
    for (size_t i = 0; i + 1 < routePoints.size(); i++) {
        const Point &a = routePoints[i], &b = routePoints[i + 1];
        int ddx = b.x - a.x, ddy = b.y - a.y;
        int len = ddx * ddx + ddy * ddy;
        if (len > bestLen) {
            bestLen = len;
            bestSeg = (int) i;
        }
    }
    const Point &a = routePoints[bestSeg], &b = routePoints[bestSeg + 1];
    int mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    g.setFont(unitsFont);
    double w = g.measureWidth(s);
    int ya = (int) (g.currentFontSize / 2);
    g.setColor(whiteColor);
    if (a.y == b.y)
        g.drawString(s, mx - w / 2, my - 6);
    else
        g.drawString(s, mx + 4, my + ya);
}

void RoutedWireElm::doDots(Graphics &g) {
    updateDotCount();
    if (isCreating() || curcount == 0 || routePoints.empty())
        return;
    double cc = curcount;
    for (size_t i = 0; i + 1 < routePoints.size(); i++) {
        const Point &a = routePoints[i], &b = routePoints[i + 1];
        drawDots(g, a, b, cc);
        double ddx = b.x - a.x, ddy = b.y - a.y;
        double segLen = std::sqrt(ddx * ddx + ddy * ddy);
        cc = addCurCount(cc, segLen);
    }
}

double RoutedWireElm::getMouseDistance(int gx, int gy) {
    if (routePoints.empty())
        return WireElm::getMouseDistance(gx, gy);
    const int thresh = 10;
    long best = MAX_SAFE_INTEGER;
    for (size_t i = 0; i + 1 < routePoints.size(); i++) {
        const Point &a = routePoints[i], &b = routePoints[i + 1];
        long d = segmentDistanceSq(a.x, a.y, b.x, b.y, gx, gy);
        if (d < best)
            best = d;
    }
    return best <= thresh * thresh ? (double) best : -1;
}

int RoutedWireElm::segmentDistanceSq(int ax, int ay, int bx, int by, int gx, int gy) {
    double ddx = bx - ax, ddy = by - ay;
    double lenSq = ddx * ddx + ddy * ddy;
    if (lenSq == 0)
        return (gx - ax) * (gx - ax) + (gy - ay) * (gy - ay);
    double t = ((gx - ax) * ddx + (gy - ay) * ddy) / lenSq;
    if (t < 0)
        t = 0;
    else if (t > 1)
        t = 1;
    double px = ax + t * ddx, py = ay + t * ddy;
    double ex = gx - px, ey = gy - py;
    return (int) (ex * ex + ey * ey);  // "| 0"
}

bool RoutedWireElm::pointOnPath(const Point &p) {
    if (routePoints.size() < 2)
        return false;
    if (p.equals(point1) || p.equals(point2))
        return false;
    for (size_t i = 0; i + 1 < routePoints.size(); i++) {
        const Point &a = routePoints[i], &b = routePoints[i + 1];
        if (a.x == b.x && p.x == a.x) {
            int lo = std::min(a.y, b.y), hi = std::max(a.y, b.y);
            if (p.y >= lo && p.y <= hi)
                return true;
        } else if (a.y == b.y && p.y == a.y) {
            int lo = std::min(a.x, b.x), hi = std::max(a.x, b.x);
            if (p.x >= lo && p.x <= hi)
                return true;
        }
    }
    return false;
}

std::optional<Point> RoutedWireElm::getSnapPointOnWire(int mx, int my) {
    if (routePoints.size() < 2)
        return std::nullopt;

    int bestSeg = -1;
    double bestDist = (double) MAX_SAFE_INTEGER;
    for (size_t i = 0; i + 1 < routePoints.size(); i++) {
        const Point &a = routePoints[i], &b = routePoints[i + 1];
        double d = lineDistanceSq(a.x, a.y, b.x, b.y, mx, my);
        if (d < bestDist) {
            bestDist = d;
            bestSeg = (int) i;
        }
    }

    const Point &a = routePoints[bestSeg], &b = routePoints[bestSeg + 1];
    int sx, sy;
    if (a.x == b.x) {
        sx = a.x;
        sy = snapGrid(my);
    } else {
        sy = a.y;
        sx = snapGrid(mx);
    }
    return Point(sx, sy);
}

void RoutedWireElm::getInfo(std::vector<std::string> &arr) {
    WireElm::getInfo(arr);
    arr[0] = (busWidth > 1) ? "routed bus wire (" + std::to_string(busWidth) + ")" : "routed wire";
}
