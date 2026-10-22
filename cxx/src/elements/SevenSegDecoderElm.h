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

class SevenSegDecoderElm : public ChipElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(SevenSegDecoderElm)
    static const bool symbols[16][7];
    static const bool symbols14[16][14];
    static const bool symbols16[16][16];
    static constexpr int FLAG_ENABLE = (1 << 1);
    static constexpr int FLAG_BLANK_F = (1 << 2);
    static constexpr int FLAG_148_FONT = (1 << 3);
    int segmentType = 0;  // 0=7-seg, 1=14-seg, 2=16-seg

    CHIP_CONSTRUCTORS(SevenSegDecoderElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getSegmentCount();
    bool needsBits() override { return false; }
    bool allowBus() override { return true; }
    std::string getChipName() override;
    void setupPins() override;
    bool hasBlank() { return (flags & FLAG_ENABLE) != 0; }
    bool blankOnF() { return (flags & FLAG_BLANK_F) != 0; }
    bool use148Font() { return (flags & FLAG_148_FONT) != 0; }
    int getPostCount() override { return getSegmentCount() + 4 + (hasBlank() ? 1 : 0); }
    int getVoltageSourceCount() override { return getSegmentCount(); }
    void execute() override;
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    int getDumpType() override { return 197; }

private:
    bool segVal(int segCount, int digit, int seg);
};
