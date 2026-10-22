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

#include "PhaseCompElm.h"

#include "../core/StringTokenizer.h"

#include "../core/SimulationManager.h"

void PhaseCompElm::setupPins() {
    sizeX = 2;
    sizeY = 2;
    pins.assign(3, Pin());
    pins[0] = Pin(this, 0, SIDE_W, "I1");
    pins[1] = Pin(this, 1, SIDE_W, "I2");
    pins[2] = Pin(this, 0, SIDE_E, "O");
    pins[2].output = true;
}

void PhaseCompElm::stamp() {
    sim->stampNonLinearVS(pins[2].voltSource);
    sim->stampNonLinear(CircuitNode::ground);
    sim->stampNonLinear(nodes[2]);
}

void PhaseCompElm::startIteration() {
    bool v1 = nodes[0]->v > getThreshold();
    bool v2 = nodes[1]->v > getThreshold();
    if (v1 && !pins[0].value)
        ff1 = true;
    if (v2 && !pins[1].value)
        ff2 = true;
    if (ff1 && ff2)
        ff1 = ff2 = false;
    pins[0].value = v1;
    pins[1].value = v2;
}

void PhaseCompElm::doStep() {
    double out = (ff1) ? highVoltage : (ff2) ? 0 : -1;
    if (out != -1)
        sim->stampVoltageSource(CircuitNode::ground, nodes[2], pins[2].voltSource, out);
    else {
        // tie current through output pin to 0
        sim->stampMatrixVV(pins[2].voltSource, pins[2].voltSource, 1);
    }
}
