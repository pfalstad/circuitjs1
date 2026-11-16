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

#include "SCRElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

SCRElm::SCRElm(int xx, int yy) : CircuitElm(xx, yy), diode(sim) {
    setDefaults();
    flags |= FLAG_GATE_FIX;
    setup();
}

SCRElm::SCRElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f), diode(sim) {
    setDefaults();
    try {
        lastvac = parseFloatStrict(st.nextToken());
        lastvag = parseFloatStrict(st.nextToken());
        // volts[anode/cnode/gnode] were initialized here in Java, but nodes[]
        // isn't allocated until analyzeCircuit; initial voltages start at 0
        triggerI = parseFloatStrict(st.nextToken());
        holdingI = parseFloatStrict(st.nextToken());
        gresistance = parseFloatStrict(st.nextToken());
    } catch (...) {}
    setup();
}

void SCRElm::setDefaults() {
    gresistance = 50;
    holdingI = 0.0082;
    triggerI = 0.01;
}

void SCRElm::setup() {
    diode = Diode(sim);
    diode.setupForDefaultModel();
    aresistance = 1;  // to avoid divide by zero
}

void SCRElm::reset() {
    nodes[anode]->v = nodes[cnode]->v = nodes[gnode]->v = 0;
    diode.reset();
    lastvag = lastvac = curcount_a = curcount_c = curcount_g = 0;
}

void SCRElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "tr", triggerI);
    CircuitXMLSerializer::dumpAttr(elem, "ho", holdingI);
    CircuitXMLSerializer::dumpAttr(elem, "gr", gresistance);
}

void SCRElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    triggerI = xml.parseDoubleAttr("tr", triggerI);
    holdingI = xml.parseDoubleAttr("ho", holdingI);
    gresistance = xml.parseDoubleAttr("gr", gresistance);
    setup();
}

void SCRElm::setPoints() {
    CircuitElm::setPoints();
    dir = 0;
    if (std::abs(dx) > std::abs(dy)) {
        dir = -sign(dx) * sign(dy);
        // correct dn (length) or else calcLeads() may get confused, and also gate may be drawn weirdly.  Can't do this with old circuits or it may
        // break them
        if (applyGateFix())
            dn = std::abs(dx);
        point2.y = point1.y;
    } else {
        dir = sign(dy) * sign(dx);
        if (applyGateFix())
            dn = std::abs(dy);
        point2.x = point1.x;
    }
    if (dir == 0)
        dir = 1;
    calcLeads(16);
    cathode = newPointArray(2);
    std::vector<Point> pa = newPointArray(2);
    interpPoint2(lead1, lead2, pa[0], pa[1], 0, hs);
    interpPoint2(lead1, lead2, cathode[0], cathode[1], 1, hs);
    poly = createPolygon(pa[0], pa[1], lead2);

    gate = newPointArray(2);
    double leadlen = (dn - 16) / 2;
    double gatelen = app->gridSize;
    gatelen += std::fmod(leadlen, app->gridSize);
    if (leadlen < gatelen) {
        x2 = x;
        y2 = y;
        return;
    }
    interpPoint(lead2, point2, gate[0], gatelen / leadlen, gatelen * dir);
    interpPoint(lead2, point2, gate[1], gatelen / leadlen, app->gridSize * 2 * dir);
    gate[1].x = snapGrid(gate[1].x);
    gate[1].y = snapGrid(gate[1].y);
}

void SCRElm::draw(Graphics &g) {
    setBbox(point1, point2, hs);
    adjustBbox(gate[0], gate[1]);

    double v1 = nodes[anode]->v;
    double v2 = nodes[cnode]->v;

    draw2Leads(g);

    // draw arrow thingy
    setVoltageColor(g, v1);
    setPowerColor(g, true);
    g.fillPolygon(poly);

    setVoltageColor(g, nodes[gnode]->v);
    drawThickLine(g, lead2, gate[0]);
    drawThickLine(g, gate[0], gate[1]);

    // draw thing arrow is pointing to
    setVoltageColor(g, v2);
    setPowerColor(g, true);
    drawThickLine(g, cathode[0], cathode[1]);

    curcount_a = updateDotCount(ia, curcount_a);
    curcount_c = updateDotCount(ic, curcount_c);
    curcount_g = updateDotCount(ig, curcount_g);
    if (!isCreating()) {
        drawDots(g, point1, lead2, curcount_a);
        drawDots(g, point2, lead2, curcount_c);
        drawDots(g, gate[1], gate[0], curcount_g);
        drawDots(g, gate[0], lead2, curcount_g + distance(gate[1], gate[0]));
    }

    if ((needsHighlight() || isCreating()) && point1.x == point2.x && point2.y > point1.y) {
        g.setColor(whiteColor);
        int ds = sign(dx);
        g.drawString("C", lead2.x + ((ds < 0) ? 5 : -15), lead2.y + 12);
        g.drawString("A", lead1.x + 5, lead1.y - 4);
        g.drawString("G", gate[0].x, gate[0].y + 12);
    }

    drawPosts(g);
}

