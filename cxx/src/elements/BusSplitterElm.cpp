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

#include "BusSplitterElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

void BusSplitterElm::setupPins() {
    sizeX = 2;
    sizeY = bits;
    currents.assign(bits, 0);
    pins.assign(getPostCount(), Pin());
    // bus side: all pins at same position
    for (int i = 0; i != bits; i++) {
        pins[i] = Pin(this, 0, SIDE_W, "Bus");
        pins[i].busWidth = bits;
        pins[i].busZ = i;
    }
    // individual side: one pin per bit
    for (int i = 0; i != bits; i++)
        pins[i + bits] = Pin(this, bits - 1 - i, SIDE_E, std::to_string(i));
}

double BusSplitterElm::getCurrentIntoNode(int n) {
    if (n < bits)
        return -currents[n];
    return currents[n - bits];
}

void BusSplitterElm::setWireCurrent(int bit, double c) {
    currents[bit] = c;
    pins[bit + bits].current = c;
    // update total bus current on pin 0 (the only bus-side pin that gets drawn)
    double total = 0;
    for (int i = 0; i < bits; i++)
        total += currents[i];
    pins[0].current = -total;
}

std::optional<EditInfo> BusSplitterElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless().setStructural();
    return std::nullopt;
}

void BusSplitterElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 2) {
            bits = (int) std::floor(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be >= 2");
    }
}
