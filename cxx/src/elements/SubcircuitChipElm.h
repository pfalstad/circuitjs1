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

#pragma once

#include "ChipElm.h"

// concrete subclass of ChipElm that can be used by other elements (like SubcircuitElm) to draw chips.
// SubcircuitElm can't be a subclass of both ChipElm and CompositeElm.
class SubcircuitChipElm : public ChipElm {
public:
    ELM_CLASS(SubcircuitChipElm)
    std::optional<std::string> label;
    bool pinsAllocated = false;  // TS: pins != null

    SubcircuitChipElm(int xx, int yy) : ChipElm(xx, yy) {}
    // a ready-to-use chip (ChipElm's setup, then setSize(2), as the TS constructor does)
    static SubcircuitChipElm *create(int xx, int yy) {
        SubcircuitChipElm *c = new SubcircuitChipElm(xx, yy);
        c->postConstruct(nullptr);
        c->setSize(2);
        return c;
    }

    bool needsBits() override { return false; }
    void setupPins() override {}
    int getVoltageSourceCount() override { return 0; }
    void allocPins(int n) {
        pins.assign(n, Pin());
        pinsAllocated = true;
    }
    void setPin(int n, int p, int s, const std::string &t) {
        pins[n] = Pin(this, p, s, t);
        pins[n].fixName();
    }
    void setLabel(const std::optional<std::string> &text) { label = text; }
    void drawLabel(Graphics &g, int x, int y) override;
    int getPostCount() override { return !pinsAllocated ? 1 : (int) pins.size(); }
};
