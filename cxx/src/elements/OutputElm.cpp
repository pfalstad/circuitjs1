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

#include "OutputElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/JsMath.h"
#include "../core/WireRouter.h"

OutputElm::OutputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    scale = SCALE_AUTO;
    try {
        scale = parseIntStrict(st.nextToken());
    } catch (...) {}
}

void OutputElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "sc", scale);
}

void OutputElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    scale = xml.parseIntAttr("sc", scale);
}

void OutputElm::setPoints() {
    CircuitElm::setPoints();
    lead1 = Point();
}

LogicOutputElm::LogicOutputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    try {
        threshold = parseFloatStrict(st.nextToken());
    } catch (...) {
        threshold = 2.5;
    }
}

void LogicOutputElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    if (threshold != 2.5)
        CircuitXMLSerializer::dumpAttr(elem, "th", threshold);
}

void LogicOutputElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    threshold = xml.parseDoubleAttr("th", threshold);
}

void LogicOutputElm::setPoints() {
    CircuitElm::setPoints();
    lead1 = interpPoint(point1, point2, 1 - 12 / dn);
}

void LogicOutputElm::stamp() {
    if (needsPullDown())
        sim->stampResistor(nodes[0], CircuitNode::ground, 1e6);
}

void OutputElm::draw(Graphics &g) {
    g.save();
    bool sel = needsHighlight();
    Font f("SansSerif", sel ? Font::BOLD : 0, 14);
    g.setFont(f);
    g.setColor(sel ? selectColor : lightGrayColor);
    std::string s = showVoltage() ? getUnitTextWithScale(nodes[0]->v, "V", scale, isFixed()) : Locale::LS("out");
    const std::string *role = app->getScopePlotRole(this);
    if (role != nullptr && !role->empty())
        s = *role;
    interpPoint(point1, point2, lead1, 1 - (std::trunc(g.measureWidth(s) / 2) + 8) / dn);
    setBbox(point1, lead1, 0);
    drawCenteredText(g, s, x2, y2, true);
    setVoltageColor(g, nodes[0]->v);
    if (sel)
        g.setColor(selectColor);
    drawThickLine(g, point1, lead1);
    drawPosts(g);
    g.restore();
}

void OutputElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "output";
    arr[1] = "V = " + getVoltageText(nodes[0]->v);
}

void LogicOutputElm::draw(Graphics &g) {
    g.save();
    Font f("SansSerif", Font::BOLD, 20);
    g.setFont(f);
    g.setColor(lightGrayColor);
    std::string s = (nodes[0]->v < threshold) ? "L" : "H";
    if (isTernary()) {
        // we don't have 2 separate thresholds for ternary inputs so we do this instead
        if (nodes[0]->v > threshold * 1.5)  // 3.75 V
            s = "2";
        else if (nodes[0]->v > threshold * .5)  // 1.25 V
            s = "1";
        else
            s = "0";
    } else if (isNumeric())
        s = (nodes[0]->v < threshold) ? "0" : "1";
    value = s;
    setBbox(point1, lead1, 0);
    drawCenteredText(g, s, x2, y2, true);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1);
    drawPosts(g);
    g.restore();
}

void LogicOutputElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "logic output";
    arr[1] = (nodes[0]->v < threshold) ? "low" : "high";
    if (isNumeric())
        arr[1] = value;
    arr[2] = "V = " + getVoltageText(nodes[0]->v);
}

std::optional<EditInfo> OutputElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Show Voltage", showVoltage());
    if (!showVoltage())
        return std::nullopt;
    if (n == 1) {
        EditInfo ei("Scale", 0);
        ei.choice = Choice();
        ei.choice->add("Auto");
        ei.choice->add("V");
        ei.choice->add("mV");
        ei.choice->add(Locale::muString + "V");
        ei.choice->select(scale);
        return ei;
    }
    if (scale == SCALE_AUTO)
        return std::nullopt;
    if (n == 2)
        return EditInfo::createCheckbox("Fixed Precision", isFixed());
    return std::nullopt;
}

void OutputElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        flags = ei.changeFlag(flags, FLAG_VALUE);
        ei.newDialog = true;
    }
    if (n == 1) {
        scale = ei.choice->getSelectedIndex();
        ei.newDialog = true;
    }
    if (n == 2)
        flags = ei.changeFlag(flags, FLAG_FIXED);
}

std::optional<EditInfo> LogicOutputElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Threshold", threshold, 10, -10);
    if (n == 1)
        return EditInfo::createCheckbox("Current Required", needsPullDown());
    if (n == 2)
        return EditInfo::createCheckbox("Numeric", isNumeric());
    if (n == 3)
        return EditInfo::createCheckbox("Ternary", isTernary());
    return std::nullopt;
}

void LogicOutputElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        threshold = ei.value;
    if (n == 1)
        flags = ei.changeFlag(flags, FLAG_PULLDOWN);
    if (n == 2)
        flags = ei.changeFlag(flags, FLAG_NUMERIC);
    if (n == 3)
        flags = ei.changeFlag(flags, FLAG_TERNARY);
}

void LogicOutputElm::addRoutingObstacle(WireRouter &wr) {
    wr.addWire(point1.x, point1.y, lead1.x, lead1.y);
    wr.addObstacle(x2 - 10, y2 - 10, x2 + 10, y2 + 10);
}

void OutputElm::addRoutingObstacle(WireRouter &wr) {
    wr.addWire(point1.x, point1.y, x2, y2);
    wr.addObstacle(x2 - 10, y2 - 10, x2 + 10, y2 + 10);
}
