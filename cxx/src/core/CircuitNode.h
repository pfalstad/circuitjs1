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

#include <memory>
#include <string>
#include <vector>

class CircuitElm;
class CircuitMatrix;

struct CircuitNodeLink {
    int num = 0;
    CircuitElm *elm = nullptr;
};

class CircuitNode;

// Nodes are shared: elements hold on to them across re-analysis (setNode() reads the old
// node's voltage to preserve it), so they're reference counted rather than owned by the
// node list.  Pass NodeRef by const reference in hot paths to avoid refcount traffic.
using NodeRef = std::shared_ptr<CircuitNode>;

class CircuitNode {
public:
    // replaced with a fresh node on every analysis (see SimulationManager::setGroundNode)
    static NodeRef ground;

    std::vector<CircuitNodeLink> links;
    bool internal = false;
    int index = 0;
    CircuitMatrix *matrix = nullptr;
    int row = 0;  // row in matrix (0 = ground/excluded)
    double v = 0;

    std::string toString() const { return "node " + std::to_string(index); }
};
