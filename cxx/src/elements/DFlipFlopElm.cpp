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

#include "DFlipFlopElm.h"

#include "../core/StringTokenizer.h"

void DFlipFlopElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    pins[2].value = !pins[1].value;
}

void DFlipFlopElm::setupPins() {
    sizeX = 2;
    sizeY = 3;
    pins.assign(getPostCount(), Pin());
    pins[0] = Pin(this, 0, SIDE_W, "D");
    pins[1] = Pin(this, 0, SIDE_E, "Q");
    pins[1].output = pins[1].state = true;
    pins[2] = Pin(this, hasSet() ? 1 : 2, SIDE_E, "Q");
    pins[2].output = true;
    pins[2].lineOver = true;
    pins[3] = Pin(this, 1, SIDE_W, "");
    pins[3].clock = true;
    if (!hasSet()) {
        if (hasReset()) {
            pins[4] = Pin(this, 2, SIDE_W, "R");
            pins[4].bubble = invertSetReset();
        }
    } else {
        pins[5] = Pin(this, 2, SIDE_W, "S");
        pins[4] = Pin(this, 2, SIDE_E, "R");
        pins[4].bubble = pins[5].bubble = invertSetReset();
    }
}

void DFlipFlopElm::execute() {
    bool isSet = false;
    bool isReset = false;
    if (hasSet() && pins[5].value != invertSetReset()) isSet = true;
    if (hasReset() && pins[4].value != invertSetReset()) isReset = true;
    if (isSet || isReset) {
        writeOutput(1, false);
        writeOutput(2, false);
        if (isSet) writeOutput(1, true);
        if (isReset) writeOutput(2, true);
    } else {
        if (pins[3].value && !lastClock)
            writeOutput(1, pins[0].value);
        writeOutput(2, !pins[1].value);
    }
    lastClock = pins[3].value;
}

std::optional<EditInfo> DFlipFlopElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Reset Pin", hasReset()).setStructural();
    if (n == 1)
        return EditInfo::createCheckbox("Set Pin", hasSet()).setStructural();
    if (n == 2)
        return EditInfo::createCheckbox("Invert Set/Reset", invertSetReset());
    return ChipElm::getChipEditInfo(n);
}

void DFlipFlopElm::setChipEditValue(int n, EditInfo &ei) {
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
    if (n == 2) {
        flags = ei.changeFlag(flags, FLAG_INVERT_SET_RESET);
        setupPins();
        setPoints();
    }
    ChipElm::setChipEditValue(n, ei);
}
