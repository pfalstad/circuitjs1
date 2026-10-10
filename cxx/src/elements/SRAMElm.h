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

#include <map>

class SRAMElm : public ChipElm {
public:
    ELM_CLASS(SRAMElm)
    static constexpr int FLAG_HEX_DISPLAY = 4;
    static constexpr int FLAG_RELOAD_ON_RESET = 2;
    int addressNodes = 0;
    int dataNodes = 0;
    int internalNodes = 0;
    int addressBits = 0;
    int dataBits = 0;
    std::map<int, int> map;
    std::optional<std::map<int, int>> initialMap;  // saved initial contents for restore on reset
    int address = 0;
    // TODO: Load Contents From File (the TS version uses a browser file input)

    CHIP_CONSTRUCTORS(SRAMElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void reset() override;
    bool nonLinear() override { return true; }
    bool allowBus() override { return true; }
    std::string getChipName() override { return "Static RAM"; }
    void setupPins() override;
    int getPostCount() override { return 2 + addressBits + dataBits; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    std::string contentsToString();
    std::string toHex(int val);
    void parseContentsString(const std::string &s);
    int parseNumber(const std::string &str);
    void setChipEditValue(int n, EditInfo &ei) override;
    int getVoltageSourceCount() override { return dataBits; }
    int getInternalNodeCount() override { return dataBits; }
    void setVoltageSource(int j, VoltageSource *vs) override;
    bool getMatrixConnection(int n1, int n2) override;
    void stamp() override;
    void doStep() override;
    void stepFinished() override;
    int getDumpType() override { return 413; }
};
