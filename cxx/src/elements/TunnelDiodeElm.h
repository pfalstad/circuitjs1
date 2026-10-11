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

class TunnelDiodeElm : public CircuitElm {
public:
    ELM_CLASS(TunnelDiodeElm)
    static constexpr int hs = 8;
    Polygon poly;
    std::vector<Point> cathode;
    double lastvoltdiff = 0;

    TunnelDiodeElm(int xx, int yy) : CircuitElm(xx, yy) { setup(); }
    TunnelDiodeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CircuitElm(xa, ya, xb, yb, f) { setup(); }

    bool nonLinear() override { return true; }
    void setup() {}
    int getDumpType() override { return 175; }
    void setPoints() override;
    void draw(Graphics &g) override;
    void reset() override { lastvoltdiff = curcount = 0; }
    double limitStep(double vnew, double vold);
    void stamp() override;

    static constexpr double pvp = .1;
    static constexpr double pip = 4.7e-3;
    static constexpr double pvv = .37;
    static constexpr double pvt = .026;
    static constexpr double pvpp = .525;
    static constexpr double piv = 370e-6;

    void doStep() override;
    void calculateCurrent() override;
    void getInfo(std::vector<std::string> &arr) override;
};
