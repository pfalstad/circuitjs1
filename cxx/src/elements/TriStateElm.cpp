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

#include "TriStateElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "GateElm.h"

TriStateElm::TriStateElm(int xx, int yy) : CircuitElm(xx, yy) {
    r_on = 0.1;
    r_off = 1e10;
    r_off_ground = 1e8;
    highVoltage = GateElm::lastHighVoltage;
    noDiagonal = true;
}

TriStateElm::TriStateElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    r_on = 0.1;
    r_off = 1e10;
    r_off_ground = 0;
    highVoltage = 5;
    try {
        r_on = parseFloatStrict(st.nextToken());
        r_off = parseFloatStrict(st.nextToken());
        r_off_ground = parseFloatStrict(st.nextToken());
        highVoltage = parseFloatStrict(st.nextToken());
    } catch (...) {}
    noDiagonal = true;
}

std::string TriStateElm::dump() {
    return CircuitElm::dump() + " " + jsNumberToString(r_on) + " " + jsNumberToString(r_off) + " " +
        jsNumberToString(r_off_ground) + " " + jsNumberToString(highVoltage);
}

void TriStateElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ron", r_on);
    CircuitXMLSerializer::dumpAttr(elem, "roff", r_off);
    CircuitXMLSerializer::dumpAttr(elem, "rog", r_off_ground);
    CircuitXMLSerializer::dumpAttr(elem, "hi", highVoltage);
    if (busWidth != 1)
        CircuitXMLSerializer::dumpAttr(elem, "bw", busWidth);
}

void TriStateElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    r_on = xml.parseDoubleAttr("ron", r_on);
    r_off = xml.parseDoubleAttr("roff", r_off);
    r_off_ground = xml.parseDoubleAttr("rog", r_off_ground);
    highVoltage = xml.parseDoubleAttr("hi", highVoltage);
    busWidth = xml.parseIntAttr("bw", 1);
    allocNodes();
}

void TriStateElm::setPoints() {
    CircuitElm::setPoints();
    const int len = 32;
    calcLeads(len);
    adjustLeadsToGrid((flags & FLAG_FLIP_X) != 0, (flags & FLAG_FLIP_Y) != 0);
    ps = Point();
    const int hs = 16;
    double ww = 16;
    if (ww > dn / 2)
        ww = std::trunc(dn / 2);
    std::vector<Point> triPoints = newPointArray(3);
    interpPoint2(lead1, lead2, triPoints[0], triPoints[1], 0, hs + 2);
    triPoints[2] = interpPoint(lead1, lead2, 0.5 + (ww - 2) / len);
    gatePoly = createPolygon(triPoints);
    busLead1 = interpPoint(point1, lead1, 1 - 2 / dn);
    int sign = (flags & FLAG_FLIP) == 0 ? -1 : 1;
    point3 = interpPoint(lead1, lead2, 0.5, sign * hs);
    lead3 = interpPoint(lead1, lead2, 0.5, sign * (hs / 2 + 2));
}

void TriStateElm::draw(Graphics &g) {
    const int hs = 16;
    setBbox(point1, point2, hs);
    setVoltageColor(g, nodes[2 * busWidth]->v);
    drawThickLine(g, point3, lead3);
    if (busWidth > 1) {
        setVoltageColor(g, nodes[0]->v);
        drawThickLine(g, point1, busLead1, 5);
        setVoltageColor(g, nodes[busWidth]->v);
        drawThickLine(g, lead2, point2, 5);
    } else {
        draw2Leads(g);
    }
    g.setColor(lightGrayColor);
    drawThickPolygon(g, gatePoly);
    curcount = updateDotCount(current, curcount);
    drawDots(g, lead2, point2, curcount);
    drawPosts(g);
}

void TriStateElm::calculateCurrent() {
    current = 0;
    for (int i = 0; i < busWidth; i++) {
        int intNode = internalNode(i);
        int outNode = busWidth + i;
        double current31 = (nodes[intNode]->v - nodes[outNode]->v) / resistance;
        double current10 = r_off_ground == 0 ? 0 : nodes[outNode]->v / r_off_ground;
        current += current31 - current10;
    }
}

double TriStateElm::getCurrentIntoNode(int n) {
    if (n >= busWidth && n < 2 * busWidth)
        return current / busWidth;
    return 0;
}

