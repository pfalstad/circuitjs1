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

class BusSplitterElm : public ChipElm {
public:
    ELM_CLASS(BusSplitterElm)
    std::vector<double> currents;

    CHIP_CONSTRUCTORS(BusSplitterElm, ChipElm)
    std::string getChipName() override { return "Bus Splitter"; }
    bool needsBits() override { return true; }
    void setupPins() override;
    int getPostCount() override { return bits * 2; }
    int getBusWidth() override { return bits; }
    int getVoltageSourceCount() override { return 0; }
    // bus pin i connects to individual pin i+bits
    bool getConnection(int n1, int n2) override { return std::abs(n1 - n2) == bits; }
    bool isBusSplitterElm() override { return true; }
    bool isWireEquivalent() override { return true; }
    bool isRemovableWire() override { return true; }
    // bus bit n connects to individual pin n+bits
    std::optional<Point> getConnectedPost(int n) override { return getPost(n + bits); }
    double getCurrentIntoNode(int n) override;
    void setWireCurrent(int bit, double c) override;
    int getDumpType() override { return 433; }
    std::string getXmlDumpType() override { return "bs"; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
