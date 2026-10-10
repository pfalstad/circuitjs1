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

#include "WireElm.h"

#include "../core/ElementFactory.h"

#include "LabeledNodeElm.h"

#include <cstdlib>
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/JsMath.h"
#include <cstdio>

Point WireElm::getPost(int n) {
    if (busWidth == 1)
        return (n == 0) ? point1 : point2;
    if (n < busWidth)
        return Point(point1.x, point1.y, n);
    return Point(point2.x, point2.y, n - busWidth);
}

bool WireElm::getConnection(int n1, int n2) {
    if (busWidth == 1)
        return true;
    // only connect matching bits: post n1 connects to n1 +/- busWidth
    return std::abs(n1 - n2) == busWidth;
}

std::optional<Point> WireElm::getConnectedPost(int n) {
    if (busWidth == 1)
        return (n == 0) ? point2 : point1;
    if (n < busWidth)
        return Point(point2.x, point2.y, n);
    return Point(point1.x, point1.y, n - busWidth);
}

int WireElm::getBusValue() {
    int value = 0;
    for (int i = 0; i < busWidth; i++)
        if (nodes[i]->v > 2.5)
            value |= 1 << i;
    return value;
}

void WireElm::setWireCurrent(int bit, double c) {
    if (!currents.empty())
        currents[bit] = c;
    else
        current = c;
}

double WireElm::getCurrentIntoNode(int n) {
    if (!currents.empty()) {
        if (n < busWidth)
            return -currents[n];
        return currents[n - busWidth];
    }
    if (n == 0)
        return -current;
    return current;
}

double WireElm::getMouseDistance(int gx, int gy) {
    const double thresh = 10;
    double d2 = lineDistanceSq(x, y, x2, y2, gx, gy);
    if (d2 <= thresh * thresh)
        return d2;
    return -1;
}

static std::string toHexUpper(int v) {
    char buf[16];
    std::snprintf(buf, sizeof(buf), "%X", v);
    return buf;
}

void WireElm::draw(Graphics &g) {
    if (!currents.empty()) {
        current = 0;
        for (double c : currents)
            current += c;
    }
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, point2, (busWidth > 1) ? 5 : 3);
    doDots(g);
    setBbox(point1, point2, 3);
    std::string s;
    if (busWidth > 1 && (mustShowBusValue() || mustShowBusValueHex())) {
        int value = getBusValue();
        if (mustShowBusValue())
            s = std::to_string(value);
        if (mustShowBusValueHex())
            s = (s.empty() ? "" : s + " ") + "0x" + toHexUpper(value);
    } else if (busWidth == 1) {
        if (mustShowCurrent())
            s = getShortUnitText(std::abs(getCurrent()), "A");
        if (mustShowVoltage())
            s = (s.empty() ? "" : s + " ") + getShortUnitText(nodes[0]->v, "V");
    }
    drawValues(g, s, 4);
    drawPosts(g);
}

void WireElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = (busWidth > 1) ? "bus wire (" + std::to_string(busWidth) + ")" : "wire";
    if (busWidth > 1) {
        int value = getBusValue();
        arr[1] = "value = " + std::to_string(value);
        arr[2] = "hex = 0x" + toHexUpper(value);
        std::optional<std::string> label = LabeledNodeElm::getLabelForNode(getNode(0));
        if (label) {
            for (int i = 1; i < busWidth; i++) {
                if (label != LabeledNodeElm::getLabelForNode(getNode(i))) {
                    label.reset();
                    break;
                }
            }
        }
        if (label)
            arr[3] = *label;
    } else {
        arr[1] = "I = " + getCurrentDText(getCurrent());
        arr[2] = "V = " + getVoltageText(nodes[0]->v);
        std::optional<std::string> label = LabeledNodeElm::getLabelForNode(getNode(0));
        if (label)
            arr[3] = *label;
    }
}

std::optional<EditInfo> WireElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Show Current", mustShowCurrent());
    if (n == 1)
        return EditInfo::createCheckbox("Show Voltage", mustShowVoltage());
    if (n == 2)
        return EditInfo::createCheckbox("Show Bus Value", mustShowBusValue());
    if (n == 3)
        return EditInfo::createCheckbox("Show Bus Value (Hex)", mustShowBusValueHex());
    return std::nullopt;
}

void WireElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        flags = ei.changeFlag(flags, FLAG_SHOWCURRENT);
    if (n == 1)
        flags = ei.changeFlag(flags, FLAG_SHOWVOLTAGE);
    if (n == 2)
        flags = ei.changeFlag(flags, FLAG_SHOW_BUS_VALUE);
    if (n == 3)
        flags = ei.changeFlag(flags, FLAG_SHOW_BUS_VALUE_HEX);
}

bool WireElm::pointOnWireInteriorForPoints(int px, int py, const std::vector<Point> &pts) {
    for (size_t i = 0; i + 1 < pts.size(); i++) {
        const Point &a = pts[i];
        const Point &b = pts[i + 1];
        if (pointOnSegmentInterior(a.x, a.y, b.x, b.y, px, py))
            return true;
    }
    // an interior bend vertex (not the wire's overall endpoints) is also a valid split point,
    // even though it's not "interior" to either of its adjacent segments
    for (size_t i = 1; i + 1 < pts.size(); i++) {
        const Point &p = pts[i];
        if (p.x == px && p.y == py)
            return true;
    }
    return false;
}

bool WireElm::pointOnWireInterior(int px, int py) {
    return pointOnWireInteriorForPoints(px, py, {point1, point2});
}

WireElm *WireElm::split(int px, int py) {
    WireElm *newWire = static_cast<WireElm *>(ElementFactory::create("WireElm", px, py));
    newWire->drag(x2, y2);
    drag(px, py);
    return newWire;
}
