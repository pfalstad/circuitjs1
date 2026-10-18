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

class AmmeterElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(AmmeterElm)
    int meter = 0;
    int scale;

    static constexpr int AM_VOL = 0;
    static constexpr int AM_RMS = 1;

    static constexpr int FLAG_SHOWCURRENT = 1;
    static constexpr int FLAG_CIRCLE = 2;

    // optional name, drawn next to the reading and usable as i(label) in an expression
    std::string label;

    int zerocount = 0;
    double rmsI = 0;
    double total = 0;
    double count = 0;
    double maxI = 0;
    double lastMaxI = 0;
    double minI = 0;
    double lastMinI = 0;
    double selectedValue = 0;

    bool increasingI = true;
    bool decreasingI = true;

    AmmeterElm(int xx, int yy);
    AmmeterElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    std::string getMeter();

    Point center, mid;
    Polygon arrowPoly;

    void setPoints() override;
    void stepFinished() override;
    static constexpr int circleSize = 12;
    void draw(Graphics &g) override;
    int getDumpType() override { return 370; }
    void setVoltageSource(int n, VoltageSource *v) override;
    void stamp() override;
    bool mustShowCurrent() { return (flags & FLAG_SHOWCURRENT) != 0; }
    int getVoltageSourceCount() override { return 1; }
    void getInfo(std::vector<std::string> &arr) override;
    double getPower() override { return 0; }
    double getVoltageDiff() override { return nodes[0]->v; }
    // do not optimize out, even though isWireEquivalent() is true
    // (because we need current calculated every timestep)
    bool isWireEquivalent() override { return true; }
    bool drawAsCircle() { return (flags & FLAG_CIRCLE) != 0; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    std::optional<std::string> getExprRefName() override {
        return label.empty() ? std::nullopt : std::optional<std::string>(label);
    }
};
