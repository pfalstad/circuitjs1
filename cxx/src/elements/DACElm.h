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

class DACElm : public ChipElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(DACElm)
    CHIP_CONSTRUCTORS(DACElm, ChipElm)
    std::string getChipName() override { return "DAC"; }
    bool needsBits() override { return true; }
    bool allowBus() override { return true; }
    void setupPins() override;
    void doStep() override;
    int getVoltageSourceCount() override { return 1; }
    int getPostCount() override { return bits + 2; }
    int getDumpType() override { return 166; }
    // there is already a V+ pin, how does that relate to high logic voltage?  figure out later
    bool isDigitalChip() override { return false; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
