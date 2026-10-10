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

#include "LogicInputElm.h"

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

LogicInputElm::LogicInputElm(int xx, int yy) : SwitchElm(xx, yy, false) {
    hiV = 5;
    loV = 0;
}

LogicInputElm::LogicInputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : SwitchElm(xa, ya, xb, yb, f, st, true) {
    try {
        hiV = parseFloatStrict(st.nextToken());
        loV = parseFloatStrict(st.nextToken());
    } catch (...) {
        hiV = 5;
        loV = 0;
    }
    if (isTernary())
        posCount = 3;
}

std::string LogicInputElm::dump() {
    return SwitchElm::dump() + " " + jsNumberToString(hiV) + " " + jsNumberToString(loV);
}

void LogicInputElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    SwitchElm::dumpXml(doc, elem);
    if (hiV != 5)
        CircuitXMLSerializer::dumpAttr(elem, "hi", hiV);
    if (loV != 0)
        CircuitXMLSerializer::dumpAttr(elem, "lo", loV);
}

void LogicInputElm::undumpXml(CircuitXMLDeserializer &xml) {
    SwitchElm::undumpXml(xml);
    hiV = xml.parseDoubleAttr("hi", hiV);
    loV = xml.parseDoubleAttr("lo", loV);
}

void LogicInputElm::setPoints() {
    SwitchElm::setPoints();
    lead1 = interpPoint(point1, point2, 1 - 12 / dn);
}

void LogicInputElm::stamp() {
    sim->stampVoltageSource(CircuitNode::ground, nodes[0], voltSource);
}

void LogicInputElm::doStep() {
    double v = (position == 0) ? loV : hiV;
    if (isTernary())
        v = loV + position * (hiV - loV) * .5;
    sim->updateVoltageSource(CircuitNode::ground, nodes[0], voltSource, v);
}

void LogicInputElm::draw(Graphics &g) {
    g.save();
    Font f("SansSerif", Font::BOLD, 20);
    g.setFont(f);
    g.setColor(needsHighlight() ? selectColor : whiteColor);
    std::string s = position == 0 ? "L" : "H";
    if (isNumeric())
        s = std::to_string(position);
    setBbox(point1, lead1, 0);
    drawCenteredText(g, s, x2, y2, true);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1);
    updateDotCount();
    drawDots(g, point1, lead1, -curcount);
    drawPosts(g);
    g.restore();
}

void LogicInputElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "logic input";
    arr[1] = (position == 0) ? "low" : "high";
    if (isNumeric())
        arr[1] = std::to_string(position);
    arr[1] += " (" + getVoltageText(nodes[0]->v) + ")";
    arr[2] = "I = " + getCurrentText(getCurrent());
}

std::optional<EditInfo> LogicInputElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Momentary Switch", momentary);
    if (n == 1)
        return EditInfo("High Logic Voltage", hiV, 10, -10).setUnitStep();
    if (n == 2)
        return EditInfo("Low Voltage", loV, 10, -10).setUnitStep();
    if (n == 3)
        return EditInfo::createCheckbox("Numeric", isNumeric());
    if (n == 4)
        return EditInfo::createCheckbox("Ternary", isTernary());
    if (n == 5)
        return getKeyShortcutEditInfo();
    return std::nullopt;
}

void LogicInputElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        momentary = ei.checkbox->getState();
    if (n == 1)
        hiV = ei.value;
    if (n == 2)
        loV = ei.value;
    if (n == 3)
        flags = ei.changeFlag(flags, FLAG_NUMERIC);
    if (n == 4) {
        flags = ei.changeFlag(flags, FLAG_TERNARY);
        posCount = isTernary() ? 3 : 2;
    }
    if (n == 5)
        setKeyShortcutEditValue(ei);
}

Rectangle LogicInputElm::getSwitchRect() {
    return Rectangle(x2 - 10, y2 - 10, 20, 20);
}

void LogicInputElm::addRoutingObstacle(WireRouter &wr) {
    wr.addWire(point1.x, point1.y, lead1.x, lead1.y);
    wr.addObstacle(x2 - 10, y2 - 10, x2 + 10, y2 + 10);
}
