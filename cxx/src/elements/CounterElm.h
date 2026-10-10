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

class CounterElm : public ChipElm {
public:
    ELM_CLASS(CounterElm)
    bool invertreset = false;
    int modulus = 0;
    static constexpr int FLAG_UP_DOWN = 4;
    static constexpr int FLAG_NEGATIVE_EDGE = 8;

    CHIP_CONSTRUCTORS(CounterElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    std::string dump() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    bool needsBits() override { return true; }
    bool allowBus() override { return true; }
    std::string getChipName() override;
    void setupPins() override;
    int getPostCount() override { return hasUpDown() ? bits + 3 : bits + 2; }
    int getVoltageSourceCount() override { return bits; }
    bool hasUpDown() { return hasFlag(FLAG_UP_DOWN); }
    bool negativeEdgeTriggered() { return hasFlag(FLAG_NEGATIVE_EDGE); }
    void execute() override;
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    int getDumpType() override { return 164; }
    std::string getXmlDumpType() override { return "ctr"; }
};
