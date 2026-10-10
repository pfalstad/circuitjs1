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

// much of this was adapted from Bill Collis's code in TestPointElm.java
class ProbeElm : public CircuitElm {
public:
    ELM_CLASS(ProbeElm)
    static constexpr int FLAG_SHOWVOLTAGE = 1;
    static constexpr int FLAG_CIRCLE = 2;
    static constexpr int TP_VOL = 0;
    static constexpr int TP_RMS = 1;
    static constexpr int TP_MAX = 2;
    static constexpr int TP_MIN = 3;
    static constexpr int TP_P2P = 4;
    static constexpr int TP_BIN = 5;
    static constexpr int TP_FRQ = 6;
    static constexpr int TP_PER = 7;
    static constexpr int TP_PWI = 8;
    static constexpr int TP_DUT = 9;  // mark to space ratio
    static constexpr int TP_AVG = 10;
    static constexpr int circleSize = 12;
    int meter;
    int units = 0;
    int scale;
    double resistance;
    double rmsV = 0;
    double total = 0;
    double count = 0;
    double avgV = 0;
    double totalV = 0;
    double binaryLevel = 0;  // 0 or 1 as double
    double zerocount = 0;
    double maxV = 0;
    double lastMaxV = 0;
    double minV = 0;
    double lastMinV = 0;
    double frequency = 0;
    double period = 0;
    double pulseWidth = 0;
    double dutyCycle = 0;
    int selectedValue = 0;
    bool increasingV = true;
    bool decreasingV = true;
    bool started = false;
    long lastStepCount = 0;
    double periodStart = 0;
    double periodLength = 0;
    double pulseStart = 0;
    Point center;
    // optional name, drawn next to the reading and usable as v(label) in an expression
    std::string label;

    ProbeElm(int xx, int yy);
    ProbeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    int getDumpType() override { return 'p'; }
    bool isProbeElm() override { return true; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    void reset() override;
    std::string getMeter();
    bool mustShowVoltage() { return (flags & FLAG_SHOWVOLTAGE) != 0; }
    bool drawAsCircle() { return (flags & FLAG_CIRCLE) != 0; }
    void draw(Graphics &g) override;
    void stepFinished() override;
    void calculateCurrent() override;
    void stamp() override;
    void getInfo(std::vector<std::string> &arr) override;
    std::string getMeterLine(int m);
    bool getConnection(int, int) override { return resistance != 0; }
    std::optional<EditInfo> getEditInfo(int n) override;
    std::vector<int> meterChoices();
    int meterChoiceIndex(int m);
    void setEditValue(int n, EditInfo &ei) override;
    std::optional<std::string> getExprRefName() override {
        return label.empty() ? std::nullopt : std::optional<std::string>(label);
    }
};
