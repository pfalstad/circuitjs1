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

#include "GroundElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/JsMath.h"

int GroundElm::lastSymbolType = 0;
std::optional<Point> GroundElm::firstGround;

GroundElm::GroundElm(int xx, int yy) : CircuitElm(xx, yy) {
    symbolType = lastSymbolType;
}

GroundElm::GroundElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    symbolType = 0;
    if (st.hasMoreTokens()) {
        try {
            symbolType = parseIntStrict(st.nextToken());
        } catch (...) {}
    }
}

std::string GroundElm::dump() {
    return CircuitElm::dump() + " " + std::to_string(symbolType);
}

void GroundElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    if (symbolType != 0)
        CircuitXMLSerializer::dumpAttr(elem, "sy", symbolType);
}

void GroundElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    symbolType = xml.parseIntAttr("sy", 0);
}

void GroundElm::stamp() {
    if (isOldStyle())
        sim->stampVoltageSource(CircuitNode::ground, nodes[0], voltSource, 0);
}

std::optional<Point> GroundElm::getConnectedPost(int) {
    if (firstGround)
        return firstGround;
    firstGround = point1;
    return std::nullopt;
}

void GroundElm::draw(Graphics &g) {
    setVoltageColor(g, 0);
    drawThickLine(g, point1, point2);
    if (symbolType == 0) {
        for (int i = 0; i != 3; i++) {
            int a = 10 - i * 4;
            int b = i * 5;  // -10;
            interpPoint2(point1, point2, ps1, ps2, 1 + b / dn, a);
            drawThickLine(g, ps1, ps2);
        }
    } else if (symbolType == 1) {
        interpPoint2(point1, point2, ps1, ps2, 1, 10);
        drawThickLine(g, ps1, ps2);
        for (int i = 0; i <= 2; i++) {
            Point p = interpPoint(ps1, ps2, i / 2.);
            drawThickLine(g, p.x, p.y, std::trunc(p.x - 5 * dpx1 + 8 * dx / dn), std::trunc(p.y + 8 * dy / dn - 5 * dpy1));
        }
    } else if (symbolType == 2) {
        interpPoint2(point1, point2, ps1, ps2, 1, 10);
        drawThickLine(g, ps1, ps2);
        double ps3x = std::trunc(point2.x + 10 * dx / dn);
        double ps3y = std::trunc(point2.y + 10 * dy / dn);
        drawThickLine(g, ps1.x, ps1.y, ps3x, ps3y);
        drawThickLine(g, ps2.x, ps2.y, ps3x, ps3y);
    } else {
        interpPoint2(point1, point2, ps1, ps2, 1, 10);
        drawThickLine(g, ps1, ps2);
    }
    interpPoint(point1, point2, ps2, 1 + 11. / dn);
    doDots(g);
    setBbox(point1, ps2, 11);
    drawPosts(g);
}

void GroundElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "ground";
    arr[1] = "I = " + getCurrentText(getCurrent());
}

std::optional<EditInfo> GroundElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Symbol", 0);
        ei.choice = Choice();
        ei.choice->add("Earth");
        ei.choice->add("Chassis");
        ei.choice->add("Signal");
        ei.choice->add("Common");
        ei.choice->select(symbolType);
        return ei;
    }
    return std::nullopt;
}

void GroundElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        lastSymbolType = symbolType = ei.choice->getSelectedIndex();
}
