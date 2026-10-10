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

#include "CapacitorElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/FindPathInfo.h"
#include "../core/JsNumber.h"
#include "../core/ScopeConstants.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/JsMath.h"

CapacitorElm::CapacitorElm(int xx, int yy) : CircuitElm(xx, yy) {
    capacitance = 1e-5;
    initialVoltage = 1e-3;
    compResistance = 0;
    voltdiff = 0;
    seriesResistance = 0;
    capNode2 = 0;
    curSourceValue = 0;
}

CapacitorElm::CapacitorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    capacitance = parseFloatStrict(st.nextToken());
    voltdiff = parseFloatStrict(st.nextToken());
    initialVoltage = 1e-3;
    compResistance = 0;
    capNode2 = 0;
    seriesResistance = 0;
    curSourceValue = 0;
    try {
        initialVoltage = parseFloatStrict(st.nextToken());
        if ((flags & FLAG_RESISTANCE) != 0)
            seriesResistance = parseFloatStrict(st.nextToken());

        // if you add more things here, check PolarCapacitorElm.  It loads more state after this
    } catch (...) {}
    allocNodes();
}

void CapacitorElm::reset() {
    CircuitElm::reset();
    current = curcount = curSourceValue = 0;
    // put small charge on caps when reset to start oscillators
    voltdiff = initialVoltage;
}

void CapacitorElm::shorted() {
    CircuitElm::reset();
    voltdiff = current = curcount = curSourceValue = 0;
}

std::string CapacitorElm::dump() {
    flags |= FLAG_RESISTANCE;
    return CircuitElm::dump() + " " + jsNumberToString(capacitance) + " " + jsNumberToString(voltdiff) + " " +
        jsNumberToString(initialVoltage) + " " + jsNumberToString(seriesResistance);
}

void CapacitorElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "c", capacitance);
    CircuitXMLSerializer::dumpAttr(elem, "iv", initialVoltage);
    CircuitXMLSerializer::dumpAttr(elem, "sr", seriesResistance);
    // PolarCapacitorElm uses mv
}

void CapacitorElm::dumpXmlState(XmlElement *doc, XmlElement *elem) {
    CircuitXMLSerializer::dumpAttr(elem, "vd", voltdiff);
}

void CapacitorElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    capacitance = xml.parseDoubleAttr("c", capacitance);
    initialVoltage = xml.parseDoubleAttr("iv", initialVoltage);
    seriesResistance = xml.parseDoubleAttr("sr", seriesResistance);
    voltdiff = xml.parseDoubleAttr("vd", voltdiff);
    allocNodes();
}

void CapacitorElm::setPoints() {
    CircuitElm::setPoints();
    double f = (dn / 2 - 4) / dn;
    // calc leads
    lead1 = interpPoint(point1, point2, f);
    lead2 = interpPoint(point1, point2, 1 - f);
    // calc plates
    plate1 = newPointArray(2);
    plate2 = newPointArray(2);
    interpPoint2(point1, point2, plate1[0], plate1[1], f, 12);
    interpPoint2(point1, point2, plate2[0], plate2[1], 1 - f, 12);
}

void CapacitorElm::stamp() {
    if (doDcAnalysis()) {
        // when finding DC operating point, replace cap with a 100M resistor
        sim->stampResistor(nodes[0], nodes[1], 1e8);
        curSourceValue = 0;
        capNode2 = 1;
        return;
    }

    // The capacitor model is between nodes 0 and capNode2.  For an
    // ideal capacitor, capNode2 is node 1.  If series resistance, capNode2 = 2
    // and we place a resistor between nodes 2 and 1.
    // 2 is an internal node, 0 and 1 are the capacitor terminals.
    capNode2 = (seriesResistance > 0) ? 2 : 1;

    // capacitor companion model using trapezoidal approximation
    // (Norton equivalent) consists of a current source in
    // parallel with a resistor.  Trapezoidal is more accurate
    // than backward euler but can cause oscillatory behavior
    // if RC is small relative to the timestep.
    if (isTrapezoidal())
        compResistance = sim->timeStep / (2 * capacitance);
    else
        compResistance = sim->timeStep / capacitance;
    sim->stampResistor(nodes[0], nodes[capNode2], compResistance);
    if (seriesResistance > 0)
        sim->stampResistor(nodes[1], nodes[2], seriesResistance);
}

