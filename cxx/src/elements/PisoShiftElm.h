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
class PisoShiftElm : public ChipElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(PisoShiftElm)
    static constexpr int FLAG_NEW_BEHAVIOR = 2;
    std::vector<bool> data;
    int dataIndex = 0;
    bool clockState = false;
    bool loadState = false;
    int dataPinIndex = 0;

    CHIP_CONSTRUCTORS(PisoShiftElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 186; }
    std::string getChipName() override { return "PISO shift register"; }
    bool needsBits() override { return true; }
    int defaultBitCount() override { return 8; }
    bool hasNewBhvr() { return (flags & FLAG_NEW_BEHAVIOR) != 0; }
    void reset() override;
    void setupPins() override;
    int getPostCount() override { return (hasNewBhvr() ? 4 : 3) + bits; }
    int getVoltageSourceCount() override { return 1; }
    void execute() override;
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
