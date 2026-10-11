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

#include "InverterElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "GateElm.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/JsMath.h"
#include "../core/WireRouter.h"

InverterElm::InverterElm(int xx, int yy) : CircuitElm(xx, yy) {
    noDiagonal = true;
    slewRate = .5;
    highVoltage = GateElm::lastHighVoltage;
}

InverterElm::InverterElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    noDiagonal = true;
    slewRate = .5;
    highVoltage = 5;
    try {
        slewRate = parseFloatStrict(st.nextToken());
        highVoltage = parseFloatStrict(st.nextToken());
    } catch (...) {}
}

void InverterElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "sl", slewRate);
    CircuitXMLSerializer::dumpAttr(elem, "hi", highVoltage);
}

void InverterElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    slewRate = xml.parseDoubleAttr("sl", slewRate);
    highVoltage = xml.parseDoubleAttr("hi", highVoltage);
}

void InverterElm::setPoints() {
    CircuitElm::setPoints();
    int hs = 16;
    int ww = 16;
    if (ww > dn / 2)
        ww = (int) std::floor(dn / 2);
    lead1 = interpPoint(point1, point2, .5 - ww / dn);
    lead2 = interpPoint(point1, point2, .5 + (ww + 2) / dn);
    Point start;
    double end;
    if (hasFlag(FLAG_DEMORGAN)) {
        pcircle = interpPoint(point1, point2, .5 - (ww - 4) / dn);  // Move circle to front
        start = interpPoint(point1, point2, .5 - (ww - 8) / dn);    // Shift triangle so overall
        end = .5 + (ww + 2) / dn;                                   // symbol takes up same space
    } else {
        pcircle = interpPoint(point1, point2, .5 + (ww - 1) / dn);  // Normal symbol circle
        start = lead1;
        end = .5 + (ww - 5) / dn;
    }
    if (GateElm::useEuroGates()) {
        std::vector<Point> pts = newPointArray(4);
        Point l2 = interpPoint(point1, point2, .5 + (ww - 5) / dn);
        interpPoint2(lead1, l2, pts[0], pts[1], 0, hs);
        interpPoint2(lead1, l2, pts[3], pts[2], 1, hs);
        gatePoly = createPolygon(pts);
        center = interpPoint(lead1, l2, .5);
    } else {
        std::vector<Point> triPoints = newPointArray(3);
        interpPoint2(start, lead2, triPoints[0], triPoints[1], 0, hs);
        triPoints[2] = interpPoint(point1, point2, end);
        gatePoly = createPolygon(triPoints);
    }
    setBbox(point1, point2, hs);
}

void InverterElm::stamp() {
    sim->stampVoltageSource(CircuitNode::ground, nodes[1], voltSource);
}

void InverterElm::doStep() {
    double out = nodes[0]->v > highVoltage * .5 ? 0 : highVoltage;
    double maxStep = slewRate * sim->timeStep * 1e9;
    out = std::max(std::min(lastOutputVoltage + maxStep, out), lastOutputVoltage - maxStep);
    sim->updateVoltageSource(CircuitNode::ground, nodes[1], voltSource, out);
}

void InverterElm::draw(Graphics &g) {
    drawPosts(g);
    draw2Leads(g);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    drawThickPolygon(g, gatePoly);
    if (GateElm::useEuroGates())
        drawCenteredText(g, "1", center.x, center.y - 6, true);
    drawThickCircle(g, pcircle.x, pcircle.y, 3);
    curcount = updateDotCount(current, curcount);
    drawDots(g, lead2, point2, curcount);
}

void InverterElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "inverter";
    arr[1] = "Vi = " + getVoltageText(nodes[0]->v);
    arr[2] = "Vo = " + getVoltageText(nodes[1]->v);
}

std::optional<EditInfo> InverterElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Slew Rate (V/ns)", slewRate, 0, 0);
    if (n == 1)
        return EditInfo("High Logic Voltage", highVoltage, 1, 10).setUnitStep();
    if (n == 2)
        return EditInfo::createCheckbox("DeMorgan's Symbol", hasFlag(FLAG_DEMORGAN));
    return std::nullopt;
}

void InverterElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        slewRate = ei.value;
    if (n == 1)
        highVoltage = GateElm::lastHighVoltage = ei.value;
    if (n == 2) {
        flags = ei.changeFlag(flags, FLAG_DEMORGAN);
        setPoints();
    }
}

void InverterElm::addRoutingObstacle(WireRouter &wr) {
    addRoutingObstacleWithLeads(wr, 16);
}
