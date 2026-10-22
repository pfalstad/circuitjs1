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

class VCOElm : public ChipElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(VCOElm)
    const double cResistance = 1e6;
    double cCurrent = 0;
    int cDir = 0;

    CHIP_CONSTRUCTORS(VCOElm, ChipElm)
    std::string getChipName() override { return "VCO"; }
    void setupPins() override;
    bool nonLinear() override { return true; }
    void stamp() override;
    void doStep() override;
    void computeCurrent();
    void draw(Graphics &g) override;
    int getPostCount() override { return 6; }
    int getVoltageSourceCount() override { return 3; }
    int getDumpType() override { return 158; }
    bool getMatrixConnection(int, int) override { return true; }
    bool isDigitalChip() override { return false; }
};
