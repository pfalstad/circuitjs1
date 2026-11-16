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

#include "InvertingSchmittElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

InvertingSchmittElm::InvertingSchmittElm(int xx, int yy) : CircuitElm(xx, yy) {
    noDiagonal = true;
    slewRate = .5;
    state = false;
    lowerTrigger = 1.66;
    upperTrigger = 3.33;
    logicOnLevel = 5;
    logicOffLevel = 0;
}

InvertingSchmittElm::InvertingSchmittElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    noDiagonal = true;
    slewRate = .5;
    lowerTrigger = 1.66;
    upperTrigger = 3.33;
    logicOnLevel = 5;
    logicOffLevel = 0;
    try {
        slewRate = parseFloatStrict(st.nextToken());
        lowerTrigger = parseFloatStrict(st.nextToken());
        upperTrigger = parseFloatStrict(st.nextToken());
        logicOnLevel = parseFloatStrict(st.nextToken());
        logicOffLevel = parseFloatStrict(st.nextToken());
    } catch (...) {
    }
}

void InvertingSchmittElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "slr", slewRate);
    CircuitXMLSerializer::dumpAttr(elem, "lt", lowerTrigger);
    CircuitXMLSerializer::dumpAttr(elem, "ut", upperTrigger);
    CircuitXMLSerializer::dumpAttr(elem, "lon", logicOnLevel);
    CircuitXMLSerializer::dumpAttr(elem, "loff", logicOffLevel);
}

void InvertingSchmittElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    slewRate = xml.parseDoubleAttr("slr", slewRate);
    lowerTrigger = xml.parseDoubleAttr("lt", lowerTrigger);
    upperTrigger = xml.parseDoubleAttr("ut", upperTrigger);
    logicOnLevel = xml.parseDoubleAttr("lon", logicOnLevel);
    logicOffLevel = xml.parseDoubleAttr("loff", logicOffLevel);
}

void InvertingSchmittElm::draw(Graphics &g) {
    drawPosts(g);
    draw2Leads(g);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    drawThickPolygon(g, gatePoly);
    g.setLineWidth(2);
    drawPolygon(g, symbolPoly);
    g.setLineWidth(1);
    drawThickCircle(g, pcircle.x, pcircle.y, 3);
    curcount = updateDotCount(current, curcount);
    drawDots(g, lead2, point2, curcount);
}

void InvertingSchmittElm::setPoints() {
    CircuitElm::setPoints();
    const int hs = 16;
    double ww = 16;
    if (ww > dn / 2)
        ww = std::floor(dn / 2);
    lead1 = interpPoint(point1, point2, .5 - ww / dn);
    lead2 = interpPoint(point1, point2, .5 + (ww + 2) / dn);
    pcircle = interpPoint(point1, point2, .5 + (ww - 2) / dn);
    std::vector<Point> triPoints = newPointArray(3);
    interpPoint2(lead1, lead2, triPoints[0], triPoints[1], 0, hs);
    triPoints[2] = interpPoint(point1, point2, .5 + (ww - 5) / dn);

    gatePoly = createPolygon(triPoints);
    symbolPoly = getSchmittPolygon(1, .3);
    setBbox(point1, point2, hs);
}

void InvertingSchmittElm::stamp() {
    sim->stampVoltageSource(CircuitNode::ground, nodes[1], voltSource);
}

void InvertingSchmittElm::doStep() {
    double v0 = nodes[1]->v;
    double out;
    if (state) {
        // Output is high
        if (nodes[0]->v > upperTrigger) {
            // Input voltage high enough to set output low
            state = false;
            out = logicOffLevel;
        } else {
            out = logicOnLevel;
        }
    } else {
        // Output is low
        if (nodes[0]->v < lowerTrigger) {
            // Input voltage low enough to set output high
            state = true;
            out = logicOnLevel;
        } else {
            out = logicOffLevel;
        }
    }

    double maxStep = slewRate * sim->timeStep * 1e9;
    out = std::max(std::min(v0 + maxStep, out), v0 - maxStep);
    sim->updateVoltageSource(CircuitNode::ground, nodes[1], voltSource, out);
}

void InvertingSchmittElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "inverting Schmitt trigger";
    arr[1] = "Vi = " + getVoltageText(nodes[0]->v);
    arr[2] = "Vo = " + getVoltageText(nodes[1]->v);
}

std::optional<EditInfo> InvertingSchmittElm::getEditInfo(int n) {
    if (n == 0) {
        dlt = lowerTrigger;
        return EditInfo("Lower threshold (V)", lowerTrigger, 0.01, 5);
    }
    if (n == 1) {
        dut = upperTrigger;
        return EditInfo("Upper threshold (V)", upperTrigger, 0.01, 5);
    }
    if (n == 2)
        return EditInfo("Slew Rate (V/ns)", slewRate, 0, 0);
    if (n == 3)
        return EditInfo("High Logic Voltage", logicOnLevel, 0, 0).setUnitStep();
    if (n == 4)
        return EditInfo("Low Voltage (V)", logicOffLevel, 0, 0).setUnitStep();

    return std::nullopt;
}

void InvertingSchmittElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        dlt = ei.value;
    if (n == 1)
        dut = ei.value;
    if (n == 2)
        slewRate = ei.value;
    if (n == 3)
        logicOnLevel = ei.value;
    if (n == 4)
        logicOffLevel = ei.value;

    if (dlt > dut) {
        upperTrigger = dlt;
        lowerTrigger = dut;
    } else {
        upperTrigger = dut;
        lowerTrigger = dlt;
    }
}

void SchmittElm::doStep() {
    double out;
    if (state) {
        // Output is high
        if (nodes[0]->v > upperTrigger) {
            // Input voltage high enough to set output high
            state = false;
            out = logicOnLevel;
        } else {
            out = logicOffLevel;
        }
    } else {
        // Output is low
        if (nodes[0]->v < lowerTrigger) {
            // Input voltage low enough to set output low
            state = true;
            out = logicOffLevel;
        } else {
            out = logicOnLevel;
        }
    }

    double maxStep = slewRate * sim->timeStep * 1e9;
    out = std::max(std::min(lastOutputVoltage + maxStep, out), lastOutputVoltage - maxStep);
    sim->updateVoltageSource(CircuitNode::ground, nodes[1], voltSource, out);
}

void SchmittElm::draw(Graphics &g) {
    drawPosts(g);
    draw2Leads(g);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    drawThickPolygon(g, gatePoly);
    g.setLineWidth(2);
    drawPolygon(g, symbolPoly);
    g.setLineWidth(1);
    curcount = updateDotCount(current, curcount);
    drawDots(g, lead2, point2, curcount);
}

void SchmittElm::setPoints() {
    InvertingSchmittElm::setPoints();
    const int hs = 16;
    double ww = 16;
    if (ww > dn / 2)
        ww = std::floor(dn / 2);
    lead1 = interpPoint(point1, point2, .5 - ww / dn);
    lead2 = interpPoint(point1, point2, .5 + (ww - 3) / dn);
    std::vector<Point> triPoints = newPointArray(3);
    interpPoint2(lead1, lead2, triPoints[0], triPoints[1], 0, hs);
    triPoints[2] = interpPoint(point1, point2, .5 + (ww - 5) / dn);
    gatePoly = createPolygon(triPoints);
}
