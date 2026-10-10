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

// contributed by Edward Calver
class MultiplexerElm : public ChipElm {
public:
    ELM_CLASS(MultiplexerElm)
    static constexpr int FLAG_INVERTED_OUTPUT = 1 << 1;
    static constexpr int FLAG_STROBE = 1 << 2;
    static constexpr int FLAG_BUS_SELECT = 1 << 3;
    // inputMode: 0 = individual inputs/single output (original)
    //            1 = bus input/single output (bit selector)
    //            2 = bus input/bus output
    static constexpr int INPUT_MODE_INDIVIDUAL = 0;
    static constexpr int INPUT_MODE_BUS_BIT = 1;
    static constexpr int INPUT_MODE_BUS_BUS = 2;
    int selectBitCount = 0;
    int outputCount = 0;
    int inputMode = 0;
    int dataBusWidth = 4;
    int strobe = -1;
    int outputPin = 0;
    int selectPin = 0;
    bool hasReset() { return false; }
    bool busSelect() { return hasFlag(FLAG_BUS_SELECT); }

    CHIP_CONSTRUCTORS(MultiplexerElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    std::string getChipName() override { return "Multiplexer"; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setupPins() override;
    int getPostCount() override;
    int getVoltageSourceCount() override;
    int readSelectValue();
    void execute() override;
    int getDumpType() override { return 184; }
    std::string getXmlDumpType() override { return "mux"; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
