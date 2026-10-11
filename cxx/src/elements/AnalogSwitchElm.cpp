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

#include "AnalogSwitchElm.h"

#include "../core/CircuitNode.h"
#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

AnalogSwitchElm::AnalogSwitchElm(int xx, int yy) : CircuitElm(xx, yy) {
    r_on = 20;
    r_off = 1e10;
    threshold = 2.5;
    noDiagonal = true;
    flags |= FLAG_PULLDOWN;
}

AnalogSwitchElm::AnalogSwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    r_on = 20;
    r_off = 1e10;
    threshold = 2.5;
    noDiagonal = true;
    try {
        r_on = parseFloatStrict(st.nextToken());
        r_off = parseFloatStrict(st.nextToken());
        threshold = parseFloatStrict(st.nextToken());
    } catch (...) {}
}

void AnalogSwitchElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ron", r_on);
    CircuitXMLSerializer::dumpAttr(elem, "roff", r_off);
    CircuitXMLSerializer::dumpAttr(elem, "th", threshold);
}

void AnalogSwitchElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    r_on = xml.parseDoubleAttr("ron", r_on);
    r_off = xml.parseDoubleAttr("roff", r_off);
    threshold = xml.parseDoubleAttr("th", threshold);
}

void AnalogSwitchElm::flipX(int c2, int count) {
    flags ^= FLAG_FLIPPED_X;
    CircuitElm::flipX(c2, count);
}

void AnalogSwitchElm::flipY(int c2, int count) {
    flags ^= FLAG_FLIPPED_Y;
    CircuitElm::flipY(c2, count);
}

void AnalogSwitchElm::flipXY(int c2, int count) {
    flags ^= FLAG_FLIPPED;
    CircuitElm::flipXY(c2, count);
}

void AnalogSwitchElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(32);
    adjustLeadsToGrid(isFlippedX(), isFlippedY());
    ps = Point();
    ps1 = Point();
    openhs = (isFlippedX() != isFlippedY()) != isFlipped() ? -16 : 16;
    point3 = interpPoint(lead1, lead2, 0.5, -openhs);
    lead3 = interpPoint(lead1, lead2, 0.5, -openhs / 2);
}

void AnalogSwitchElm::draw(Graphics &g) {
    int hs1 = open ? 0 : 2;
    int hs2 = open ? openhs : 2;
    setBbox(point1, point2, openhs);

    draw2Leads(g);

    g.setColor(lightGrayColor);
    interpPoint(lead1, lead2, ps1, 0, hs1);
    interpPoint(lead1, lead2, ps, 1, hs2);
    drawThickLine(g, ps1, ps);

    setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, point3, lead3);

    if (!open)
        doDots(g);
    drawPosts(g);
}

void AnalogSwitchElm::calculateCurrent() {
    if (resistance == 0)
        return;
    if (needsPulldown() && open)
        current = 0;
    else
        current = (nodes[0]->v - nodes[1]->v) / resistance;
}

void AnalogSwitchElm::stamp() {
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
    if (needsPulldown()) {
        sim->stampResistor(nodes[0], CircuitNode::ground, r_off);
        sim->stampResistor(nodes[1], CircuitNode::ground, r_off);
    }
}

void AnalogSwitchElm::doStep() {
    open = (nodes[2]->v < threshold);
    if (hasFlag(FLAG_INVERT))
        open = !open;
    if (!(needsPulldown() && open)) {
        resistance = open ? r_off : r_on;
        sim->stampResistor(nodes[0], nodes[1], resistance);
    }
}

void AnalogSwitchElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "analog switch";
    arr[1] = open ? "open" : "closed";
    arr[2] = "Vd = " + getVoltageDText(getVoltageDiff());
    arr[3] = "I = " + getCurrentDText(getCurrent());
    arr[4] = "Vc = " + getVoltageText(nodes[2]->v);
}

std::optional<EditInfo> AnalogSwitchElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Normally closed", hasFlag(FLAG_INVERT));
    if (n == 1)
        return EditInfo("On Resistance (ohms)", r_on, 0, 0).setPositive();
    if (n == 2)
        return EditInfo("Off Resistance (ohms)", r_off, 0, 0).setPositive();
    if (n == 3)
        return EditInfo::createCheckbox("Pulldown Resistor", needsPulldown());
    if (n == 4)
        return EditInfo("Threshold", threshold, 10, -10);
    return std::nullopt;
}

void AnalogSwitchElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        flags = ei.checkbox->getState() ? (flags | FLAG_INVERT) : (flags & ~FLAG_INVERT);
    if (n == 1 && ei.value > 0)
        r_on = ei.value;
    if (n == 2 && ei.value > 0)
        r_off = ei.value;
    if (n == 3)
        flags = ei.changeFlag(flags, FLAG_PULLDOWN);
    if (n == 4)
        threshold = ei.value;
}

double AnalogSwitchElm::getCurrentIntoNode(int n) {
    if (n == 2)
        return 0;
    if (n == 0)
        return -current;
    return current;
}
