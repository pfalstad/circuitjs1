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

#include "VCVSElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/SimulationManager.h"

void VCVSElm::setupPins() {
    sizeX = 2;
    sizeY = inputCount > 2 ? inputCount : 2;
    pins.assign(inputCount + 2, Pin());
    for (int i = 0; i != inputCount; i++)
        pins[i] = Pin(this, i, SIDE_W, std::string(1, (char) (65 + i)));  // 'A'+i
    pins[inputCount] = Pin(this, 0, SIDE_E, "V+");
    pins[inputCount].output = true;
    pins[inputCount + 1] = Pin(this, 1, SIDE_E, "V-");
    allocExprArrays();
    allocNodes();
}

void VCVSElm::stamp() {
    VoltageSource *vs = pins[inputCount].voltSource;
    sim->stampNonLinearVS(vs);
    sim->stampVoltageSource(nodes[inputCount + 1], nodes[inputCount], vs);
}

void VCVSElm::doStep() {
    // check convergence
    if (!engine.checkConvergence(getConvergeLimit()))
        sim->converged = false;
    VoltageSource *vn = pins[inputCount].voltSource;
    if (expr() != nullptr) {
        double rs = engine.evalAndStamp(false);
        double v0 = engine.value;
        if (std::abs(nodes[inputCount]->v - nodes[inputCount + 1]->v - v0) > std::abs(v0) * 0.01 &&
            sim->subIterations < 100)
            sim->converged = false;
        sim->stampRightSideVS(vn, rs);
    }
    engine.saveInputs();
}

void VCVSElm::stampInputDerivative(const NodeRef &pos, const NodeRef &neg, double dx) {
    VoltageSource *vn = pins[inputCount].voltSource;
    sim->stampMatrixNV(vn, pos, -dx);
    sim->stampMatrixNV(vn, neg, dx);
}

void VCVSElm::stampInputDerivativeVS(VoltageSource *ivs, double dx) {
    sim->stampMatrixVV(pins[inputCount].voltSource, ivs, -dx);
}

void VCVSElm::stepFinished() {
    exprState().updateLastValues(nodes[inputCount]->v - nodes[inputCount + 1]->v);
}

void VCVSElm::setVoltageSource(int j, VoltageSource *vs) {
    VCCSElm::setVoltageSource(j, vs);
    vs->setNodes(nodes[inputCount + 1], nodes[inputCount]);
}

void VCVSElm::setCurrent(VoltageSource *vs, double c) {
    if (pins[inputCount].voltSource == vs) {
        pins[inputCount].current = c;
        pins[inputCount + 1].current = -c;
    }
}
