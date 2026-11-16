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

#include "ADCElm.h"

#include "../core/StringTokenizer.h"

#include <algorithm>
#include <cmath>

void ADCElm::setupPins() {
    if (!bits)
        return;
    sizeX = 2;
    int bitsY = useBus() ? 1 : (bits > 2 ? bits : 2);
    sizeY = bitsY > 2 ? bitsY : 2;
    pins.assign(getPostCount(), Pin());
    makeBitPins(bits, 0, SIDE_E, 0, "D", true, false, false);
    pins[bits] = Pin(this, 0, SIDE_W, "In");
    pins[bits + 1] = Pin(this, sizeY - 1, SIDE_W, "V+");
    allocNodes();
}

void ADCElm::execute() {
    int imax = (1 << bits) - 1;
    // if we round, the half-flash does not work
    double val = imax * nodes[bits]->v / nodes[bits + 1]->v;  // + .5;
    // Math.trunc() then clamp; NaN (0/0) clamps to 0 the way Math.max(0, NaN) does not, so check
    double t = std::trunc(val);
    int ival;
    if (std::isnan(t))
        ival = 0;  // JS: Math.min(imax, Math.max(0, NaN)) is NaN, and NaN & bit is 0
    else
        ival = (int) std::min((double) imax, std::max(0.0, t));
    for (int i = 0; i != bits; i++)
        pins[i].value = ((ival & (1 << i)) != 0);
}

std::optional<EditInfo> ADCElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless().setStructural();
    return std::nullopt;
}

void ADCElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 2) {
            bits = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be >= 2");
    }
}
