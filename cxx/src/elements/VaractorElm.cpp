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

#include "VaractorElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/DiodeModel.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

VaractorElm::VaractorElm(int xx, int yy) : DiodeElm(xx, yy) {
    baseCapacitance = 4e-12;
}

VaractorElm::VaractorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : DiodeElm(xa, ya, xb, yb, f, st) {
    capvoltdiff = parseFloatStrict(st.nextToken());
    baseCapacitance = parseFloatStrict(st.nextToken());
}

void VaractorElm::getInfo(std::vector<std::string> &arr) {
    DiodeElm::getInfo(arr);
    arr[0] = "varactor";
    arr[5] = "C = " + getUnitText(capacitance, "F");
}

void VaractorElm::stepFinished() {
    capvoltdiff = nodes[0]->v - nodes[1]->v;
}

void VaractorElm::calculateCurrent() {
    DiodeElm::calculateCurrent();
    current += capCurrent;
}

void VaractorElm::reset() {
    DiodeElm::reset();
    capvoltdiff = 0;
}

void VaractorElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    DiodeElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ca", capvoltdiff);
    CircuitXMLSerializer::dumpAttr(elem, "ba", baseCapacitance);
}

void VaractorElm::undumpXml(CircuitXMLDeserializer &xml) {
    DiodeElm::undumpXml(xml);
    capvoltdiff = xml.parseDoubleAttr("ca", capvoltdiff);
    baseCapacitance = xml.parseDoubleAttr("ba", baseCapacitance);
}

void VaractorElm::setPoints() {
    DiodeElm::setPoints();
    const double platef = .6;
    std::vector<Point> pa = newPointArray(2);
    interpPoint2(lead1, lead2, pa[0], pa[1], 0, hs);
    interpPoint2(lead1, lead2, cathode[0], cathode[1], platef, hs);
    Point arrowPoint = interpPoint(lead1, lead2, platef);
    poly = createPolygon(pa[0], pa[1], arrowPoint);
    // calc plates
    plate1 = newPointArray(2);
    plate2 = newPointArray(2);
    interpPoint2(lead1, lead2, plate1[0], plate1[1], platef, hs);
    interpPoint2(lead1, lead2, plate2[0], plate2[1], 1, hs);
}

void VaractorElm::draw(Graphics &g) {
    // draw leads and diode arrow
    drawDiode(g);

    // draw first plate
    setVoltageColor(g, nodes[0]->v);
    setPowerColor(g, false);
    drawThickLine(g, plate1[0], plate1[1]);
    if (showPower())
        g.setColor("#888888");

    // draw second plate
    setVoltageColor(g, nodes[1]->v);
    setPowerColor(g, false);
    drawThickLine(g, plate2[0], plate2[1]);

    doDots(g);
    drawPosts(g);
}

void VaractorElm::setVoltageSource(int n, VoltageSource *v) {
    DiodeElm::setVoltageSource(n, v);
    v->setNodes(nodes[0], nodes[2]);
}

void VaractorElm::stamp() {
    DiodeElm::stamp();
    sim->stampVoltageSource(nodes[0], nodes[2], voltSource);
    sim->stampNonLinear(nodes[2]);
}

void VaractorElm::startIteration() {
    DiodeElm::startIteration();
    // capacitor companion model using trapezoidal approximation
    // (Thevenin equivalent) consists of a voltage source in
    // series with a resistor
    double c0 = baseCapacitance;
    if (capvoltdiff > 0)
        capacitance = c0;
    else
        capacitance = c0 / jsmath::pow(1 - capvoltdiff / model->fwdrop, .5);
    compResistance = sim->timeStep / (2 * capacitance);
    voltSourceValue = -capvoltdiff - capCurrent * compResistance;
}

void VaractorElm::doStep() {
    DiodeElm::doStep();
    sim->stampResistor(nodes[2], nodes[1], compResistance);
    sim->updateVoltageSource(nodes[0], nodes[2], voltSource, voltSourceValue);
}

std::optional<EditInfo> VaractorElm::getEditInfo(int n) {
    if (n == 1)
        return EditInfo("Capacitance @ 0V (F)", baseCapacitance, 10, 1000);
    return DiodeElm::getEditInfo(n);
}

void VaractorElm::setEditValue(int n, EditInfo &ei) {
    if (n == 1) {
        baseCapacitance = ei.value;
        return;
    }
    DiodeElm::setEditValue(n, ei);
}
