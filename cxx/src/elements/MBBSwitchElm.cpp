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

#include "MBBSwitchElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/FindPathInfo.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

MBBSwitchElm::MBBSwitchElm(int xx, int yy) : SwitchElm(xx, yy) {
    setup();
}

MBBSwitchElm::MBBSwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : SwitchElm(xa, ya, xb, yb, f, st) {
    link = parseIntStrict(st.nextToken());
    setup();
}

void MBBSwitchElm::setup() {
    noDiagonal = true;
    voltSources[0] = voltSources[1] = nullptr;
    currents[0] = currents[1] = 0;
    curcounts[0] = curcounts[1] = curcounts[2] = 0;
}

void MBBSwitchElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    SwitchElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "li", link);
}

void MBBSwitchElm::undumpXml(CircuitXMLDeserializer &xml) {
    SwitchElm::undumpXml(xml);
    link = xml.parseIntAttr("li", link);
}

void MBBSwitchElm::setPoints() {
    SwitchElm::setPoints();
    calcLeads(32);
    swposts = newPointArray(2);
    swpoles = newPointArray(4);
    for (int i = 0; i != 2; i++) {
        int hs = i == 0 ? openhs : -openhs;
        interpPoint(lead1, lead2, swpoles[i], 1, hs);
        interpPoint(point1, point2, swposts[i], 1, hs);
    }
    posCount = 4;
}

void MBBSwitchElm::draw(Graphics &g) {
    setBbox(point1, point2, openhs);
    adjustBbox(swposts[0], swposts[1]);

    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1);

    for (int i = 0; i != 2; i++) {
        setVoltageColor(g, nodes[i + 1]->v);
        drawThickLine(g, swpoles[i], swposts[i]);
    }

    if (!needsHighlight())
        g.setColor(whiteColor);
    if (both || position == 0)
        drawThickLine(g, lead1, swpoles[0]);
    if (both || position == 2)
        drawThickLine(g, lead1, swpoles[1]);

    for (int i = 0; i != 2; i++) {
        curcounts[i] = updateDotCount(currents[i], curcounts[i]);
        drawDots(g, swpoles[i], swposts[i], curcounts[i]);
    }
    curcounts[2] = updateDotCount(currents[0] + currents[1], curcounts[2]);
    drawDots(g, point1, lead1, curcounts[2]);
    drawPosts(g);
}

double MBBSwitchElm::getCurrentIntoNode(int n) {
    if (n == 0)
        return -currents[0] - currents[1];
    return currents[n - 1];
}

Rectangle MBBSwitchElm::getSwitchRect() {
    return Rectangle(lead1.x, lead1.y, 0, 0)
        .unite(Rectangle(swpoles[0].x, swpoles[0].y, 0, 0))
        .unite(Rectangle(swpoles[1].x, swpoles[1].y, 0, 0));
}

void MBBSwitchElm::setCurrent(VoltageSource *vs, double c) {
    if (vs == voltSources[0])
        currents[both ? 0 : position / 2] = c;
    else if (vs == voltSources[1])
        currents[1] = c;
}

void MBBSwitchElm::calculateCurrent() {
    if (resistance > 0) {
        currents[0] = (both || position == 0) ? (nodes[0]->v - nodes[1]->v) / resistance : 0;
        currents[1] = (both || position == 2) ? (nodes[0]->v - nodes[2]->v) / resistance : 0;
        return;
    }
    // make sure current of unconnected pole is zero
    if (!both)
        currents[1 - position / 2] = 0;
}

void MBBSwitchElm::setVoltageSource(int n, VoltageSource *v) {
    voltSources[n] = v;
    if (both)
        v->setNodes(nodes[0], nodes[n + 1]);
    else if (position == 0)
        v->setNodes(nodes[0], nodes[1]);
    else
        v->setNodes(nodes[0], nodes[2]);
}

void MBBSwitchElm::stamp() {
    if (resistance > 0) {
        if (both || position == 0)
            sim->stampResistor(nodes[0], nodes[1], resistance);
        if (both || position == 2)
            sim->stampResistor(nodes[0], nodes[2], resistance);
        return;
    }
    int vs = 0;
    if (both || position == 0)
        sim->stampVoltageSourceVS(voltSources[vs++], 0);
    if (both || position == 2)
        sim->stampVoltageSourceVS(voltSources[vs++], 0);
}

int MBBSwitchElm::getVoltageSourceCount() {
    both = (position == 1 || position == 3);
    if (resistance > 0)
        return 0;
    return both ? 2 : 1;
}

void MBBSwitchElm::toggle() {
    SwitchElm::toggle();
    if (link != 0) {
        for (CircuitElm *ce : app->elmList) {
            MBBSwitchElm *se = dynamic_cast<MBBSwitchElm *>(ce);
            if (se != nullptr && se->link == link)
                se->position = position;
        }
    }
}

bool MBBSwitchElm::getConnection(int n1, int n2) {
    if (both)
        return true;
    return comparePair(n1, n2, 0, 1 + position / 2);
}

void MBBSwitchElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = std::string("switch (") + (link == 0 ? "S" : "D") + "PDT, MBB)";
    arr[1] = "I = " + getCurrentDText(getCurrent());
}

std::optional<EditInfo> MBBSwitchElm::getEditInfo(int n) {
    if (n == 0)
        return SwitchElm::getEditInfo(0);
    if (n == 1)
        return EditInfo("Switch Group", link, 0, 100).setDimensionless();
    if (n == 2)
        return getKeyShortcutEditInfo();
    if (n == 3) {
        EditInfo ei("On Resistance (ohms)", resistance);
        ei.setNonNegative();
        return ei;
    }
    return std::nullopt;
}

void MBBSwitchElm::setEditValue(int n, EditInfo &ei) {
    if (n == 1)
        link = (int) std::trunc(ei.value);
    else if (n == 2)
        setKeyShortcutEditValue(ei);
    else if (n == 3)
        resistance = ei.value;
    else
        SwitchElm::setEditValue(n, ei);
}

bool MBBSwitchElm::validate() {
    if (resistance > 0)
        return true;
    bool b = (position == 1 || position == 3);
    if (b || position == 0) {
        FindPathInfo fpi(FindPathInfo::VOLTAGE, this, getNode(0), sim);
        if (fpi.findPath(getNode(1))) {
            resistance = .001;
            return false;
        }
    }
    if (b || position == 2) {
        FindPathInfo fpi(FindPathInfo::VOLTAGE, this, getNode(0), sim);
        if (fpi.findPath(getNode(2))) {
            resistance = .001;
            return false;
        }
    }
    return true;
}
