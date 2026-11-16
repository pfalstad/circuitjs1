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

#include "VCOElm.h"

#include "../core/StringTokenizer.h"

#include "../core/SimulationManager.h"

void VCOElm::setupPins() {
    sizeX = 2;
    sizeY = 4;
    pins.assign(6, Pin());
    pins[0] = Pin(this, 0, SIDE_W, "Vi");
    pins[1] = Pin(this, 3, SIDE_W, "Vo");
    pins[1].output = true;
    pins[2] = Pin(this, 0, SIDE_E, "C");
    pins[3] = Pin(this, 1, SIDE_E, "C");
    pins[4] = Pin(this, 2, SIDE_E, "R1");
    pins[4].output = true;
    pins[5] = Pin(this, 3, SIDE_E, "R2");
    pins[5].output = true;
}

void VCOElm::stamp() {
    // output pin
    sim->stampVoltageSource(CircuitNode::ground, nodes[1], pins[1].voltSource);
    // attach Vi to R1 pin so its current is proportional to Vi
    sim->stampVoltageSource(nodes[0], nodes[4], pins[4].voltSource, 0);
    // attach 5V to R2 pin so we get a current going
    sim->stampVoltageSource(CircuitNode::ground, nodes[5], pins[5].voltSource, 5);
    // put resistor across cap pins to give current somewhere to go
    // in case cap is not connected
    sim->stampResistor(nodes[2], nodes[3], cResistance);
    sim->stampNonLinear(nodes[2]);
    sim->stampNonLinear(nodes[3]);
}

void VCOElm::doStep() {
    double vc = nodes[3]->v - nodes[2]->v;
    double vo = nodes[1]->v;
    int dir = (vo < 2.5) ? 1 : -1;
    // switch direction of current through cap as we oscillate
    if (vo < 2.5 && vc > 4.5) {
        vo = 5;
        dir = -1;
    }
    if (vo > 2.5 && vc < .5) {
        vo = 0;
        dir = 1;
    }
    // generate output voltage
    sim->updateVoltageSource(CircuitNode::ground, nodes[1], pins[1].voltSource, vo);
    // now we set the current through the cap to be equal to the
    // current through R1 and R2, so we can measure the voltage
    // across the cap
    sim->stampMatrixVN(nodes[2], pins[4].voltSource, dir);
    sim->stampMatrixVN(nodes[2], pins[5].voltSource, dir);
    sim->stampMatrixVN(nodes[3], pins[4].voltSource, -dir);
    sim->stampMatrixVN(nodes[3], pins[5].voltSource, -dir);
    cDir = dir;
}

// can not do this in calculateCurrent() because it is called before
// we get pins[4].current and pins[5].current, which we need
void VCOElm::computeCurrent() {
    if (cResistance == 0)
        return;
    double c = cDir * (pins[4].current + pins[5].current) + (nodes[3]->v - nodes[2]->v) / cResistance;
    pins[2].current = -c;
    pins[3].current = c;
    pins[0].current = -pins[4].current;
}

void VCOElm::draw(Graphics &g) {
    computeCurrent();
    drawChip(g);
}
