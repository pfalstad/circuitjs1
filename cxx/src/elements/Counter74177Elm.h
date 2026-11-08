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

// Models a real SN74177/74LS177 "Presettable Binary Counter/Latch", generalized to any number
// of bits (a real 74177 at bits == 4).  Bit 0 is a flip-flop clocked (falling edge) by CLK1;
// bits 1..bits-1 are a ripple counter clocked by CLK2 (or by Q0, with "Single Clock").
// LOAD (active low) is asynchronous and transparent; CLR (active low) takes priority over it.
// (see Counter74177Elm.ts for details)
class Counter74177Elm : public ChipElm {
public:
    ELM_CLASS(Counter74177Elm)
    static constexpr int FLAG_SINGLE_CLOCK = 1 << 1;

    // Post layout (all computed in setupPins(), since it depends on bits and singleClock()):
    //   0..bits-1        data inputs I0..I(bits-1)
    //   clk1Post         CLK1 (always present)
    //   clk2Post         CLK2 (present only when bits>=2 && !singleClock(); else -1)
    //   loadPost, clrPost
    //   outputBase..+bits-1   Q0..Q(bits-1)
    int clk1Post = 0, clk2Post = -1, loadPost = 0, clrPost = 0, outputBase = 0;
    bool lastClk1 = false;
    // tracks whatever clocks bit 1 (CLK2, or bit 0 if singleClock())
    bool lastRippleClock = false;

    CHIP_CONSTRUCTORS(Counter74177Elm, ChipElm)
    bool singleClock() const { return hasFlag(FLAG_SINGLE_CLOCK); }
    bool hasRipple() const { return bits >= 2; }
    bool needsBits() override { return true; }
    bool allowBus() override { return true; }
    int dataPost(int i) const { return i; }
    int qPost(int i) const { return outputBase + i; }
    std::string getChipName() override { return "Presettable Counter/Latch"; }
    void setupPins() override;
    int getPostCount() override;
    int getVoltageSourceCount() override { return bits; }
    void execute() override;
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    int getDumpType() override { return 438; }
    std::string getXmlDumpType() override { return "ctr177"; }

private:
    bool rippleClockValue() { return singleClock() ? pins[qPost(0)].value : pins[clk2Post].value; }
};
