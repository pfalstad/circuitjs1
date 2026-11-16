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

#include "BoxElm.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"

BoxElm::BoxElm(int xx, int yy) : ShapeElm(xx, yy) {
    x2 = xx;
    y2 = yy;
    setBbox(x, y, x2, y2);
}

BoxElm::BoxElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : ShapeElm(xa, ya, xb, yb, f) {
    x2 = xb;
    y2 = yb;
    setBbox(x, y, x2, y2);
}

void BoxElm::postConstruct(StringTokenizer *st) {
    ShapeElm::postConstruct(st);
    if (st == nullptr) {
        opacity = lastOpacity;
        cornerRadius = lastCornerRadius;
    }
}

void BoxElm::remember() {
    ShapeElm::remember();
    lastOpacity = opacity;
    lastCornerRadius = cornerRadius;
}

void BoxElm::constrain() {
    int dx = x2 - x, dy = y2 - y;
    int d = std::max(std::abs(dx), std::abs(dy));
    x2 = x + (dx < 0 ? -d : d);
    y2 = y + (dy < 0 ? -d : d);
}

void BoxElm::draw(Graphics &g) {
    setBbox(x, y, x2, y2);
    int bx = std::min(x, x2), by = std::min(y, y2);
    int bw = std::abs(x2 - x), bh = std::abs(y2 - y);
    // a thick stroke is centred on the edge, so half of it lies outside the box
    if (thickness > 1) {
        int pad = (int) std::ceil(thickness / 2.0);
        adjustBbox(bx - pad, by - pad, bx + bw + pad, by + bh + pad);
    }
    int r = std::min(cornerRadius, std::min(bw, bh) / 2);
    if (opacity > 0) {
        g.setColor(shapeColor());
        g.saveState();
        g.setGlobalAlpha(opacity / 100.0);
        boxPath(g, bx, by, bw, bh, r);
        g.fill();
        g.restoreState();
    }
    beginStroke(g);
    if (r == 0)
        g.drawRect(bx, by, bw, bh);
    else {
        boxPath(g, bx, by, bw, bh, r);
        g.stroke();
    }
    endStroke(g);
}

void BoxElm::boxPath(Graphics &g, double bx, double by, double bw, double bh, double r) {
    g.beginPath();
    if (r == 0) {
        g.rect(bx, by, bw, bh);
        return;
    }
    g.moveTo(bx + r, by);
    g.lineTo(bx + bw - r, by);
    g.arc(bx + bw - r, by + r, r, -M_PI / 2, 0);
    g.lineTo(bx + bw, by + bh - r);
    g.arc(bx + bw - r, by + bh - r, r, 0, M_PI / 2);
    g.lineTo(bx + r, by + bh);
    g.arc(bx + r, by + bh - r, r, M_PI / 2, M_PI);
    g.lineTo(bx, by + r);
    g.arc(bx + r, by + r, r, M_PI, M_PI * 1.5);
    g.closePath();
}

std::optional<EditInfo> BoxElm::getShapeEditInfo(int n) {
    if (n == 0)
        return EditInfo("Fill Opacity (%)", opacity, 0, 100).setDimensionless().setUnitStep().disallowSliders();
    if (n == 1)
        return EditInfo("Corner Radius", cornerRadius, 0, 100).setDimensionless().setUnitStep().disallowSliders();
    return std::nullopt;
}

void BoxElm::setShapeEditValue(int n, EditInfo &ei) {
    int v = (int) std::round(ei.value);
    if (n == 0) {
        if (v < 0 || v > 100) {
            ei.setError("must be from 0 to 100");
            return;
        }
        opacity = v;
    }
    if (n == 1) {
        if (v < 0) {
            ei.setError("must be 0 or more");
            return;
        }
        cornerRadius = v;
    }
}

void BoxElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ShapeElm::dumpXml(doc, elem);
    if (opacity != 0)
        CircuitXMLSerializer::dumpAttr(elem, "op", opacity);
    if (cornerRadius != 0)
        CircuitXMLSerializer::dumpAttr(elem, "cr", cornerRadius);
}

void BoxElm::undumpXml(CircuitXMLDeserializer &xml) {
    ShapeElm::undumpXml(xml);
    opacity = xml.parseIntAttr("op", 0);
    cornerRadius = xml.parseIntAttr("cr", 0);
}

double BoxElm::getMouseDistance(int gx, int gy) {
    const int thresh = std::max(10, thickness / 2 + 4);
    int dx1 = std::abs(gx - x);
    int dy1 = std::abs(gy - y);
    int dx2 = std::abs(gx - x2);
    int dy2 = std::abs(gy - y2);
    if (std::abs(dx1) < thresh)
        return dx1 * dx1;
    if (std::abs(dx2) < thresh)
        return dx2 * dx2;
    if (std::abs(dy1) < thresh)
        return dy1 * dy1;
    if (std::abs(dy2) < thresh)
        return dy2 * dy2;
    return -1;
}

void BoxElm::selectRect(const Rectangle &r, bool add) {
    if (r.contains(boundingBox))
        selected = true;
    else if (!add)
        selected = false;
}
