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

class RingCounterElm : public ChipElm {
public:
    ELM_CLASS(RingCounterElm)
    static constexpr int FLAG_CLOCK_INHIBIT = 2;
    static constexpr int FLAG_RESET_HIGH = 4;
    int clockInhibit = -1;

    CHIP_CONSTRUCTORS(RingCounterElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    std::string getChipName() override { return "ring counter"; }
    bool needsBits() override { return true; }
    int defaultBitCount() override { return 10; }
    bool hasClockInhibit() { return (flags & FLAG_CLOCK_INHIBIT) != 0 && bits >= 3; }
    bool hasInvertReset() { return (flags & FLAG_RESET_HIGH) == 0; }
    void setupPins() override;
    int getPostCount() override { return hasClockInhibit() ? bits + 3 : bits + 2; }
    int getVoltageSourceCount() override { return bits; }
    void execute() override;
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    int getDumpType() override { return 163; }
};
