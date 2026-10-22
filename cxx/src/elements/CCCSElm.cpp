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

#include "CCCSElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/JsMath.h"

#include "VoltageElm.h"
#include "../core/SimulationManager.h"

void CCCSElm::postConstruct(StringTokenizer *st) {
    VCCSElm::postConstruct(st);
    if (st == nullptr) {
        setExprString("2*a");
        parseExpr();
    } else {
        setupPins();
    }
}

void CCCSElm::setupPins() {
    sizeX = 2;
    sizeY = inputCount > 2 ? inputCount : 2;
    inputPairCount = inputCount / 2;
    pins.assign(inputCount + 2, Pin());
    for (int i = 0; i != inputPairCount; i++) {
        pins[i * 2] = Pin(this, i * 2, SIDE_W, std::string(1, (char) (65 + i)) + "+");
        pins[i * 2 + 1] = Pin(this, i * 2 + 1, SIDE_W, std::string(1, (char) (65 + i)) + "-");
        pins[i * 2 + 1].output = true;
    }
    int i = inputPairCount;
    pins[i * 2] = Pin(this, 0, SIDE_E, "O+");
    pins[i * 2].output = true;
    pins[i * 2 + 1] = Pin(this, 1, SIDE_E, "O-");
    lastCurrents.assign(inputPairCount + 1, 0);
    allocExprArrays();
    allocNodes();
}

void CCCSElm::stamp() {
    if (isSpiceStyle()) {
        for (int i = 0; i != inputCount; i += 2) {
            VoltageElm *ve = voltageSources[i / 2];
            pins[i + 1].voltSource = ve ? ve->voltSource : nullptr;
        }
    } else {
        // 0V voltage source for each input pair to measure current
        for (int i = 0; i != inputCount; i += 2) {
            VoltageSource *vn1 = pins[i + 1].voltSource;
            sim->stampVoltageSource(nodes[i], nodes[i + 1], vn1, 0);
        }
    }
    sim->stampNonLinear(nodes[inputCount]);
    sim->stampNonLinear(nodes[inputCount + 1]);
}

void CCCSElm::doStep() {
    if (broken) {
        pins[inputCount].current = 0;
        pins[inputCount + 1].current = 0;
        sim->stampResistor(nodes[inputCount], nodes[inputCount + 1], 1e8);
        return;
    }
    if (isSpiceStyle()) {
        for (int i = 0; i != inputPairCount; i++)
            pins[i * 2 + 1].current = voltageSources[i]->getCurrent();
    }
    // check convergence
    double convergeLimit = getConvergeLimit() * 0.1;
    for (int i = 0; i <= inputPairCount; i++) {
        double cur = pins[i * 2 + 1].current;
        if (std::abs(cur - lastCurrents[i]) > convergeLimit)
            sim->converged = false;
    }
    for (int i = 0; i <= inputPairCount; i++)
        lastCurrents[i] = pins[i * 2 + 1].current;
    // check convergence on the v()/i() references
    if (!engine.checkConvergence(getConvergeLimit()))
        sim->converged = false;
    if (expr() != nullptr) {
        for (int i = 0; i != inputPairCount; i++)
            setCurrentExprValue(i, pins[i * 2 + 1].current);
        exprState().t = sim->t;
        double v0 = expr()->eval(exprState());
        double rs = v0;
        pins[inputCount].current = v0;
        pins[inputCount + 1].current = -v0;
        for (int i = 0; i != inputPairCount; i++) {
            double cur = pins[i * 2 + 1].current;
            double dv = cur - lastCurrents[i];
            if (std::abs(dv) < 1e-6) dv = 1e-6;
            setCurrentExprValue(i, cur);
            double v = expr()->eval(exprState());
            setCurrentExprValue(i, cur - dv);
            double v2 = expr()->eval(exprState());
            double dx = (v - v2) / dv;
            if (std::abs(dx) < 1e-6)
                dx = sign(dx, 1e-6);
            sim->stampCCCS(nodes[inputCount + 1], nodes[inputCount], pins[i * 2 + 1].voltSource, dx);
            rs -= dx * cur;
            setCurrentExprValue(i, cur);
        }
        // partial derivatives for the v()/i() references.  the pin currents were
        // already differentiated above, so this pass only picks up the references;
        // it re-derives the same v0, so subtracting it leaves just their residual.
        if (engine.getRefCount() > 0)
            rs += engine.evalAndStamp(false) - v0;
        sim->stampCurrentSource(nodes[inputCount + 1], nodes[inputCount], rs);
    }
    engine.saveInputs();
}

void CCCSElm::stampInputDerivative(const NodeRef &pos, const NodeRef &neg, double dx) {
    sim->stampVCCurrentSource(nodes[inputCount + 1], nodes[inputCount], pos, neg, dx);
}

void CCCSElm::stampInputDerivativeVS(VoltageSource *ivs, double dx) {
    sim->stampCCCS(nodes[inputCount + 1], nodes[inputCount], ivs, dx);
}

void CCCSElm::stepFinished() {
    exprState().updateLastValues(pins[inputCount].current);
}

void CCCSElm::setCurrentExprValue(int n, double cur) {
    if (n == 0 && inputPairCount < 9)
        exprState().values[8] = cur;
    exprState().values[n] = cur;
}

void CCCSElm::setCurrent(VoltageSource *vs, double c) {
    for (int i = 0; i != inputCount; i += 2) {
        if (pins[i + 1].voltSource == vs) {
            pins[i].current = -c;
            pins[i + 1].current = c;
            return;
        }
    }
}

void CCCSElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 1) {
        if (ei.value < 0 || ei.value > 8 || std::fmod(ei.value, 2) == 1)
            return;
        inputCount = (int) jsmath::round(ei.value);
        setupPins();
        allocNodes();
        setPoints();
    } else {
        VCCSElm::setChipEditValue(n, ei);
    }
}

void CCCSElm::setParentList(std::vector<CircuitElm *> &elmList) {
    VCCSElm::setParentList(elmList);  // resolves our v()/i() references
    if (!isSpiceStyle())
        return;
    voltageSources.assign(inputPairCount, nullptr);
    for (int i = 0; i != inputCount; i += 2) {
        for (CircuitElm *ce : elmList) {
            if (!ce->isVoltageElm()) continue;
            if (ce->getNode(0) == nodes[i] && ce->getNode(1) == nodes[i + 1])
                voltageSources[i / 2] = static_cast<VoltageElm *>(ce);
        }
    }
}

void CCCSElm::setVoltageSource(int j, VoltageSource *vs) {
    if (isSpiceStyle()) {
        pins[inputCount].voltSource = vs;
    } else {
        VCCSElm::setVoltageSource(j, vs);
        vs->setNodes(nodes[j * 2], nodes[j * 2 + 1]);
    }
}

void CCCSElm::getInfo(std::vector<std::string> &arr) {
    VCCSElm::getInfo(arr);
    size_t i = 1;
    int j = 0;
    auto set = [&](const std::string &s) {
        if (arr.size() <= i) arr.resize(i + 1);
        arr[i++] = s;
    };
    for (j = 0; j != inputCount; j += 2)
        set(pins[j].text + " = " + getCurrentText(-pins[j].current));
    set(pins[j].text + " = " + getVoltageText(nodes[j]->v) + "; " + pins[j + 1].text + " = " +
        getVoltageText(nodes[j + 1]->v));
    set("I = " + getCurrentText(pins[j].current));
    arr.resize(i);
}