void CapacitorElm::startIteration() {
    if (isTrapezoidal())
        curSourceValue = -voltdiff / compResistance - current;
    else
        curSourceValue = -voltdiff / compResistance;
}

void CapacitorElm::stepFinished() {
    voltdiff = nodes[0]->v - nodes[capNode2]->v;
    calculateCurrent();
}

void CapacitorElm::calculateCurrent() {
    double vd = nodes[0]->v - nodes[capNode2]->v;
    if (doDcAnalysis()) {
        current = vd / 1e8;
        return;
    }
    // we check compResistance because this might get called
    // before stamp(), which sets compResistance, causing
    // infinite current
    if (compResistance > 0)
        current = vd / compResistance + curSourceValue;
}

void CapacitorElm::doStep() {
    if (doDcAnalysis())
        return;
    sim->stampCurrentSource(nodes[0], nodes[capNode2], curSourceValue);
}

int CapacitorElm::getInternalNodeCount() {
    return (!doDcAnalysis() && seriesResistance > 0) ? 1 : 0;
}

double CapacitorElm::getScopeValue(int x) {
    if (x == ScopeConstants::VAL_CHARGE)
        return capacitance * voltdiff;
    return CircuitElm::getScopeValue(x);
}

int CapacitorElm::getScopeUnits(int x) {
    if (x == ScopeConstants::VAL_CHARGE)
        return ScopeConstants::UNITS_C;
    return CircuitElm::getScopeUnits(x);
}

bool CapacitorElm::validate() {
    if (isIdealCapacitor()) {
        FindPathInfo fpi(FindPathInfo::SHORT, this, getNode(1), sim);
        if (fpi.findPath(getNode(0))) {
            SimulationManager::console(getClassName() + " shorted");
            shorted();
        } else {
            FindPathInfo fpi2(FindPathInfo::CAP_V, this, getNode(1), sim);
            if (fpi2.findPath(getNode(0))) {
                // loop of ideal capacitors; set a small series resistance to avoid
                // oscillation in case one of them has voltage on it
                setSeriesResistance(.1);
                return false;
            }
        }
    }
    return true;
}

void CapacitorElm::draw(Graphics &g) {
    int hs = 12;
    setBbox(point1, point2, hs);

    // draw first lead and plate
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1);
    setPowerColor(g, false);
    drawThickLine(g, plate1[0], plate1[1]);
    if (showPower())
        g.setColor(Color::gray);

    // draw second lead and plate
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, point2, lead2);
    setPowerColor(g, false);
    if (platePoints.empty())
        drawThickLine(g, plate2[0], plate2[1]);
    else {
        for (size_t i = 0; i + 1 < platePoints.size(); i++)
            drawThickLine(g, platePoints[i], platePoints[i + 1]);
    }

    updateDotCount();
    if (!isCreating()) {
        drawDots(g, point1, lead1, curcount);
        drawDots(g, point2, lead2, -curcount);
    }
    drawPosts(g);
    if (showValues()) {
        std::string s = getShortUnitText(capacitance, "F");
        drawValues(g, s, hs);
    }
}

void CapacitorElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "capacitor";
    getBasicInfo(arr);
    arr[3] = "C = " + getUnitText(capacitance, "F");
    arr[4] = "P = " + getUnitText(getPower(), "W");
    arr[5] = "Q = " + getUnitText(capacitance * voltdiff, "C");
}

std::string CapacitorElm::getScopeText(int) {
    return Locale::LS("capacitor") + ", " + getUnitText(capacitance, "F");
}

std::optional<EditInfo> CapacitorElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Capacitance (F)", capacitance, 1e-6, 1e-3);
    if (n == 1) {
        EditInfo ei("", 0, -1, -1);
        ei.checkbox = Checkbox("Trapezoidal Approximation", isTrapezoidal());
        return ei;
    }
    if (n == 2)
        return EditInfo("Initial Voltage (on Reset)", initialVoltage);
    if (n == 3)
        return EditInfo("Series Resistance", seriesResistance);
    // if you add more things here, check PolarCapacitorElm
    return std::nullopt;
}

void CapacitorElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        capacitance = (ei.value > 0) ? ei.value : 1e-12;
    if (n == 1) {
        if (ei.checkbox->getState())
            flags &= ~FLAG_BACK_EULER;
        else
            flags |= FLAG_BACK_EULER;
    }
    if (n == 2)
        initialVoltage = ei.value;
    if (n == 3) {
        seriesResistance = ei.value;
        allocNodes();
    }
}
