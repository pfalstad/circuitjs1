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

#include "FindPathInfo.h"

#include <cmath>

#include "CircuitElm.h"
#include "SimulationManager.h"

FindPathInfo::FindPathInfo(int type_, CircuitElm *elm_, const NodeRef &dest_, SimulationManager *sim_)
    : visited(sim_->nodeList.size(), false), dest(dest_), firstElm(elm_), type(type_), sim(sim_) {}

bool FindPathInfo::findPath(const NodeRef &n1) {
    if (n1 == dest)
        return true;

    // depth first search, don't need to revisit already visited nodes!
    if (visited[n1->index])
        return false;

    visited[n1->index] = true;
    for (size_t i = 0; i < n1->links.size(); i++) {
        CircuitElm *ce = n1->links[i].elm;
        if (checkElm(n1, ce))
            return true;
    }
    if (n1 == CircuitNode::ground) {
        for (size_t i = 0; i < sim->nodesWithGroundConnection.size(); i++)
            if (checkElm(CircuitNode::ground, sim->nodesWithGroundConnection[i]))
                return true;
    }
    return false;
}

bool FindPathInfo::checkElm(const NodeRef &n1, CircuitElm *ce) {
    if (ce == firstElm)
        return false;
    if (type == INDUCT) {
        // inductors need a path free of current sources
        if (ce->isCurrentElm())
            return false;
    }
    if (type == VOLTAGE) {
        // when checking for voltage loops, we only care about voltage sources/wires/ground
        if (!(ce->isWireEquivalent() || ce->isVoltageElm() || ce->isLogicInputElm() || ce->isGroundElm()))
            return false;
    }
    // when checking for shorts, just check wires
    if (type == SHORT && !ce->isWireEquivalent())
        return false;
    if (type == CAP_V) {
        // checking for capacitor/voltage source loops
        if (!(ce->isWireEquivalent() || ce->isIdealCapacitor() || ce->isVoltageElm() || ce->isLogicInputElm()))
            return false;
    }
    if (n1 == CircuitNode::ground) {
        // look for posts which have a ground connection;
        // our path can go through ground
        for (int j = 0; j < ce->getPostCount(); j++)
            if (ce->hasGroundConnection(j) && findPath(ce->getNode(j)))
                return true;
    }
    for (int j = 0; j < ce->getPostCount(); j++) {
        if (ce->getNode(j) == n1) {
            if (ce->hasGroundConnection(j) && findPath(CircuitNode::ground))
                return true;
            if (type == INDUCT && ce->isInductorElm()) {
                // inductors can use paths with other inductors of matching current
                double c = ce->getCurrent();
                if (j == 0)
                    c = -c;
                if (std::abs(c - firstElm->getCurrent()) > 1e-10)
                    continue;
            }
            for (int k = 0; k < ce->getPostCount(); k++) {
                if (j == k)
                    continue;
                if (ce->getConnection(j, k) && findPath(ce->getNode(k)))
                    return true;
            }
        }
    }
    return false;
}
