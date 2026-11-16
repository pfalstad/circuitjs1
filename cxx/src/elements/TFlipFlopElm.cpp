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

#include "TFlipFlopElm.h"

#include "../core/StringTokenizer.h"

void TFlipFlopElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr)
        pins[2].value = !pins[1].value;
}

void TFlipFlopElm::setupPins() {
    sizeX = 2;
    sizeY = 3;
    pins.assign(getPostCount(), Pin());
    pins[0] = Pin(this, 0, SIDE_W, "T");
    pins[1] = Pin(this, 0, SIDE_E, "Q");
    pins[1].output = pins[1].state = true;
    pins[2] = Pin(this, hasSet() ? 1 : 2, SIDE_E, "Q");
    pins[2].output = true;
    pins[2].lineOver = true;
    pins[3] = Pin(this, 1, SIDE_W, "");
    pins[3].clock = true;
    if (!hasSet()) {
        if (hasReset())
            pins[4] = Pin(this, 2, SIDE_W, "R");
    } else {
        pins[5] = Pin(this, 2, SIDE_W, "S");
        pins[4] = Pin(this, 2, SIDE_E, "R");
    }
}

void TFlipFlopElm::reset() {
    ChipElm::reset();
    pins[2].value = true;
}

void TFlipFlopElm::execute() {
    if (pins[3].value && !lastClock) {
        if (pins[0].value)  // if T = 1
            pins[1].value = !pins[1].value;
        // else no change
    }
    if (hasSet() && pins[5].value)
        pins[1].value = true;
    if (hasReset() && pins[4].value)
        pins[1].value = false;
    pins[2].value = !pins[1].value;
    lastClock = pins[3].value;
}

std::optional<EditInfo> TFlipFlopElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Reset Pin", hasReset()).setStructural();
    if (n == 1)
        return EditInfo::createCheckbox("Set Pin", hasSet()).setStructural();
    return ChipElm::getChipEditInfo(n);
}

void TFlipFlopElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.checkbox->getState())
            flags |= FLAG_RESET;
        else
            flags &= ~FLAG_RESET | FLAG_SET;
        setupPins();
        allocNodes();
        setPoints();
    }
    if (n == 1) {
        if (ei.checkbox->getState())
            flags |= FLAG_SET;
        else
            flags &= ~FLAG_SET;
        setupPins();
        allocNodes();
        setPoints();
    }
    ChipElm::setChipEditValue(n, ei);
}
