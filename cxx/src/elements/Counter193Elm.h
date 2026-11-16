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

// Models a real SN74193/74LS193 "Synchronous 4-Bit Up/Down Binary Counter", generalized to any
// number of bits (a real 74193 at bits == 4).  UP and DN are separate rising-edge clocks; CLR
// (active high) and LD (active low, transparent) are asynchronous, CLR first.  CO and BO (both
// active low) are combinational: CO is low when every Q is 1 and UP is low; BO is low when every
// Q is 0 and DN is low.  FLAG_BCD makes it a 74192 (decade counter, forces bits = 4).
// (see Counter193Elm.ts for details)
class Counter193Elm : public ChipElm {
public:
    ELM_CLASS(Counter193Elm)
    static constexpr int FLAG_BCD = 1 << 1;
    bool isBCD() const { return hasFlag(FLAG_BCD); }

    // Post layout (all computed in setupPins(), since it depends on bits):
    //   0..bits-1            Q0..Q(bits-1) (Q0 = LSB)
    //   bits..2*bits-1       data inputs I0..I(bits-1)
    //   cpuPost, cpdPost     UP (count up clock), DN (count down clock)
    //   mrPost               CLR (master reset, active high)
    //   loadPost             LD (parallel load, active low)
    //   tcuPost, tcdPost     CO (carry, active low), BO (borrow, active low)
    int cpuPost = 0, cpdPost = 0, mrPost = 0, loadPost = 0, tcuPost = 0, tcdPost = 0;
    bool lastCPU = false, lastCPD = false;

    CHIP_CONSTRUCTORS(Counter193Elm, ChipElm)
    int qPost(int i) const { return bits - 1 - i; }
    int dataPost(int i) const { return bits + (bits - 1 - i); }
    bool needsBits() override { return true; }
    bool allowBus() override { return true; }
    std::string getChipName() override {
        return isBCD() ? "BCD Up/Down Counter w/ Load (74192)" : "Up/Down Counter w/ Load (74193)";
    }
    void setupPins() override;
    int getPostCount() override { return bits ? bits * 2 + 6 : 0; }
    int getVoltageSourceCount() override { return bits + 2; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    void execute() override;
    int getDumpType() override { return 439; }
    std::string getXmlDumpType() override { return "ctr193"; }
};
