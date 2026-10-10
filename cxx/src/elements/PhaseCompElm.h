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

class PhaseCompElm : public ChipElm {
public:
    ELM_CLASS(PhaseCompElm)
    bool ff1 = false;
    bool ff2 = false;

    CHIP_CONSTRUCTORS(PhaseCompElm, ChipElm)
    std::string getChipName() override { return "phase comparator"; }
    void setupPins() override;
    bool nonLinear() override { return true; }
    void stamp() override;
    void startIteration() override;
    void doStep() override;
    int getPostCount() override { return 3; }
    int getVoltageSourceCount() override { return 1; }
    int getDumpType() override { return 161; }
    bool getMatrixConnection(int, int) override { return true; }
};
