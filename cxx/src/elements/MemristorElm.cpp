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

#include "MemristorElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/ScopeConstants.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

MemristorElm::MemristorElm(int xx, int yy) : CircuitElm(xx, yy) {
    r_on = 100;
    r_off = 160 * r_on;
    dopeWidth = 0;
    totalWidth = 10e-9;  // meters
    mobility = 1e-10;    // m^2/sV
    resistance = 100;
}

MemristorElm::MemristorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    r_on = parseFloatStrict(st.nextToken());
    r_off = parseFloatStrict(st.nextToken());
    dopeWidth = parseFloatStrict(st.nextToken());
    totalWidth = parseFloatStrict(st.nextToken());
    mobility = parseFloatStrict(st.nextToken());
    try {
        current = parseFloatStrict(st.nextToken());
    } catch (...) {}
    resistance = 100;
}

void MemristorElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ron", r_on);
    CircuitXMLSerializer::dumpAttr(elem, "rof", r_off);
    CircuitXMLSerializer::dumpAttr(elem, "do", dopeWidth);
    CircuitXMLSerializer::dumpAttr(elem, "to", totalWidth);
    CircuitXMLSerializer::dumpAttr(elem, "mo", mobility);
}

void MemristorElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    r_on = xml.parseDoubleAttr("ron", r_on);
    r_off = xml.parseDoubleAttr("rof", r_off);
    dopeWidth = xml.parseDoubleAttr("do", dopeWidth);
    totalWidth = xml.parseDoubleAttr("to", totalWidth);
    mobility = xml.parseDoubleAttr("mo", mobility);
}

void MemristorElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(32);
    ps3 = Point();
    ps4 = Point();
}

void MemristorElm::draw(Graphics &g) {
    const int segments = 6;
    int ox = 0;
    double hs = 2 + std::floor(8 * (1 - dopeWidth / totalWidth));
    setBbox(point1, point2, hs);
    draw2Leads(g);
    setPowerColor(g, true);
    double segf = 1.0 / segments;

    // draw zigzag
    for (int i = 0; i <= segments; i++) {
        int nx = (i & 1) == 0 ? 1 : -1;
        if (i == segments)
            nx = 0;
        double v = nodes[0]->v + (nodes[1]->v - nodes[0]->v) * i / segments;
        setVoltageColor(g, v);
        interpPoint(lead1, lead2, ps1, i * segf, hs * ox);
        interpPoint(lead1, lead2, ps2, i * segf, hs * nx);
        drawThickLine(g, ps1, ps2);
        if (i == segments)
            break;
        interpPoint(lead1, lead2, ps1, (i + 1) * segf, hs * nx);
        drawThickLine(g, ps1, ps2);
        ox = nx;
    }

    doDots(g);
    drawPosts(g);
}

void MemristorElm::calculateCurrent() {
    current = (nodes[0]->v - nodes[1]->v) / resistance;
}

void MemristorElm::startIteration() {
    double wd = dopeWidth / totalWidth;
    dopeWidth += sim->timeStep * mobility * r_on * current / totalWidth;
    if (dopeWidth < 0)
        dopeWidth = 0;
    if (dopeWidth > totalWidth)
        dopeWidth = totalWidth;
    resistance = r_on * wd + r_off * (1 - wd);
}

void MemristorElm::stamp() {
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
}

void MemristorElm::doStep() {
    sim->stampResistor(nodes[0], nodes[1], resistance);
}

void MemristorElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "memristor";
    getBasicInfo(arr);
    arr[3] = "R = " + getUnitText(resistance, Locale::ohmString);
    arr[4] = "P = " + getUnitText(getPower(), "W");
}

double MemristorElm::getScopeValue(int x) {
    return (x == ScopeConstants::VAL_R) ? resistance : CircuitElm::getScopeValue(x);
}

int MemristorElm::getScopeUnits(int x) {
    return (x == ScopeConstants::VAL_R) ? ScopeConstants::UNITS_OHMS : CircuitElm::getScopeUnits(x);
}

bool MemristorElm::canShowValueInScope(int x) {
    return x == ScopeConstants::VAL_R;
}

std::optional<EditInfo> MemristorElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Min Resistance (ohms)", r_on, 0, 0);
    if (n == 1)
        return EditInfo("Max Resistance (ohms)", r_off, 0, 0);
    if (n == 2)
        return EditInfo("Width of Doped Region (nm)", dopeWidth * 1e9, 0, 0);
    if (n == 3)
        return EditInfo("Total Width (nm)", totalWidth * 1e9, 0, 0);
    if (n == 4)
        return EditInfo("Mobility (um^2/(s*V))", mobility * 1e12, 0, 0);
    return std::nullopt;
}

void MemristorElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        r_on = ei.value;
    if (n == 1)
        r_off = ei.value;
    if (n == 2)
        dopeWidth = ei.value * 1e-9;
    if (n == 3)
        totalWidth = ei.value * 1e-9;
    if (n == 4)
        mobility = ei.value * 1e-12;
}
