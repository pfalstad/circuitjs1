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

class TFlipFlopElm : public ChipElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(TFlipFlopElm)
    static constexpr int FLAG_RESET = 2;
    static constexpr int FLAG_SET = 4;
    bool hasReset() { return (flags & FLAG_RESET) != 0 || hasSet(); }
    bool hasSet() { return (flags & FLAG_SET) != 0; }

    CHIP_CONSTRUCTORS(TFlipFlopElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    std::string getChipName() override { return "T flip-flop"; }
    void setupPins() override;
    int getPostCount() override { return 4 + (hasReset() ? 1 : 0) + (hasSet() ? 1 : 0); }
    int getVoltageSourceCount() override { return 2; }
    void reset() override;
    void execute() override;
    int getDumpType() override { return 193; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
