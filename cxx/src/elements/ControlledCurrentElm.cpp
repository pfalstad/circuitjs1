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

#include "ControlledCurrentElm.h"

#include "../core/FindPathInfo.h"
#include "../core/Graphics.h"
#include "../core/SimulationManager.h"

void ControlledCurrentElm::setPoints() {
    ControlledSourceElm::setPoints();
    // arrow along the diamond's long axis, pointing from post 1 to post 2
    ashaft1 = interpPoint(lead1, lead2, 0.3);
    ashaft2 = interpPoint(lead1, lead2, 0.7 - .1);
    Point tip = interpPoint(lead1, lead2, 0.85 - .1);
    arrow = calcArrow(center, tip, 7, 6);
}

void ControlledCurrentElm::stamp() {
    SimulationManager *sim = SimulationManager::theSim;
    if (broken) {
        // no current path; stamping a current source would cause a matrix error
        sim->stampResistor(nodes[0], nodes[1], 1e8);
        return;
    }
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
}

void ControlledCurrentElm::doStep() {
    SimulationManager *sim = SimulationManager::theSim;
    if (broken || !expr()) {
        current = 0;
        return;
    }

    if (!engine.checkConvergence(getConvergeLimit()))
        sim->converged = false;

    double rs = engine.evalAndStamp(false);
    sim->stampCurrentSource(nodes[0], nodes[1], rs);
    current = engine.value;
    engine.saveInputs();
}

void ControlledCurrentElm::stampInputDerivative(const NodeRef &pos, const NodeRef &neg, double dx) {
    SimulationManager::theSim->stampVCCurrentSource(nodes[0], nodes[1], pos, neg, dx);
}

void ControlledCurrentElm::stampInputDerivativeVS(VoltageSource *ivs, double dx) {
    SimulationManager::theSim->stampCCCS(nodes[0], nodes[1], ivs, dx);
}

bool ControlledCurrentElm::validate() {
    FindPathInfo fpi(FindPathInfo::INDUCT, this, getNode(1), SimulationManager::theSim);
    broken = !fpi.findPath(getNode(0));
    return true;
}

void ControlledCurrentElm::draw(Graphics &g) {
    draw2Leads(g);
    g.setColor(needsHighlight() ? selectColor : Color::gray);
    setPowerColor(g, false);
    drawDiamond(g);

    drawThickLine(g, ashaft1, ashaft2);
    g.fillPolygon(arrow);

    setBbox(point1, point2, diamondSize);
    doDots(g);
    drawPosts(g);
}

void ControlledCurrentElm::getInfo(std::vector<std::string> &arr) {
    ControlledSourceElm::getInfo(arr);
    if (broken) {
        size_t i = 0;
        while (i < arr.size() && !arr[i].empty())
            i++;
        if (i < arr.size())
            arr[i] = "(no current path)";
    }
}
