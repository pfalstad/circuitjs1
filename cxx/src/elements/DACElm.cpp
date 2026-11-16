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

#include "DACElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/SimulationManager.h"

void DACElm::setupPins() {
    if (!bits)
        return;
    sizeX = 2;
    int bitsY = useBus() ? 1 : (bits > 2 ? bits : 2);
    sizeY = bitsY > 2 ? bitsY : 2;
    pins.assign(getPostCount(), Pin());
    makeBitPins(bits, 0, SIDE_W, 0, "D", false, false, false);
    pins[bits] = Pin(this, 0, SIDE_E, "O");
    pins[bits].output = true;
    pins[bits + 1] = Pin(this, sizeY - 1, SIDE_E, "V+");
    allocNodes();
}

void DACElm::doStep() {
    int ival = 0;
    for (int i = 0; i != bits; i++)
        if (nodes[i]->v > getThreshold())
            ival |= 1 << i;
    int ivalmax = (1 << bits) - 1;
    double v = ival * nodes[bits + 1]->v / ivalmax;
    sim->updateVoltageSource(CircuitNode::ground, nodes[bits], pins[bits].voltSource, v);
}

std::optional<EditInfo> DACElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless().setStructural();
    return std::nullopt;
}

void DACElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 2) {
            bits = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be >= 2");
    }
}
