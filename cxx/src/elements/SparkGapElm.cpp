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

#include "SparkGapElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

SparkGapElm::SparkGapElm(int xx, int yy) : CircuitElm(xx, yy) {
    offresistance = 1e9;
    onresistance = 1e3;
    breakdown = 1e3;
    holdcurrent = 0.001;
    state = false;
    resistance = offresistance;
}

SparkGapElm::SparkGapElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    onresistance = parseFloatStrict(st.nextToken());
    offresistance = parseFloatStrict(st.nextToken());
    breakdown = parseFloatStrict(st.nextToken());
    holdcurrent = parseFloatStrict(st.nextToken());
    state = false;
    resistance = offresistance;
}

void SparkGapElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "on", onresistance);
    CircuitXMLSerializer::dumpAttr(elem, "of", offresistance);
    CircuitXMLSerializer::dumpAttr(elem, "br", breakdown);
    CircuitXMLSerializer::dumpAttr(elem, "ho", holdcurrent);
}

void SparkGapElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    onresistance = xml.parseDoubleAttr("on", onresistance);
    offresistance = xml.parseDoubleAttr("of", offresistance);
    breakdown = xml.parseDoubleAttr("br", breakdown);
    holdcurrent = xml.parseDoubleAttr("ho", holdcurrent);
}

void SparkGapElm::setPoints() {
    CircuitElm::setPoints();
    const int dist = 16;
    const int alen = 8;
    calcLeads(dist + alen);
    Point p1 = interpPoint(point1, point2, (dn - alen) / (2 * dn));
    arrow1 = calcArrow(point1, p1, alen, alen);
    p1 = interpPoint(point1, point2, (dn + alen) / (2 * dn));
    arrow2 = calcArrow(point2, p1, alen, alen);
}

void SparkGapElm::draw(Graphics &g) {
    setBbox(point1, point2, 8);
    draw2Leads(g);
    setVoltageColor(g, nodes[0]->v);
    setPowerColor(g, true);
    g.fillPolygon(arrow1);
    setVoltageColor(g, nodes[1]->v);
    setPowerColor(g, true);
    g.fillPolygon(arrow2);
    if (state)
        doDots(g);
    drawPosts(g);
}

void SparkGapElm::calculateCurrent() {
    double vd = nodes[0]->v - nodes[1]->v;
    current = vd / resistance;
}

void SparkGapElm::reset() {
    CircuitElm::reset();
    state = false;
}

void SparkGapElm::startIteration() {
    if (std::abs(current) < holdcurrent)
        state = false;
    double vd = nodes[0]->v - nodes[1]->v;
    if (std::abs(vd) > breakdown)
        state = true;
}

void SparkGapElm::doStep() {
    resistance = state ? onresistance : offresistance;
    sim->stampResistor(nodes[0], nodes[1], resistance);
}

void SparkGapElm::stamp() {
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
}

void SparkGapElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "spark gap";
    getBasicInfo(arr);
    arr[3] = state ? "on" : "off";
    arr[4] = "Ron = " + getUnitText(onresistance, Locale::ohmString);
    arr[5] = "Roff = " + getUnitText(offresistance, Locale::ohmString);
    arr[6] = "Vbreakdown = " + getUnitText(breakdown, "V");
}

std::optional<EditInfo> SparkGapElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("On resistance (ohms)", onresistance, 0, 0);
    if (n == 1)
        return EditInfo("Off resistance (ohms)", offresistance, 0, 0);
    if (n == 2)
        return EditInfo("Breakdown voltage", breakdown, 0, 0);
    if (n == 3)
        return EditInfo("Holding current (A)", holdcurrent, 0, 0);
    return std::nullopt;
}

void SparkGapElm::setEditValue(int n, EditInfo &ei) {
    if (ei.value > 0 && n == 0)
        onresistance = ei.value;
    if (ei.value > 0 && n == 1)
        offresistance = ei.value;
    if (ei.value > 0 && n == 2)
        breakdown = ei.value;
    if (ei.value > 0 && n == 3)
        holdcurrent = ei.value;
}