double SCRElm::getCurrentIntoNode(int n) {
    if (n == anode)
        return -ia;
    if (n == cnode)
        return -ic;
    return -ig;
}

double SCRElm::getPower() {
    return (nodes[anode]->v - nodes[gnode]->v) * ia +
           (nodes[cnode]->v - nodes[gnode]->v) * ic;
}

void SCRElm::stamp() {
    sim->stampNonLinear(nodes[anode]);
    sim->stampNonLinear(nodes[cnode]);
    sim->stampNonLinear(nodes[gnode]);
    sim->stampNonLinear(nodes[inode]);
    sim->stampResistor(nodes[gnode], nodes[cnode], gresistance);
    diode.stamp(nodes[inode], nodes[cnode]);
}

void SCRElm::doStep() {
    double vac = nodes[anode]->v - nodes[cnode]->v;  // typically negative
    double vag = nodes[anode]->v - nodes[gnode]->v;  // typically positive
    if (std::abs(vac - lastvac) > 0.01 ||
        std::abs(vag - lastvag) > 0.01)
        sim->converged = false;
    lastvac = vac;
    lastvag = vag;
    diode.doStep(nodes[inode]->v - nodes[cnode]->v);
    double icmult = 1 / triggerI;
    double iamult = 1 / holdingI - icmult;
    aresistance = (-icmult * ic + ia * iamult > 1) ? 0.0105 : 10e5;
    sim->stampResistor(nodes[anode], nodes[inode], aresistance);
}

void SCRElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "SCR";
    double vac = nodes[anode]->v - nodes[cnode]->v;
    double vag = nodes[anode]->v - nodes[gnode]->v;
    double vgc = nodes[gnode]->v - nodes[cnode]->v;
    arr[1] = "Ia = " + getCurrentText(ia);
    arr[2] = "Ig = " + getCurrentText(ig);
    arr[3] = "Vac = " + getVoltageText(vac);
    arr[4] = "Vag = " + getVoltageText(vag);
    arr[5] = "Vgc = " + getVoltageText(vgc);
    arr[6] = "P = " + getUnitText(getPower(), "W");
}

void SCRElm::calculateCurrent() {
    ig = (nodes[gnode]->v - nodes[cnode]->v) / gresistance;
    ia = (nodes[anode]->v - nodes[inode]->v) / aresistance;
    ic = -ig - ia;
}

std::optional<EditInfo> SCRElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Trigger Current (A)", triggerI, 0, 0).setPositive();
    if (n == 1)
        return EditInfo("Holding Current (A)", holdingI, 0, 0).setPositive();
    if (n == 2)
        return EditInfo("Gate Resistance (ohms)", gresistance, 0, 0).setPositive();
    return std::nullopt;
}

void SCRElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        triggerI = ei.value;
    if (n == 1)
        holdingI = ei.value;
    if (n == 2)
        gresistance = ei.value;
}

// if point1 and point2 are in line, then we don't know which way the gate
// is pointed and flip won't work.  fix this
void SCRElm::fixEnds() {
    Point pt;
    interpPoint(point1, point2, pt, 1, app->gridSize * dir);
    x2 = pt.x;
    y2 = pt.y;
}

void SCRElm::flipX(int c2, int count) {
    fixEnds();
    CircuitElm::flipX(c2, count);
}

void SCRElm::flipY(int c2, int count) {
    fixEnds();
    CircuitElm::flipY(c2, count);
}

void SCRElm::flipXY(int c2, int count) {
    fixEnds();
    CircuitElm::flipXY(c2, count);
}
