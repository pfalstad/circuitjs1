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

#include "Counter74177Elm.h"

#include <algorithm>
#include <cmath>

void Counter74177Elm::setupPins() {
    if (!bits)
        return;
    bool clk2Needed = hasRipple() && !singleClock();
    int leftCount = bits + 3 + (clk2Needed ? 1 : 0);  // data + CLK1 + [CLK2] + LOAD + CLR
    sizeX = 2;
    sizeY = std::max(leftCount, bits);
    pins.assign(leftCount + bits, Pin());

    makeBitPins(bits, 0, SIDE_W, 0, "I", false, false, false);
    outputBase = leftCount;
    makeBitPins(bits, 0, SIDE_E, outputBase, "Q", true, true, false);

    int row = bits;
    clk1Post = bits;
    pins[clk1Post] = Pin(this, row++, SIDE_W, clk2Needed ? "CLK1" : "");
    pins[clk1Post].clock = true;
    pins[clk1Post].bubble = true;

    if (clk2Needed) {
        clk2Post = bits + 1;
        pins[clk2Post] = Pin(this, row++, SIDE_W, "CLK2");
        pins[clk2Post].clock = true;
        pins[clk2Post].bubble = true;
    } else {
        clk2Post = -1;
    }

    loadPost = leftCount - 2;
    pins[loadPost] = Pin(this, row++, SIDE_W, "LOAD");
    pins[loadPost].bubble = true;

    clrPost = leftCount - 1;
    pins[clrPost] = Pin(this, row++, SIDE_W, "CLR");
    pins[clrPost].bubble = true;

    allocNodes();
}

int Counter74177Elm::getPostCount() {
    if (!bits)
        return 0;
    bool clk2Needed = hasRipple() && !singleClock();
    return bits * 2 + 3 + (clk2Needed ? 1 : 0);
}

void Counter74177Elm::execute() {
    bool clr = !pins[clrPost].value;
    bool load = !pins[loadPost].value;

    if (clr) {
        for (int i = 0; i < bits; i++) pins[qPost(i)].value = false;
    } else if (load) {
        for (int i = 0; i < bits; i++) pins[qPost(i)].value = pins[dataPost(i)].value;
    } else {
        // bit 0: independent flip-flop, toggles on CLK1's falling edge
        if (lastClk1 && !pins[clk1Post].value)
            pins[qPost(0)].value = !pins[qPost(0)].value;

        // bits 1..bits-1: independent ripple counter, advances as a whole on the falling edge
        // of whatever clocks bit 1 - the real external CLK2 pin, or (singleClock()) bit 0's
        // own value (already updated above if this tick's the edge)
        if (hasRipple() && lastRippleClock && !rippleClockValue()) {
            int rippleBits = bits - 1;
            int value = 0;
            for (int i = 0; i < rippleBits; i++)
                if (pins[qPost(i + 1)].value) value |= 1 << i;
            value = (value + 1) & ((1 << rippleBits) - 1);
            for (int i = 0; i < rippleBits; i++)
                pins[qPost(i + 1)].value = (value & (1 << i)) != 0;
        }
    }

    lastClk1 = pins[clk1Post].value;
    if (hasRipple()) lastRippleClock = rippleClockValue();
}

std::optional<EditInfo> Counter74177Elm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless();
    if (n == 1 && hasRipple())
        return EditInfo::createCheckbox("Single Clock (ties bit 0 to CLK2)", singleClock());
    return std::nullopt;
}

void Counter74177Elm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 1) {
            bits = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
            ei.newDialog = true;
        } else
            ei.setError("must be >= 1");
        return;
    }
    if (n == 1) {
        flags = ei.changeFlag(flags, FLAG_SINGLE_CLOCK);
        setupPins();
        setPoints();
    }
}
