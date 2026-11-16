/*
    Copyright (C) Paul Falstad

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

#include "ControlledVoltageElm.h"

#include <cmath>

#include "../core/Graphics.h"
#include "../core/SimulationManager.h"

void ControlledVoltageElm::setVoltageSource(int n, VoltageSource *v) {
    ControlledSourceElm::setVoltageSource(n, v);
    v->setNodes(nodes[0], nodes[1]);
}

void ControlledVoltageElm::stamp() {
    SimulationManager *sim = SimulationManager::theSim;
    sim->stampNonLinearVS(voltSource);
    sim->stampVoltageSource(nodes[0], nodes[1], voltSource);
}

void ControlledVoltageElm::doStep() {
    SimulationManager *sim = SimulationManager::theSim;
    if (!expr())
        return;

    if (!engine.checkConvergence(getConvergeLimit()))
        sim->converged = false;

    double rs = engine.evalAndStamp(false);

    // the output has to settle too, not just the inputs
    double v0 = engine.value;
    if (std::abs(nodes[1]->v - nodes[0]->v - v0) > std::abs(v0) * 0.01 &&
            sim->subIterations < 100)
        sim->converged = false;

    sim->stampRightSideVS(voltSource, rs);
    engine.saveInputs();
}

void ControlledVoltageElm::stampInputDerivative(const NodeRef &pos, const NodeRef &neg, double dx) {
    SimulationManager *sim = SimulationManager::theSim;
    sim->stampMatrixNV(voltSource, pos, -dx);
    sim->stampMatrixNV(voltSource, neg, dx);
}

void ControlledVoltageElm::stampInputDerivativeVS(VoltageSource *ivs, double dx) {
    SimulationManager::theSim->stampMatrixVV(voltSource, ivs, -dx);
}

void ControlledVoltageElm::draw(Graphics &g) {
    draw2Leads(g);
    g.setColor(needsHighlight() ? selectColor : Color::gray);
    setPowerColor(g, false);
    drawDiamond(g);

    // post 2 is the + terminal, matching VoltageElm (getVoltageDiff is node1 - node0).
    // position these along the diamond (lead1..lead2), not along the element: the
    // diamond is a fixed size, so element-length fractions drift outside it when the
    // element is stretched.  halfway out to each tip the diamond is still half as
    // wide as it is tall, which leaves room for the glyph.
    g.setFont(Font("SansSerif", 0, 12));
    Point pm = interpPoint(lead1, lead2, 0.3);
    Point pp = interpPoint(lead1, lead2, 0.7);
    drawCenteredText(g, "−", pm.x, pm.y, true);
    drawCenteredText(g, "+", pp.x, pp.y, true);

    setBbox(point1, point2, diamondSize);
    doDots(g);
    drawPosts(g);
}
