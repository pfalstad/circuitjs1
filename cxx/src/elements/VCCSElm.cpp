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

#include "VCCSElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/JsMath.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/FindPathInfo.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"

void VCCSElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st == nullptr) {
        inputCount = 2;
        setExprString(".1*(a-b)");
    } else {
        inputCount = parseIntStrict(st->nextToken());
        setExprString(CustomLogicModel::unescape(st->nextToken()));
    }
    parseExpr();
    setupPins();
}

void VCCSElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ic", inputCount);
    CircuitXMLSerializer::dumpAttr(elem, "ex", exprString());
}

void VCCSElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    inputCount = xml.parseIntAttr("ic", inputCount);
    setExprString(*xml.parseStringAttr("ex", exprString()));
    parseExpr();
    setupPins();
}

void VCCSElm::setupPins() {
    sizeX = 2;
    sizeY = inputCount > 2 ? inputCount : 2;
    pins.assign(inputCount + 2, Pin());
    for (int i = 0; i != inputCount; i++)
        pins[i] = Pin(this, i, SIDE_W, std::string(1, (char) (65 + i)));  // 'A'+i
    pins[inputCount] = Pin(this, 0, SIDE_E, "C+");
    pins[inputCount + 1] = Pin(this, 1, SIDE_E, "C-");
    allocExprArrays();
    allocNodes();
}

void VCCSElm::setParentList(std::vector<CircuitElm *> &elmList) {
    ChipElm::setParentList(elmList);
    // inside a subcircuit our references came in as node numbers, so an i() reference
    // still needs its element found; at the top level this is already done
    engine.resolveRefElmsByNode(elmList);
}

void VCCSElm::stamp() {
    sim->stampNonLinear(nodes[inputCount]);
    sim->stampNonLinear(nodes[inputCount + 1]);
}

double VCCSElm::getConvergeLimit() {
    if (sim->subIterations < 10) return 0.001;
    if (sim->subIterations < 200) return 0.01;
    return 0.1;
}

void VCCSElm::doStep() {
    if (broken) {
        pins[inputCount].current = 0;
        pins[inputCount + 1].current = 0;
        sim->stampResistor(nodes[inputCount], nodes[inputCount + 1], 1e8);
        return;
    }

    // check convergence
    if (!engine.checkConvergence(getConvergeLimit()))
        sim->converged = false;

    if (expr() != nullptr) {
        double rs = engine.evalAndStamp(true);
        double v0 = engine.value;
        sim->stampCurrentSource(nodes[inputCount], nodes[inputCount + 1], rs);
        pins[inputCount].current = -v0;
        pins[inputCount + 1].current = v0;
    }

    engine.saveInputs();
}

void VCCSElm::stampInputDerivative(const NodeRef &pos, const NodeRef &neg, double dx) {
    sim->stampVCCurrentSource(nodes[inputCount], nodes[inputCount + 1], pos, neg, dx);
}

void VCCSElm::stampInputDerivativeVS(VoltageSource *vs, double dx) {
    sim->stampCCCS(nodes[inputCount], nodes[inputCount + 1], vs, dx);
}

void VCCSElm::stepFinished() {
    exprState().updateLastValues(pins[inputCount].current);
}

std::optional<EditInfo> VCCSElm::getChipEditInfo(int n) {
    if (n == 0) {
        EditInfo ei(EditInfo::makeLink("customfunction.html", "Output Function"), 0, -1, -1);
        ei.text = exprString();
        ei.disallowSliders();
        return ei;
    }
    if (n == 1)
        return EditInfo("# of Inputs", inputCount, 1, 8).setDimensionless();
    return std::nullopt;
}

void VCCSElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        setExprString(ei.textf->value);
        parseExpr(&ei);
        return;
    }
    if (n == 1) {
        if (ei.value < 0 || ei.value > 8) return;
        inputCount = (int) jsmath::round(ei.value);
        setupPins();
        allocNodes();
        setPoints();
    }
}

void VCCSElm::setExpr(const std::string &exprStr) {
    setExprString(exprStr);
    parseExpr();
}

void VCCSElm::parseExpr(EditInfo *ei) {
    std::optional<std::string> err = engine.parse(exprString());
    // v()/i() references change our node count, so resize before anyone reads it
    allocExprArrays();
    allocNodes();
    if (err && ei != nullptr) {
        ei->setErrorFieldName("Output Function");
        ei->setError(Locale::LS("Parse error in expression") + ": " + exprString() + ": " + *err);
    }
}

void VCCSElm::getInfo(std::vector<std::string> &arr) {
    ChipElm::getInfo(arr);
    int i = (int) arr.size();
    arr.push_back("I = " + getCurrentText(pins[inputCount].current));
    addRefNodeInfo(arr, i + 1);
}

void VCCSElm::reset() {
    ChipElm::reset();
    engine.reset();
}

bool VCCSElm::validate() {
    FindPathInfo fpi(FindPathInfo::INDUCT, this, getOutputNode(0), sim);
    if (hasCurrentOutput() && !fpi.findPath(getOutputNode(1)))
        broken = true;
    else
        broken = false;
    return true;
}
