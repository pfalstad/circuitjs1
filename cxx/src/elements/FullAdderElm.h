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

class FullAdderElm : public ChipElm {
public:
    ELM_CLASS(FullAdderElm)
    static constexpr int FLAG_BITS = 2;
    int carryIn = 0;
    int carryOut = 0;

    CHIP_CONSTRUCTORS(FullAdderElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    std::string getChipName() override { return "Adder"; }
    void setupPins() override;
    int getPostCount() override { return bits * 3 + 2; }
    int getVoltageSourceCount() override { return bits + 1; }
    void execute() override;
    int getDumpType() override { return 196; }
    bool needsBits() override { return (flags & FLAG_BITS) != 0; }
    bool allowBus() override { return needsBits(); }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
