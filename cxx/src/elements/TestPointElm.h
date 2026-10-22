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

#include "../core/CircuitElm.h"

class TestPointElm : public CircuitElm {
public:
    ELM_CLASS(TestPointElm)
    int meter;

    static constexpr int TP_VOL = 0;
    static constexpr int TP_RMS = 1;
    static constexpr int TP_MAX = 2;
    static constexpr int TP_MIN = 3;
    static constexpr int TP_P2P = 4;
    static constexpr int TP_BIN = 5;
    static constexpr int TP_FRQ = 6;
    static constexpr int TP_PER = 7;
    static constexpr int TP_PWI = 8;
    static constexpr int TP_DUT = 9;
    static constexpr int TP_AVG = 10;
    static constexpr int FLAG_LABEL = 1;

    int zerocount = 0;
    double rmsV = 0;
    double total = 0;
    double count = 0;
    double avgV = 0;
    double totalV = 0;
    double maxV = 0;
    double lastMaxV = 0;
    double minV = 0;
    double lastMinV = 0;
    double frequency = 0;
    double period = 0;
    int binaryLevel = 0;
    double pulseWidth = 0;
    double dutyCycle = 0;
    double selectedValue = 0;
    long lastStepCount = 0;
    bool started = false;

    bool increasingV = true;
    bool decreasingV = true;
    double periodStart = 0;
    double periodLength = 0;
    double pulseStart = 0;
    std::string label;

    TestPointElm(int xx, int yy);
    TestPointElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void reset() override;
    int getDumpType() override { return 368; }
    int getPostCount() override { return 1; }
    void setPoints() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    std::string getMeter();
    void drawText(Graphics &g, const std::string &str, const std::string &str2, const Point &pt1, const Point &pt2);
    void draw(Graphics &g) override;
    void stepFinished() override;
    double getScopeValue(int x) override { return selectedValue; }
    double getVoltageDiff() override { return nodes[0]->v; }
    void getInfo(std::vector<std::string> &arr) override;
    std::string getMeterLine(int m);
    std::optional<EditInfo> getEditInfo(int n) override;
    std::vector<int> meterChoices();
    int meterChoiceIndex(int m);
    void setEditValue(int n, EditInfo &ei) override;
    bool isTestPointElm() override { return true; }
};
