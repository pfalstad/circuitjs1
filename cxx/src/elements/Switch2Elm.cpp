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

#include "Switch2Elm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/FindPathInfo.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/VoltageSource.h"

Switch2Elm::Switch2Elm(int xx, int yy, bool mm) : SwitchElm(xx, yy, mm) {
    noDiagonal = true;
    throwCount = 2;
}

Switch2Elm::Switch2Elm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : SwitchElm(xa, ya, xb, yb, f, st) {
    link = parseIntStrict(st.nextToken());
    throwCount = 2;
    try {
        throwCount = parseIntStrict(st.nextToken());
    } catch (...) {}
    noDiagonal = true;
}

void Switch2Elm::dumpXml(XmlElement *doc, XmlElement *elem) {
    SwitchElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "li", link);
    CircuitXMLSerializer::dumpAttr(elem, "th", throwCount);
}

void Switch2Elm::undumpXml(CircuitXMLDeserializer &xml) {
    SwitchElm::undumpXml(xml);
    link = xml.parseIntAttr("li", link);
    throwCount = xml.parseIntAttr("th", throwCount);
}

void Switch2Elm::setPoints() {
    SwitchElm::setPoints();
    calcLeads(32);
    swposts = newPointArray(throwCount);
    swpoles = newPointArray(2 + throwCount);
    for (int i = 0; i != throwCount; i++) {
        int hs = -openhs * (i - (throwCount - 1) / 2);
        if (throwCount == 2 && i == 0)
            hs = openhs;
        interpPoint(lead1, lead2, swpoles[i], 1, hs);
        interpPoint(point1, point2, swposts[i], 1, hs);
    }
    swpoles[throwCount] = lead2;  // for center off
    posCount = hasCenterOff() ? 3 : throwCount;
}

void Switch2Elm::draw(Graphics &g) {
    setBbox(point1, point2, openhs);
    adjustBbox(swposts[0], swposts[throwCount - 1]);

    // draw first lead
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1);

    // draw other leads
    for (int i = 0; i != throwCount; i++) {
        setVoltageColor(g, nodes[i + 1]->v);
        drawThickLine(g, swpoles[i], swposts[i]);
    }

    // draw switch
    if (!needsHighlight())
        g.setColor(whiteColor);
    drawThickLine(g, lead1, swpoles[position]);

    updateDotCount();
    drawDots(g, point1, lead1, curcount);
    if (!(position == 2 && hasCenterOff()))
        drawDots(g, swpoles[position], swposts[position], curcount);
    drawPosts(g);
}

double Switch2Elm::getCurrentIntoNode(int n) {
    if (n == 0)
        return -current;
    if (n == position + 1)
        return current;
    return 0;
}

Rectangle Switch2Elm::getSwitchRect() {
    const Point &p0 = swpoles[0];
    const Point &p1 = swpoles[throwCount - 1];
    int x = std::min({lead1.x, p0.x, p1.x});
    int y = std::min({lead1.y, p0.y, p1.y});
    int w = std::abs(p0.x - lead1.x) + std::abs(p1.x - p0.x);
    int h = std::abs(p0.y - lead1.y) + std::abs(p1.y - p0.y);
    return Rectangle(x, y, w, h);
}

void Switch2Elm::calculateCurrent() {
    if (position == 2 && hasCenterOff())
        current = 0;
    else if (resistance > 0)
        current = (nodes[0]->v - nodes[position + 1]->v) / resistance;
}

void Switch2Elm::setVoltageSource(int, VoltageSource *v) {
    voltSource = v;
    v->setNodes(nodes[0], nodes[position + 1]);
}

void Switch2Elm::stamp() {
    if (position == 2 && hasCenterOff())
        return;
    if (resistance > 0)
        sim->stampResistor(nodes[0], nodes[position + 1], resistance);
    else
        sim->stampVoltageSource(nodes[0], nodes[position + 1], voltSource, 0);
}

int Switch2Elm::getVoltageSourceCount() {
    if (position == 2 && hasCenterOff())
        return 0;
    return resistance > 0 ? 0 : 1;
}

void Switch2Elm::toggle() {
    SwitchElm::toggle();
    if (link != 0) {
        for (CircuitElm *o : sim->elmList) {
            if (Switch2Elm *s2 = dynamic_cast<Switch2Elm *>(o)) {
                if (s2->link == link) {
                    int pos = position;
                    if (s2->isPositionFlipped() != isPositionFlipped())
                        pos = posCount - 1 - pos;
                    if (pos < s2->posCount)
                        s2->position = pos;
                }
            }
        }
    }
}

bool Switch2Elm::getConnection(int n1, int n2) {
    if (position == 2 && hasCenterOff())
        return false;
    return comparePair(n1, n2, 0, 1 + position);
}

void Switch2Elm::getInfo(std::vector<std::string> &arr) {
    arr[0] = std::string("switch (") + (link == 0 ? "S" : "D") + "P" +
             (throwCount > 2 ? std::to_string(throwCount) + "T)" : "DT)");
    arr[1] = "I = " + getCurrentDText(getCurrent());
}

std::optional<EditInfo> Switch2Elm::getEditInfo(int n) {
    if (n == 1)
        return EditInfo("Group Number (for linking)", link, 0, 100).setDimensionless().disallowSliders();
    if (n == 2)
        return EditInfo("# of Throws", throwCount, 2, 10).setDimensionless().disallowSliders();
    return SwitchElm::getEditInfo(n);
}

void Switch2Elm::setEditValue(int n, EditInfo &ei) {
    if (n == 1) {
        link = (int) std::trunc(ei.value);
    } else if (n == 2) {
        if (ei.value >= 2)
            throwCount = (int) std::trunc(ei.value);
        if (throwCount > 2)
            momentary = false;
        allocNodes();
        setPoints();
    } else
        SwitchElm::setEditValue(n, ei);
}

void Switch2Elm::flipX(int c2, int count) {
    SwitchElm::flipX(c2, count);
    position = posCount - 1 - position;
    flags ^= FLAG_FLIPPED;
}

void Switch2Elm::flipY(int c2, int count) {
    SwitchElm::flipY(c2, count);
    position = posCount - 1 - position;
    flags ^= FLAG_FLIPPED;
}

void Switch2Elm::flipXY(int c2, int count) {
    SwitchElm::flipXY(c2, count);
    position = posCount - 1 - position;
    flags ^= FLAG_FLIPPED;
}

bool Switch2Elm::validate() {
    if (position == 2 && hasCenterOff())
        return true;
    if (resistance > 0)
        return true;
    FindPathInfo fpi(FindPathInfo::VOLTAGE, this, getNode(0), sim);
    if (fpi.findPath(getNode(1 + position))) {
        resistance = .001;
        return false;
    }
    return true;
}
