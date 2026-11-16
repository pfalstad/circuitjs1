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

#include "DiacElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

DiacElm::DiacElm(int xx, int yy) : CircuitElm(xx, yy), diode1(sim), diode2(sim) {
    offresistance = 1e8;
    onresistance = 500;
    breakdown = 30;
    holdcurrent = .01;
    createDiodes();
}

DiacElm::DiacElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f), diode1(sim), diode2(sim) {
    onresistance = parseFloatStrict(st.nextToken());
    offresistance = parseFloatStrict(st.nextToken());
    breakdown = parseFloatStrict(st.nextToken());
    holdcurrent = parseFloatStrict(st.nextToken());
    createDiodes();
}

void DiacElm::createDiodes() {
    diode1 = Diode(sim);
    diode2 = Diode(sim);
    diode1.setupForDefaultModel();
    diode2.setupForDefaultModel();
}

void DiacElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ron", onresistance);
    CircuitXMLSerializer::dumpAttr(elem, "roff", offresistance);
    CircuitXMLSerializer::dumpAttr(elem, "bd", breakdown);
    CircuitXMLSerializer::dumpAttr(elem, "hc", holdcurrent);
}

void DiacElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    onresistance = xml.parseDoubleAttr("ron", onresistance);
    offresistance = xml.parseDoubleAttr("roff", offresistance);
    breakdown = xml.parseDoubleAttr("bd", breakdown);
    holdcurrent = xml.parseDoubleAttr("hc", holdcurrent);
}

void DiacElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(16);

    plate1 = newPointArray(2);
    plate2 = newPointArray(2);
    interpPoint2(lead1, lead2, plate1[0], plate1[1], 0, 16);
    interpPoint2(lead1, lead2, plate2[0], plate2[1], 1, 16);

    arrows.assign(2, Polygon());
    for (int i = 0; i != 2; i++) {
        int sgn = -1 + i * 2;
        Point p1 = interpPoint(lead1, lead2, i, 8 * sgn);
        Point p2 = interpPoint(lead1, lead2, 1 - i, 16 * sgn);
        Point p3 = interpPoint(lead1, lead2, 1 - i, 0 * sgn);
        arrows[i] = createPolygon(p1, p2, p3);
    }
}

void DiacElm::draw(Graphics &g) {
    double v1 = nodes[0]->v;
    double v2 = nodes[1]->v;
    setBbox(point1, point2, 6);
    draw2Leads(g);
    setVoltageColor(g, v1);
    setPowerColor(g, true);
    drawThickLine(g, plate1[0], plate1[1]);
    setVoltageColor(g, v2);
    setPowerColor(g, true);
    drawThickLine(g, plate2[0], plate2[1]);
    g.fillPolygon(arrows[0]);
    setVoltageColor(g, v1);
    setPowerColor(g, true);
    g.fillPolygon(arrows[1]);
    setPowerColor(g, true);
    doDots(g);
    drawPosts(g);
}

void DiacElm::calculateCurrent() {
    double r = state ? onresistance : offresistance;
    current = (nodes[0]->v - nodes[2]->v) / r + (nodes[0]->v - nodes[3]->v) / r;
}

void DiacElm::startIteration() {
    double vd = nodes[0]->v - nodes[1]->v;
    if (std::abs(current) < holdcurrent)
        state = false;
    if (std::abs(vd) > breakdown)
        state = true;
}

void DiacElm::doStep() {
    double r = state ? onresistance : offresistance;
    sim->stampResistor(nodes[0], nodes[2], r);
    sim->stampResistor(nodes[0], nodes[3], r);
    diode1.doStep(nodes[2]->v - nodes[1]->v);
    diode2.doStep(nodes[1]->v - nodes[3]->v);
}

void DiacElm::stamp() {
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
    diode1.stamp(nodes[2], nodes[1]);
    diode2.stamp(nodes[1], nodes[3]);
}

void DiacElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "DIAC";
    getBasicInfo(arr);
    arr[3] = state ? "on" : "off";
    arr[4] = "Ron = " + getUnitText(onresistance, Locale::ohmString);
    arr[5] = "Roff = " + getUnitText(offresistance, Locale::ohmString);
    arr[6] = "Vbrkdn = " + getUnitText(breakdown, "V");
    arr[7] = "Ihold = " + getUnitText(holdcurrent, "A");
    arr[8] = "P = " + getUnitText(getPower(), "W");
}

std::optional<EditInfo> DiacElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("On resistance (ohms)", onresistance, 0, 0);
    if (n == 1)
        return EditInfo("Off resistance (ohms)", offresistance, 0, 0);
    if (n == 2)
        return EditInfo("Breakdown voltage (volts)", breakdown, 0, 0);
    if (n == 3)
        return EditInfo("Hold current (amps)", holdcurrent, 0, 0);
    return std::nullopt;
}

void DiacElm::setEditValue(int n, EditInfo &ei) {
    if (ei.value > 0 && n == 0)
        onresistance = ei.value;
    if (ei.value > 0 && n == 1)
        offresistance = ei.value;
    if (ei.value > 0 && n == 2)
        breakdown = ei.value;
    if (ei.value > 0 && n == 3)
        holdcurrent = ei.value;
}
