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

#pragma once

#include <vector>

#include "CircuitNode.h"

class CircuitElm;
class SimulationManager;

class FindPathInfo {
public:
    static constexpr int INDUCT = 1;
    static constexpr int VOLTAGE = 2;
    static constexpr int SHORT = 3;
    static constexpr int CAP_V = 4;

    // State object to help find loops in circuit subject to various conditions (depending on type_)
    // elm_ = source and destination element.  dest_ = destination node.
    FindPathInfo(int type_, CircuitElm *elm_, const NodeRef &dest_, SimulationManager *sim_);

    // look through circuit for loop starting at node n1 of firstElm, for a path back to
    // dest node of firstElm
    bool findPath(const NodeRef &n1);

private:
    bool checkElm(const NodeRef &n1, CircuitElm *ce);

    std::vector<bool> visited;
    NodeRef dest;
    CircuitElm *firstElm;
    int type;
    SimulationManager *sim;
};
