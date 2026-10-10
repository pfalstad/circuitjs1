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

class CircuitNode;
class VoltageSource;

// one independent sub-matrix of the circuit (one per closure of matrix-connected nodes)
class CircuitMatrix {
public:
    std::vector<std::vector<double>> matrix;
    std::vector<double> rightSide;
    std::vector<double> origRightSide;
    std::vector<std::vector<double>> origMatrix;
    std::vector<int> permute;
    int size = 0;
    int nodeCount = 0;   // number of node rows (vs rows come after)
    bool nonLinear = false;
    std::vector<double> nodeVoltages;
    std::vector<double> lastNodeVoltages;
    std::vector<CircuitNode *> nodeList;
    std::vector<VoltageSource *> voltageSourceList;
};
