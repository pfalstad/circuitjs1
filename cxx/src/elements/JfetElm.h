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

#include "MosfetElm.h"

class JfetElm : public MosfetElm {
public:
    ELM_CLASS(JfetElm)
    Diode diode{sim};
    double gateCurrent = 0;
    Polygon gatePoly;
    Point gatePt;
    double curcountg = 0;
    double curcounts = 0;
    double curcountd = 0;
    static std::string lastJfetModelName;

    JfetElm(int xx, int yy, bool pnpflag = false);
    JfetElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    void reset() override;
    void draw(Graphics &g) override;
    double getCurrentIntoNode(int n) override;
    void setPoints() override;
    void stamp() override;
    void doStep() override;
    void calculateCurrent() override;
    bool showBulk() override { return false; }
    bool isJfet() override { return true; }
    bool hasSwapDS() override { return true; }
    std::string getLastModelName() override { return lastJfetModelName; }
    void setLastModelName(const std::string &n) override { lastJfetModelName = n; }
    int getDumpType() override { return 'j'; }
    bool isJfetElm() override { return true; }
    // these values are taken from Hayes+Horowitz p155
    double getDefaultThreshold() override { return -4; }
    double getBackwardCompatibilityBeta() override { return .00125; }
    std::string getElmType() override { return "JFET"; }
    void getInfo(std::vector<std::string> &arr) override { getFetInfo(arr, "JFET"); }
    std::optional<EditInfo> getEditInfo(int n) override;
    bool getConnection(int, int) override { return true; }
    std::string getScopeText(int v) override;
};

class NJfetElm : public JfetElm {
public:
    ELM_CLASS(NJfetElm)
    NJfetElm(int xx, int yy) : JfetElm(xx, yy, false) {}
    std::string getDumpClassName() const override { return "JfetElm"; }
};

class PJfetElm : public JfetElm {
public:
    ELM_CLASS(PJfetElm)
    PJfetElm(int xx, int yy) : JfetElm(xx, yy, true) {}
    PJfetElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : JfetElm(xa, ya, xb, yb, f, st) {}
    std::string getDumpClassName() const override { return "JfetElm"; }
};
