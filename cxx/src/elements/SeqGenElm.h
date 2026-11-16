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
class SeqGenElm : public ChipElm {
public:
    ELM_CLASS(SeqGenElm)
    static constexpr int FLAG_NEW_VERSION = 2;
    static constexpr int FLAG_PLAY_ONCE = 4;
    static constexpr int FLAG_HAS_RESET = 8;
    int bitPosition = 0;
    int bitCount = 0;
    std::vector<int32_t> data = std::vector<int32_t>(1);
    bool clockstate = false;

    CHIP_CONSTRUCTORS(SeqGenElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    std::string getChipName() override { return "sequence generator"; }
    void setupPins() override;
    double getVoltageDiff() override { return nodes[1]->v; }
    int getPostCount() override { return hasReset() ? 3 : 2; }
    int getVoltageSourceCount() override { return 1; }
    bool hasPlayOnce() { return (flags & FLAG_PLAY_ONCE) != 0; }
    bool hasReset() { return (flags & FLAG_HAS_RESET) != 0; }
    void reset() override;
    void nextBit();
    void execute() override;
    int getDumpType() override { return 188; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
