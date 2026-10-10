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

#include "JKFlipFlopElm.h"

#include "../core/StringTokenizer.h"

void JKFlipFlopElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr)
        pins[4].value = !pins[3].value;
}

void JKFlipFlopElm::setupPins() {
    sizeX = 2;
    sizeY = 3;
    pins.assign(getPostCount(), Pin());
    pins[0] = Pin(this, 0, SIDE_W, "J");
    pins[1] = Pin(this, 1, SIDE_W, "");
    pins[1].clock = true;
    pins[1].bubble = !positiveEdgeTriggered();
    pins[2] = Pin(this, 2, SIDE_W, "K");
    pins[3] = Pin(this, 0, SIDE_E, "Q");
    pins[3].output = pins[3].state = true;
    pins[4] = Pin(this, 2, SIDE_E, "Q");
    pins[4].output = true;
    pins[4].lineOver = true;
    if (hasReset()) {
        pins[5] = Pin(this, 1, SIDE_E, "R");
        pins[5].bubble = invertReset();
    }
}

void JKFlipFlopElm::execute() {
    bool transition = positiveEdgeTriggered() ? pins[1].value && !lastClock : !pins[1].value && lastClock;
    if (transition) {
        bool q = pins[3].value;
        if (pins[0].value) {
            if (pins[2].value) q = !q;
            else q = true;
        } else if (pins[2].value)
            q = false;
        writeOutput(3, q);
    }
    lastClock = pins[1].value;
    if (hasReset() && pins[5].value != invertReset())
        writeOutput(3, false);
    writeOutput(4, !pins[3].value);
}

std::optional<EditInfo> JKFlipFlopElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Reset Pin", hasReset());
    if (n == 1)
        return EditInfo::createCheckbox("Positive Edge Triggered", positiveEdgeTriggered());
    if (n == 2)
        return EditInfo::createCheckbox("Invert Reset", invertReset());
    return ChipElm::getChipEditInfo(n);
}

void JKFlipFlopElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        flags = ei.changeFlag(flags, FLAG_RESET);
        setupPins();
        allocNodes();
        setPoints();
    }
    if (n == 1) {
        flags = ei.changeFlag(flags, FLAG_POSITIVE_EDGE);
        pins[1].bubble = !positiveEdgeTriggered();
    }
    if (n == 2) {
        flags = ei.changeFlag(flags, FLAG_INVERT_RESET);
        setupPins();
        setPoints();
    }
    ChipElm::setChipEditValue(n, ei);
}
