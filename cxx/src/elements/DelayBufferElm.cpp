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

#include "DelayBufferElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "GateElm.h"

DelayBufferElm::DelayBufferElm(int xx, int yy) : CircuitElm(xx, yy) {
    noDiagonal = true;
    threshold = 2.5;
    highVoltage = 5;
}

DelayBufferElm::DelayBufferElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    noDiagonal = true;
    delay = parseFloatStrict(st.nextToken());
    threshold = 2.5;
    highVoltage = 5;
    try {
        threshold = parseFloatStrict(st.nextToken());
        highVoltage = parseFloatStrict(st.nextToken());
    } catch (...) {}
}

void DelayBufferElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "dl", delay);
    CircuitXMLSerializer::dumpAttr(elem, "th", threshold);
    CircuitXMLSerializer::dumpAttr(elem, "hv", highVoltage);
}

void DelayBufferElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    delay = xml.parseDoubleAttr("dl", delay);
    threshold = xml.parseDoubleAttr("th", threshold);
    highVoltage = xml.parseDoubleAttr("hv", highVoltage);
}

void DelayBufferElm::draw(Graphics &g) {
    drawPosts(g);
    draw2Leads(g);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    drawThickPolygon(g, gatePoly);
    if (GateElm::useEuroGates())
        drawCenteredText(g, "1", center.x, center.y - 6, true);
    curcount = updateDotCount(current, curcount);
    drawDots(g, lead2, point2, curcount);
}

void DelayBufferElm::setPoints() {
    CircuitElm::setPoints();
    const int hs = 16;
    double ww = 16 - 2;
    if (ww > dn / 2)
        ww = std::floor(dn / 2);
    lead1 = interpPoint(point1, point2, .5 - ww / dn);
    lead2 = interpPoint(point1, point2, .5 + ww / dn);

    if (GateElm::useEuroGates()) {
        std::vector<Point> pts = newPointArray(4);
        Point l2 = interpPoint(point1, point2, .5 + (ww - 5) / dn);
        interpPoint2(lead1, l2, pts[0], pts[1], 0, hs);
        interpPoint2(lead1, l2, pts[3], pts[2], 1, hs);
        gatePoly = createPolygon(pts);
        center = interpPoint(lead1, l2, .5);
    } else {
        std::vector<Point> triPoints = newPointArray(3);
        interpPoint2(lead1, lead2, triPoints[0], triPoints[1], 0, hs);
        triPoints[2] = interpPoint(point1, point2, .5 + ww / dn);
        gatePoly = createPolygon(triPoints);
    }
    setBbox(point1, point2, hs);
}

void DelayBufferElm::stamp() {
    sim->stampVoltageSource(CircuitNode::ground, nodes[1], voltSource);
}

void DelayBufferElm::doStep() {
    bool inState = nodes[0]->v > threshold;
    bool outState = nodes[1]->v > threshold;
    if (inState != outState) {
        if (sim->t >= delayEndTime)
            outState = inState;
    } else
        delayEndTime = sim->t + delay;
    sim->updateVoltageSource(CircuitNode::ground, nodes[1], voltSource, outState ? highVoltage : 0);
}

void DelayBufferElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = Locale::LS("buffer");
    arr[1] = Locale::LS("delay = ") + getUnitText(delay, "s");
    arr[2] = "Vi = " + getVoltageText(nodes[0]->v);
    arr[3] = "Vo = " + getVoltageText(nodes[1]->v);
}

std::optional<EditInfo> DelayBufferElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Delay (s)", delay, 0, 0);
    if (n == 1)
        return EditInfo("Threshold (V)", threshold, 0, 0);
    if (n == 2)
        return EditInfo("High Logic Voltage", highVoltage, 0, 0).setUnitStep();
    return std::nullopt;
}

void DelayBufferElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        delay = ei.value;
    if (n == 1)
        threshold = ei.value;
    if (n == 2)
        highVoltage = ei.value;
}
