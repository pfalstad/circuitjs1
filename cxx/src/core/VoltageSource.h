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

#include "CircuitNode.h"

class VoltageSource {
public:
    int index = 0;
    CircuitElm *elm = nullptr;
    CircuitMatrix *matrix = nullptr;
    int row = 0;  // row in matrix (nodeCount + 1-based offset)
    NodeRef n1;   // nodes this VS is stamped between
    NodeRef n2;

    void setNodes(const NodeRef &a, const NodeRef &b) { n1 = a; n2 = b; }
    void assignMatrix();
};
