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

class TimerElm : public ChipElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(TimerElm)
    static constexpr int FLAG_RESET = 2;
    static constexpr int FLAG_GROUND = 4;
    static constexpr int FLAG_NUMBERS = 8;
    static constexpr int N_DIS = 0;
    static constexpr int N_TRIG = 1;
    static constexpr int N_THRES = 2;
    static constexpr int N_VCC = 3;
    static constexpr int N_CTL = 4;
    static constexpr int N_OUT = 5;
    static constexpr int N_RST = 6;
    static constexpr int N_GND = 7;
    int getDefaultFlags() override { return FLAG_RESET | FLAG_GROUND; }
    NodeRef ground;
    bool out = false;
    bool triggerSuppressed = false;

    CHIP_CONSTRUCTORS(TimerElm, ChipElm)
    std::string getChipName() override { return "555 Timer"; }
    void setupPins() override;
    bool nonLinear() override { return true; }
    bool hasReset() { return (flags & FLAG_RESET) != 0 || hasGroundPin(); }
    bool hasGroundPin() { return (flags & FLAG_GROUND) != 0; }
    bool usePinNumbers() { return (flags & FLAG_NUMBERS) != 0; }
    bool usePinNames() { return (flags & FLAG_NUMBERS) == 0; }
    bool isDigitalChip() override { return false; }
    void stamp() override;
    void calculateCurrent() override;
    void startIteration() override;
    void doStep() override;
    int getPostCount() override { return hasGroundPin() ? 8 : hasReset() ? 7 : 6; }
    int getVoltageSourceCount() override { return 0; }
    bool getMatrixConnection(int, int) override { return true; }
    int getDumpType() override { return 165; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
