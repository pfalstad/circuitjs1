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

#include "Counter193Elm.h"

#include <algorithm>
#include <cmath>

void Counter193Elm::setupPins() {
    if (!bits)
        return;
    sizeX = 2;
    sizeY = useBus() ? 1 : std::max(bits + 4, 6);
    pins.assign(getPostCount(), Pin());

    makeBitPins(bits, 0, SIDE_E, 0, "Q", true, true, true);
    makeBitPins(bits, 0, SIDE_W, bits, "I", false, false, true);

    int row = bits;
    cpuPost = 2 * bits;
    pins[cpuPost] = Pin(this, row++, SIDE_W, "U");
    pins[cpuPost].clock = true;

    cpdPost = 2 * bits + 1;
    pins[cpdPost] = Pin(this, row++, SIDE_W, "D");
    pins[cpdPost].clock = true;

    mrPost = 2 * bits + 2;
    pins[mrPost] = Pin(this, row++, SIDE_W, "CLR");

    loadPost = 2 * bits + 3;
    pins[loadPost] = Pin(this, row++, SIDE_W, "LD");
    pins[loadPost].bubble = true;

    tcuPost = 2 * bits + 4;
    row = bits;
    pins[tcuPost] = Pin(this, row++, SIDE_E, "CO");
    pins[tcuPost].output = true;
    pins[tcuPost].bubble = true;

    tcdPost = 2 * bits + 5;
    pins[tcdPost] = Pin(this, row++, SIDE_E, "BO");
    pins[tcdPost].output = true;
    pins[tcdPost].bubble = true;

    allocNodes();
}

std::optional<EditInfo> Counter193Elm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("BCD (mod 10, 74192)", isBCD());
    if (n == 1 && !isBCD())
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless();
    return std::nullopt;
}

void Counter193Elm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        flags = ei.changeFlag(flags, FLAG_BCD);
        if (isBCD()) bits = 4;  // a decade digit is inherently 4 bits
        setupPins();
        setPoints();
        allocNodes();
    }
    if (n == 1 && !isBCD()) {
        if (ei.value >= 1) {
            bits = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
            allocNodes();
        } else
            ei.setError("must be >= 1");
    }
}

// CLR is checked first (unconditional, async), then LD (async, transparent), then whichever
// clock just rose.  CO/BO are recomputed every call, combinationally off the live Q bits and
// clock levels.
void Counter193Elm::execute() {
    int realmod = isBCD() ? 10 : (1 << bits);
    bool cpu = pins[cpuPost].value;
    bool cpd = pins[cpdPost].value;
    bool mr = pins[mrPost].value;
    bool load = !pins[loadPost].value;

    if (mr) {
        for (int i = 0; i < bits; i++) writeOutput(qPost(i), false);
    } else if (load) {
        for (int i = 0; i < bits; i++) writeOutput(qPost(i), pins[dataPost(i)].value);
    } else {
        int value = 0;
        for (int i = 0; i < bits; i++) if (pins[qPost(i)].value) value |= 1 << i;
        if (cpu && !lastCPU) value = (value + 1) % realmod;
        else if (cpd && !lastCPD) value = (value - 1 + realmod) % realmod;
        for (int i = 0; i < bits; i++) writeOutput(qPost(i), (value & (1 << i)) != 0);
    }

    int value = 0;
    for (int i = 0; i < bits; i++) if (pins[qPost(i)].value) value |= 1 << i;
    writeOutput(tcuPost, !(value == realmod - 1 && !cpu));
    writeOutput(tcdPost, !(value == 0 && !cpd));

    lastCPU = cpu;
    lastCPD = cpd;
}