void TriStateElm::stamp() {
    for (int i = 0; i < busWidth; i++) {
        sim->stampVoltageSource(CircuitNode::ground, nodes[internalNode(i)], voltageSources[i]);
        sim->stampNonLinear(nodes[internalNode(i)]);
        sim->stampNonLinear(nodes[busWidth + i]);
    }
}

void TriStateElm::doStep() {
    open = nodes[controlNode()]->v < highVoltage * 0.5;
    resistance = open ? r_off : r_on;
    for (int i = 0; i < busWidth; i++) {
        int intNode = internalNode(i);
        int outNode = busWidth + i;
        sim->stampResistor(nodes[intNode], nodes[outNode], resistance);
        if (r_off_ground > 0)
            sim->stampResistor(nodes[outNode], CircuitNode::ground, r_off_ground);
        sim->updateVoltageSource(CircuitNode::ground, nodes[intNode], voltageSources[i],
            nodes[i]->v > highVoltage * 0.5 ? highVoltage : 0);
    }
}

void TriStateElm::drag(int xx, int yy) {
    bool flip = (xx < x) == (yy < y);
    xx = snapGrid(xx);
    yy = snapGrid(yy);
    if (std::abs(x - xx) < std::abs(y - yy))
        xx = x;
    else {
        flip = !flip;
        yy = y;
    }
    flags = flip ? (flags | FLAG_FLIP) : (flags & ~FLAG_FLIP);
    CircuitElm::drag(xx, yy);
}

void TriStateElm::setVoltageSource(int n, VoltageSource *v) {
    if ((int) voltageSources.size() != busWidth)
        voltageSources.assign(busWidth, nullptr);
    voltageSources[n] = v;
    v->setNodes(CircuitNode::ground, nodes[internalNode(n)]);
}

bool TriStateElm::getMatrixConnection(int n1, int n2) {
    for (int i = 0; i < busWidth; i++)
        if (comparePair(n1, n2, busWidth + i, internalNode(i)))
            return true;
    return false;
}

Point TriStateElm::getPost(int n) {
    if (n < busWidth)
        return busWidth > 1 ? Point(point1.x, point1.y, n) : point1;
    if (n < 2 * busWidth)
        return busWidth > 1 ? Point(point2.x, point2.y, n - busWidth) : point2;
    return point3;
}

void TriStateElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "tri-state buffer";
    if (busWidth > 1)
        arr[0] += " (" + std::to_string(busWidth) + ")";
    arr[1] = open ? "open" : "closed";
    arr[2] = "Vd = " + getVoltageDText(getVoltageDiff());
    arr[3] = "I = " + getCurrentDText(getCurrent());
    arr[4] = "Vc = " + getVoltageText(nodes[controlNode()]->v);
}

std::optional<EditInfo> TriStateElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("On Resistance (ohms)", r_on, 0, 0).setPositive();
    if (n == 1)
        return EditInfo("Off Resistance (ohms)", r_off, 0, 0).setPositive();
    if (n == 2)
        return EditInfo("Output Pulldown Resistance (ohms)", r_off_ground, 0, 0).setPositive();
    if (n == 3)
        return EditInfo("High Logic Voltage", highVoltage, 1, 10).setUnitStep();
    if (n == 4)
        return EditInfo("Bus Width", busWidth, 1, 32).setDimensionless();
    return std::nullopt;
}

void TriStateElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0)
        r_on = ei.value;
    if (n == 1 && ei.value > 0)
        r_off = ei.value;
    if (n == 2 && ei.value > 0)
        r_off_ground = ei.value;
    if (n == 3)
        highVoltage = GateElm::lastHighVoltage = ei.value;
    if (n == 4) {
        if (ei.value >= 1) {
            busWidth = (int) std::trunc(ei.value);
            allocNodes();
        } else
            ei.setError("must be >= 1");
    }
}

void TriStateElm::flipX(int c2, int count) {
    flags ^= FLAG_FLIP | FLAG_FLIP_X;
    CircuitElm::flipX(c2, count);
}

void TriStateElm::flipY(int c2, int count) {
    flags ^= FLAG_FLIP | FLAG_FLIP_Y;
    CircuitElm::flipY(c2, count);
}

void TriStateElm::flipXY(int c2, int count) {
    flags ^= FLAG_FLIP;
    CircuitElm::flipXY(c2, count);
}
