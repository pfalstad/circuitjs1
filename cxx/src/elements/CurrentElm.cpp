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

#include "CurrentElm.h"

#include <cmath>

#include "../core/JsMath.h"
#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/FindPathInfo.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"

CurrentElm::CurrentElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    try {
        currentValue = parseFloatStrict(st.nextToken());
        maxVoltage = parseFloatStrict(st.nextToken());
    } catch (...) {}
    if (currentValue == 0)
        currentValue = 0.01;
}

void CurrentElm::reset() {
    CircuitElm::reset();
    lastVoltDiff = 0;
}

void CurrentElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "cu", currentValue);
    if (maxVoltage > 0)
        CircuitXMLSerializer::dumpAttr(elem, "mv", maxVoltage);
}

void CurrentElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    currentValue = xml.parseDoubleAttr("cu", currentValue);
    maxVoltage = xml.parseDoubleAttr("mv", 0);
}

void CurrentElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(26);
    ashaft1 = interpPoint(lead1, lead2, 0.25);
    ashaft2 = interpPoint(lead1, lead2, 0.6);
    center = interpPoint(lead1, lead2, 0.5);
    Point p2 = interpPoint(lead1, lead2, 0.75);
    arrow = calcArrow(center, p2, 4, 4);
}

// we defer stamping current sources until we can tell if they have a current path or not
void CurrentElm::stamp() {
    if (broken) {
        // no current path; stamping a current source would cause a matrix error
        sim->stampResistor(nodes[0], nodes[1], 1e8);
        current = 0;
    } else if (isVoltageLimited()) {
        // nonlinear; doStep() handles the smooth-saturation companion model
        sim->stampNonLinear(nodes[0]);
        sim->stampNonLinear(nodes[1]);
    } else {
        // ideal current source
        sim->stampCurrentSource(nodes[0], nodes[1], currentValue);
        current = currentValue;
    }
}

// Smooth voltage compliance via tanh-shaped saturation.
// Transition starts at 0.95*maxVoltage and ends at maxVoltage:
//   vd < 0.95*Vmax  ->  i ~= currentValue  (tanh arg ~= -2.5)
//   vd > Vmax       ->  i ~= 0              (tanh arg ~= +2.5)
// tanh is centered at 0.975*Vmax with scale vt = vWidth/5.
void CurrentElm::doStep() {
    if (broken || !isVoltageLimited())
        return;
    double vd = nodes[1]->v - nodes[0]->v;
    double vStart = 0.95 * maxVoltage;
    double vWidth = maxVoltage - vStart;
    double vMid = (vStart + maxVoltage) / 2.0;
    double vt = std::max(vWidth / 5.0, 1e-3);
    // Step-size limit: prevent crossing the transition region in one Newton step.
    if (lastVoltDiff < vStart && vd > vStart) {
        vd = vStart;
        sim->converged = false;
    } else if (lastVoltDiff > maxVoltage && vd < maxVoltage) {
        vd = maxVoltage;
        sim->converged = false;
    } else if (lastVoltDiff >= vStart && lastVoltDiff <= maxVoltage) {
        double maxStep = std::max(vWidth / 4.0, 0.01);
        if (vd > lastVoltDiff + maxStep) {
            vd = lastVoltDiff + maxStep;
            sim->converged = false;
        } else if (vd < lastVoltDiff - maxStep) {
            vd = lastVoltDiff - maxStep;
            sim->converged = false;
        }
    }
    lastVoltDiff = vd;
    double arg = (vd - vMid) / vt;
    double tanhArg = jsmath::tanh(arg);
    double i = currentValue * 0.5 * (1.0 - tanhArg);
    double sech2 = 1.0 - tanhArg * tanhArg;
    double g = -currentValue * 0.5 * sech2 / vt * vd;
    // Norton companion: parallel resistor (1/|g|) + adjusted current source.
    // Gmin floor keeps the Norton resistance finite when sech^2 is
    // vanishing (well inside or well outside compliance) so the matrix
    // stays non-singular and Newton steps remain bounded.
    double absG = std::abs(g) + 1e-6;
    sim->stampResistor(nodes[0], nodes[1], 1.0 / absG);
    sim->stampCurrentSource(nodes[0], nodes[1], i - g * vd);
    current = i;
}

bool CurrentElm::validate() {
    FindPathInfo fpi(FindPathInfo::INDUCT, this, getNode(1), sim);
    setBroken(!fpi.findPath(getNode(0)));
    return true;
}

void CurrentElm::draw(Graphics &g) {
    const int cr = 12;
    draw2Leads(g);
    setVoltageColor(g, (nodes[0]->v + nodes[1]->v) / 2);
    setPowerColor(g, false);

    drawThickCircle(g, center.x, center.y, cr);
    drawThickLine(g, ashaft1, ashaft2);

    g.fillPolygon(arrow);
    setBbox(point1, point2, cr);
    doDots(g);
    if (showValues() && current != 0) {
        std::string s = getShortUnitText(current, "A");
        if (dx == 0 || dy == 0)
            drawValues(g, s, cr);
    }
    drawPosts(g);
}

void CurrentElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "current source";
    int i = getBasicInfo(arr);
    arr[i++] = "P = " + getUnitText(getPower(), "W");
    if (isVoltageLimited())
        arr[i++] = "Vmax = " + getVoltageText(maxVoltage);
}

std::optional<EditInfo> CurrentElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Current (A)", currentValue, 0, 0.1);
    if (n == 1)
        return EditInfo("Max Voltage (V, 0=unlimited)", maxVoltage, 0, 0).setUnitStep();
    return std::nullopt;
}

void CurrentElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        currentValue = ei.value;
    if (n == 1 && ei.value >= 0)
        maxVoltage = ei.value;
}
