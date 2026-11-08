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

// A bank of independent 2:1 multiplexers (A1/B1->Y1, A2/B2->Y2, ...) that all share a single
// select line, like a 74157/74158 "quad 2-input multiplexer" generalized to any mux count.
class GangedMultiplexerElm : public ChipElm {
public:
    ELM_CLASS(GangedMultiplexerElm)
    static constexpr int FLAG_INVERTED_OUTPUT = 1 << 1;
    static constexpr int FLAG_STROBE = 1 << 2;
    int count = 1;
    int strobe = -1;
    int outputPin = 0;
    int selectPin = 0;
    bool hasReset() { return false; }

    CHIP_CONSTRUCTORS(GangedMultiplexerElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    std::string getChipName() override { return "Ganged Multiplexer"; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setupPins() override;
    int getPostCount() override;
    int getVoltageSourceCount() override;
    void execute() override;
    int getDumpType() override { return 437; }
    std::string getXmlDumpType() override { return "gmux"; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
