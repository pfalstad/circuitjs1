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

#include "FullAdderElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

void FullAdderElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st == nullptr) {
        flags |= FLAG_BITS;
        bits = 4;
        setupPins();
    } else {
        if (!needsBits())
            bits = 1;
        setupPins();
    }
}

void FullAdderElm::setupPins() {
    sizeX = 2;
    int bitsY = useBus() ? 1 : bits;
    sizeY = bitsY * 2 + 1;
    pins.assign(getPostCount(), Pin());
    makeBitPins(bits, 0, SIDE_W, 0, "A", false, false, false);
    makeBitPins(bits, bitsY, SIDE_W, bits, "B", false, false, false);
    makeBitPins(bits, 2, SIDE_E, bits * 2, "S", true, false, false);
    carryIn = bits * 3;
    carryOut = bits * 3 + 1;
    pins[carryOut] = Pin(this, 0, SIDE_E, "C");
    pins[carryOut].output = true;
    pins[carryIn] = Pin(this, bitsY * 2, SIDE_W, "Cin");
    allocNodes();
}

void FullAdderElm::execute() {
    int c = pins[carryIn].value ? 1 : 0;
    for (int i = 0; i != bits; i++) {
        int v = (pins[i].value ? 1 : 0) + (pins[i + bits].value ? 1 : 0) + c;
        c = (v > 1) ? 1 : 0;
        writeOutput(i + bits * 2, ((v & 1) == 1));
    }
    writeOutput(carryOut, (c == 1));
}

std::optional<EditInfo> FullAdderElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless().setPositive().setStructural();
    return ChipElm::getChipEditInfo(n);
}

void FullAdderElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        bits = (int) std::floor(ei.value);
        flags |= FLAG_BITS;
        setupPins();
        setPoints();
        allocNodes();
        return;
    }
    ChipElm::setChipEditValue(n, ei);
}
