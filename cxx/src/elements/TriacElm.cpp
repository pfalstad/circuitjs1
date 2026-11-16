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

#include "TriacElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

TriacElm::TriacElm(int xx, int yy) : CircuitElm(xx, yy), diode03(sim), diode30(sim) {
    setDefaults();
    setup();
}

TriacElm::TriacElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f), diode03(sim), diode30(sim) {
    setDefaults();
    triggerI = parseFloatStrict(st.nextToken());
    holdingI = parseFloatStrict(st.nextToken());
    cresistance = parseFloatStrict(st.nextToken());
    state = st.nextToken() == "true";
    setup();
}

void TriacElm::setDefaults() {
    holdingI = .0082;
    triggerI = .01;
    cresistance = 100;
}

void TriacElm::setup() {
    diode03 = Diode(sim);
    diode03.setupForDefaultModel();
    diode30 = Diode(sim);
    diode30.setupForDefaultModel();
}

void TriacElm::reset() {
    diode03.reset();
    diode30.reset();
    curcount_1 = curcount_2 = curcount_g = 0;
}

void TriacElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ti", triggerI);
    CircuitXMLSerializer::dumpAttr(elem, "hi", holdingI);
    CircuitXMLSerializer::dumpAttr(elem, "cr", cresistance);
}

void TriacElm::dumpXmlState(XmlElement *doc, XmlElement *elem) {
    CircuitXMLSerializer::dumpAttr(elem, "st", state);
}

void TriacElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    triggerI = xml.parseDoubleAttr("ti", triggerI);
    holdingI = xml.parseDoubleAttr("hi", holdingI);
    cresistance = xml.parseDoubleAttr("cr", cresistance);
    state = xml.parseBooleanAttr("st", state);
    setup();
}

void TriacElm::setPoints() {
    CircuitElm::setPoints();
    int dir = 0;
    if (std::abs(dx) > std::abs(dy)) {
        dir = -sign(dx) * sign(dy);
        dn = std::abs(dx);
        point2.y = point1.y;
    } else {
        dir = sign(dy) * sign(dx);
        dn = std::abs(dy);
        point2.x = point1.x;
    }
    if (dir == 0)
        dir = 1;

    calcLeads(16);

    plate1 = newPointArray(2);
    plate2 = newPointArray(2);
    gate = newPointArray(2);
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

    double gatelen = app->gridSize;
    double leadlen = (dn - 16) / 2;
    double gatelenAdj = gatelen + std::fmod(leadlen, app->gridSize);
    if (leadlen < gatelenAdj) {
        x2 = x;
        y2 = y;
        return;
    }
    gate[0] = interpPoint(lead2, point2, gatelenAdj / leadlen, gatelenAdj * dir);
    gate[1] = interpPoint(lead2, point2, gatelenAdj / leadlen, app->gridSize * 2 * dir);
}

void TriacElm::draw(Graphics &g) {
    double v1 = nodes[0]->v;
    double v2 = nodes[1]->v;
    setBbox(point1, point2, 6);
    adjustBbox(gate[0], gate[1]);

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
    setVoltageColor(g, nodes[gnode]->v);

    drawThickLine(g, lead2, gate[0]);
    drawThickLine(g, gate[0], gate[1]);

    curcount_1 = updateDotCount(i1, curcount_1);
    curcount_2 = updateDotCount(i2, curcount_2);
    curcount_g = updateDotCount(ig, curcount_g);
    if (!isCreating()) {
        drawDots(g, point1, lead2, curcount_2);
        drawDots(g, point2, lead2, curcount_1);
        drawDots(g, gate[1], gate[0], curcount_g);
        drawDots(g, gate[0], lead2, addCurCount(curcount_g, distance(gate[1], gate[0])));
    }

    if ((needsHighlight() || isCreating()) && point1.x == point2.x && point2.y > point1.y) {
        g.setColor(whiteColor);
        int ds = sign(dx);
        g.drawString("MT1", lead2.x + ((ds < 0) ? 5 : -30), lead2.y + 12);
        g.drawString("MT2", lead1.x + 5, lead1.y - 4);
        g.drawString("G", gate[0].x, gate[0].y + 12);
    }

    drawPosts(g);
}

double TriacElm::getCurrentIntoNode(int n) {
    if (n == 0)
        return -i2;
    if (n == 1)
        return -i1;
    return -ig;
}

void TriacElm::stamp() {
    sim->stampNonLinear(nodes[mt1node]);
    sim->stampNonLinear(nodes[mt2node]);
    sim->stampNonLinear(nodes[gnode]);
    sim->stampNonLinear(nodes[mtinode]);
    sim->stampResistor(nodes[gnode], nodes[mt1node], cresistance);
    diode03.stamp(nodes[mt2node], nodes[mtinode]);
    diode30.stamp(nodes[mtinode], nodes[mt2node]);
}

void TriacElm::startIteration() {
    if (std::abs(i2) < holdingI)
        state = false;
    if (std::abs(ig) > triggerI)
        state = true;
    aresistance = state ? .01 : 10e5;
}

void TriacElm::doStep() {
    diode03.doStep(nodes[mt2node]->v - nodes[mtinode]->v);
    diode30.doStep(nodes[mtinode]->v - nodes[mt2node]->v);
    sim->stampResistor(nodes[mtinode], nodes[mt1node], aresistance);
}

void TriacElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "TRIAC";
    arr[1] = state ? "on" : "off";
    arr[2] = "Vmt2mt1 = " + getVoltageText(nodes[mt2node]->v - nodes[mt1node]->v);
    arr[3] = "Imt1 = " + getCurrentText(i1);
    arr[4] = "Imt2 = " + getCurrentText(i2);
    arr[5] = "Ig = " + getCurrentText(ig);
    arr[6] = "P = " + getUnitText(getPower(), "W");
}

void TriacElm::calculateCurrent() {
    if (aresistance == 0)
        i2 = 0;
    else
        i2 = (nodes[mtinode]->v - nodes[mt1node]->v) / aresistance;
    ig = -(nodes[mt1node]->v - nodes[gnode]->v) / cresistance;
    i1 = -i2 - ig;
}

double TriacElm::getPower() {
    return (nodes[mt2node]->v - nodes[mt1node]->v) * i2 +
        (nodes[gnode]->v - nodes[mt1node]->v) * ig;
}

std::optional<EditInfo> TriacElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Trigger Current (A)", triggerI, 0, 0).setPositive();
    if (n == 1)
        return EditInfo("Holding Current (A)", holdingI, 0, 0).setPositive();
    if (n == 2)
        return EditInfo("Gate-MT1 Resistance (ohms)", cresistance, 0, 0).setPositive();
    return std::nullopt;
}

void TriacElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        triggerI = ei.value;
    if (n == 1)
        holdingI = ei.value;
    if (n == 2)
        cresistance = ei.value;
}
