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

#include "RingCounterElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

void RingCounterElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st == nullptr) {
        flags |= FLAG_CLOCK_INHIBIT;
        setupPins();
    }
}

void RingCounterElm::setupPins() {
    if (!bits)
        return;
    sizeX = bits > 2 ? bits : 2;
    sizeY = 2;
    pins.assign(getPostCount(), Pin());
    pins[0] = Pin(this, 1, SIDE_W, "");
    pins[0].clock = true;
    pins[1] = Pin(this, sizeX - 1, SIDE_S, "R");
    pins[1].lineOver = hasInvertReset();
    for (int i = 0; i != bits; i++) {
        int ii = i + 2;
        pins[ii] = Pin(this, i, SIDE_N, "Q" + std::to_string(i));
        pins[ii].output = pins[ii].state = true;
    }
    if (hasClockInhibit()) {
        clockInhibit = (int) pins.size() - 1;
        pins[clockInhibit] = Pin(this, 1, SIDE_S, "CE");
        pins[clockInhibit].lineOver = true;
    } else
        clockInhibit = -1;
    allocNodes();
}

void RingCounterElm::execute() {
    int i;
    bool running = true;
    if (hasClockInhibit() && pins[clockInhibit].value)
        running = false;
    // find which output is high
    for (i = 0; i != bits; i++)
        if (pins[i + 2].value)
            break;
    if (pins[0].value && !lastClock && running) {
        if (i < bits)
            pins[i++ + 2].value = false;
        i %= bits;
        pins[i + 2].value = true;
    }
    // reset if requested, or if all outputs are low
    if (pins[1].value != hasInvertReset() || i == bits) {
        for (i = 1; i != bits; i++)
            pins[i + 2].value = false;
        pins[2].value = true;
    }
    lastClock = pins[0].value;
}

std::optional<EditInfo> RingCounterElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Invert reset pin", hasInvertReset());
    if (n == 1)
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless();
    return std::nullopt;
}

void RingCounterElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.checkbox->getState())
            flags &= ~FLAG_RESET_HIGH;
        else
            flags |= FLAG_RESET_HIGH;
        setupPins();
        setPoints();
        return;
    }
    if (n == 1) {
        if (ei.value >= 2) {
            bits = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be >= 2");
    }
}
