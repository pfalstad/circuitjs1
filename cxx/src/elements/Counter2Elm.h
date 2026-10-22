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

class Counter2Elm : public ChipElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(Counter2Elm)
    int modulus = 0;
    // pin indices, set by setupPins()
    int clk = 0, clr = 0, enp = 0, ent = 0, rco = 0, load = 0;
    bool carry = false;

    CHIP_CONSTRUCTORS(Counter2Elm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    bool needsBits() override { return true; }
    bool allowBus() override { return true; }
    std::string getChipName() override;
    void setupPins() override;
    int getPostCount() override { return bits * 2 + 6; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    int getVoltageSourceCount() override { return bits + 1; }
    void execute() override;
    int getDumpType() override { return 421; }
    std::string getXmlDumpType() override { return "ctr2"; }
};
