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

#include "SRAMElm.h"

class ROMElm : public SRAMElm {
public:
    ELM_CLASS(ROMElm)
    CHIP_CONSTRUCTORS(ROMElm, SRAMElm)
    std::string getChipName() override { return "ROM"; }
    int getDumpType() override { return 436; }
    // no WE pin; just OE + address + data
    void setupPins() override;
    int getPostCount() override { return 1 + addressBits + dataBits; }
    void doStep() override;
    // no writing
    void stepFinished() override {}
};
