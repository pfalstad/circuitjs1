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

#include "ControlledSourceElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"

ControlledSourceElm::ControlledSourceElm(int xx, int yy, const std::string &defaultExpr) : CircuitElm(xx, yy) {
    setExpr(defaultExpr);
}

ControlledSourceElm::ControlledSourceElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st,
                                         const std::string &defaultExpr)
    : CircuitElm(xa, ya, xb, yb, f) {
    setExpr(defaultExpr);
}

void ControlledSourceElm::setParentList(std::vector<CircuitElm *> &elmList) {
    CircuitElm::setParentList(elmList);
    // inside a subcircuit our references came in as node numbers, so an i() reference
    // still needs its element found; at the top level this is already done
    engine.resolveRefElmsByNode(elmList);
}

void ControlledSourceElm::setExpr(const std::string &exprStr) {
    engine.parse(exprStr);
    engine.alloc(0);
    allocNodes();
}

void ControlledSourceElm::parseExpr(EditInfo *ei) {
    std::optional<std::string> err = engine.parse(engine.exprString);
    engine.alloc(0);
    allocNodes();
    if (err && ei) {
        ei->setErrorFieldName(getExprLabel());
        ei->setError(Locale::LS("Parse error in expression") + ": " +
            engine.exprString + ": " + *err);
    }
}

void ControlledSourceElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ex", engine.exprString);
}

void ControlledSourceElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    engine.exprString = xml.parseStringAttr("ex", engine.exprString).value_or(engine.exprString);
    parseExpr();
}

void ControlledSourceElm::setPoints() {
    CircuitElm::setPoints();
    const int d = diamondSize;
    calcLeads(d * 2);
    center = interpPoint(point1, point2, 0.5);
    side1 = interpPoint(point1, point2, 0.5, d);
    side2 = interpPoint(point1, point2, 0.5, -d);
}

void ControlledSourceElm::drawDiamond(Graphics &g) {
    drawThickLine(g, lead1, side1);
    drawThickLine(g, side1, lead2);
    drawThickLine(g, lead2, side2);
    drawThickLine(g, side2, lead1);
}

double ControlledSourceElm::getConvergeLimit() {
    SimulationManager *sim = SimulationManager::theSim;
    if (sim->subIterations < 10)
        return 0.001;
    if (sim->subIterations < 200)
        return 0.01;
    return 0.1;
}

void ControlledSourceElm::reset() {
    CircuitElm::reset();
    engine.reset();
}

std::optional<EditInfo> ControlledSourceElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei(EditInfo::makeLink("customfunction.html", getExprLabel()), 0, -1, -1);
        ei.text = engine.exprString;
        ei.disallowSliders();
        return ei;
    }
    return std::nullopt;
}

void ControlledSourceElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        engine.exprString = ei.textf->value;
        parseExpr(&ei);
    }
}

void ControlledSourceElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = getElmType();
    arr[1] = getExprLabel() + " = " + engine.exprString;
    arr[2] = "V = " + getVoltageText(getVoltageDiff());
    arr[3] = "I = " + getCurrentText(getCurrent());
    engine.addUnresolvedInfo(arr, 4);
}
