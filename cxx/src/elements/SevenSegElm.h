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
#include "Diode.h"

class SevenSegElm : public ChipElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(SevenSegElm)
    // base segment count not including decimal point or colon
    int baseSegmentCount = 0;
    // segment count including decimal point or colon
    int segmentCount = 0;
    int extraSegment = 0;
    static constexpr int ES_NONE = 0;
    static constexpr int ES_DP = 1;
    static constexpr int ES_COLON = 2;
    int pinCount = 0;
    int commonPin = 0;
    // 1 = common cathode, -1 = common anode, 0 = no diodes
    int diodeDirection = 0;
    Color darkred, lightgray;
    std::vector<Diode> diodes;
    static const int display7[];
    static const int display16[];
    static const int display14[];

    CHIP_CONSTRUCTORS(SevenSegElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void setDefaults();
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    bool allowBus() override { return diodeDirection == 0; }
    std::string getChipName() override { return std::to_string(segmentCount) + "-segment display"; }
    void setupPins() override;
    void drawSegment(Graphics &g, const Point &p1, const Point &p2, double thick);
    void drawDecimal(Graphics &g, double x, double y, double sp);
    void stamp() override;
    void doStep() override;
    bool nonLinear() override { return diodeDirection != 0; }
    void draw(Graphics &g) override;
    void calculateCurrent() override;
    bool getConnection(int, int) override { return diodeDirection != 0; }
    void stepFinished() override;
    void setColor(Graphics &g, int p);
    int getPostCount() override { return pinCount; }
    int getVoltageSourceCount() override { return 0; }
    int getDumpType() override { return 157; }
    std::string getXmlDumpType() override { return "ssd"; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    void setPinCount();
    bool isDigitalChip() override { return false; }
};
