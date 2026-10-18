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

class JKFlipFlopElm : public ChipElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(JKFlipFlopElm)
    static constexpr int FLAG_RESET = 2;
    static constexpr int FLAG_POSITIVE_EDGE = 4;
    static constexpr int FLAG_INVERT_RESET = 8;
    bool hasReset() { return (flags & FLAG_RESET) != 0; }
    bool positiveEdgeTriggered() { return (flags & FLAG_POSITIVE_EDGE) != 0; }
    bool invertReset() { return (flags & FLAG_INVERT_RESET) != 0; }

    CHIP_CONSTRUCTORS(JKFlipFlopElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    std::string getChipName() override { return "JK flip-flop"; }
    void setupPins() override;
    int getPostCount() override { return 5 + (hasReset() ? 1 : 0); }
    int getVoltageSourceCount() override { return 2; }
    void execute() override;
    int getDumpType() override { return 156; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
