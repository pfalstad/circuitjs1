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

#include "LineElm.h"

#include <algorithm>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/Polygon.h"

LineElm::LineElm(int xx, int yy) : ShapeElm(xx, yy) {
    x2 = xx;
    y2 = yy;
    setBbox(x, y, x2, y2);
}

LineElm::LineElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : ShapeElm(xa, ya, xb, yb, f) {
    x2 = xb;
    y2 = yb;
    setBbox(x, y, x2, y2);
}

void LineElm::postConstruct(StringTokenizer *st) {
    ShapeElm::postConstruct(st);
    if (st == nullptr)
        arrows = lastArrows;
}

void LineElm::remember() {
    ShapeElm::remember();
    lastArrows = arrows;
}

void LineElm::constrain() {
    int dx = x2 - x, dy = y2 - y;
    if (dx == 0 && dy == 0)
        return;
    // -4..4, in 45 degree steps (JS Math.round: halves round up)
    int oct = (int) std::floor(std::atan2(dy, dx) / (M_PI / 4) + .5);
    if (oct % 4 == 0)
        y2 = y;  // horizontal
    else if (std::abs(oct) == 2)
        x2 = x;  // vertical
    else {
        int d = std::max(std::abs(dx), std::abs(dy));
        x2 = x + (dx < 0 ? -d : d);
        y2 = y + (dy < 0 ? -d : d);
    }
}

// JS Math.round
static int jsRound(double v) {
    return (int) std::floor(v + .5);
}

void LineElm::draw(Graphics &g) {
    setBbox(x, y, x2, y2);
    double len = std::hypot(x2 - x, y2 - y);
    bool aStart = (arrows & ARROW_START) != 0;
    bool aEnd = (arrows & ARROW_END) != 0;
    // arrowhead size grows with thickness; shorten the line so a thick
    // stroke doesn't poke out past the arrow's tip
    double alen = std::min(6.0 + 3 * thickness, len / 2);
    // a thick stroke (round ends) and arrowheads reach past the end points
    double pad = (thickness > 1) ? thickness / 2.0 : 0;
    if (aStart || aEnd)
        pad = std::max(pad, alen * .45);  // arrowhead half-width, see arrowHead()
    if (pad > 0) {
        pad = std::ceil(pad);
        adjustBbox(std::min(x, x2) - pad, std::min(y, y2) - pad, std::max(x, x2) + pad, std::max(y, y2) + pad);
    }
    double sx = x, sy = y, ex = x2, ey = y2;
    if (len > 0) {
        double ux = (x2 - x) / len, uy = (y2 - y) / len;
        if (aStart) {
            sx = jsRound(x + ux * alen * .8);
            sy = jsRound(y + uy * alen * .8);
        }
        if (aEnd) {
            ex = jsRound(x2 - ux * alen * .8);
            ey = jsRound(y2 - uy * alen * .8);
        }
    }
    beginStroke(g);
    g.drawLine(sx, sy, ex, ey);
    endStroke(g);
    if (len > 0) {
        if (aStart)
            g.fillPolygon(arrowHead(x2, y2, x, y, len, alen));
        if (aEnd)
            g.fillPolygon(arrowHead(x, y, x2, y2, len, alen));
    }
}

Polygon LineElm::arrowHead(double fx, double fy, double tx, double ty, double len, double alen) {
    double ux = (tx - fx) / len, uy = (ty - fy) / len;
    double bx = tx - ux * alen, by = ty - uy * alen;
    double hw = alen * .45;
    Polygon p;
    p.addPoint((int) tx, (int) ty);
    p.addPoint(jsRound(bx - uy * hw), jsRound(by + ux * hw));
    p.addPoint(jsRound(bx + uy * hw), jsRound(by - ux * hw));
    return p;
}

std::optional<EditInfo> LineElm::getShapeEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Arrowheads", 0, -1, -1);
        ei.choice.emplace();
        ei.choice->add("None");
        ei.choice->add("End");
        ei.choice->add("Start");
        ei.choice->add("Both Ends");
        ei.choice->select(arrows);
        return ei;
    }
    return std::nullopt;
}

void LineElm::setShapeEditValue(int n, EditInfo &ei) {
    if (n == 0)
        arrows = ei.choice->getSelectedIndex();
}

void LineElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ShapeElm::dumpXml(doc, elem);
    if (arrows != ARROW_NONE)
        CircuitXMLSerializer::dumpAttr(elem, "ar", arrows);
}

void LineElm::undumpXml(CircuitXMLDeserializer &xml) {
    ShapeElm::undumpXml(xml);
    arrows = xml.parseIntAttr("ar", ARROW_NONE);
}

double LineElm::getMouseDistance(int gx, int gy) {
    const int thresh = std::max(10, thickness / 2 + 4);
    double d2 = lineDistanceSq(x, y, x2, y2, gx, gy);
    if (d2 <= thresh * thresh)
        return d2;
    return -1;
}
