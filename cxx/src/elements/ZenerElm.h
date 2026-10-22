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

#include "DiodeElm.h"

// Zener code contributed by J. Mike Rollins
// http://www.camotruck.net/rollins/simulator.html
class ZenerElm : public DiodeElm {
public:
    bool showPropertiesOnCreate() override { return true; }
    ELM_CLASS(ZenerElm)
    static std::string lastZenerModelName;
    std::vector<Point> wing;
    static constexpr double default_zvoltage = 5.6;

    ZenerElm(int xx, int yy);
    ZenerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 'z'; }
    void setPoints() override;
    void draw(Graphics &g) override;
    std::string getElmType() override { return "Zener diode"; }
    void getInfo(std::vector<std::string> &arr) override;
    bool isZenerElm() override { return true; }
    int getShortcut() override { return 'z'; }
    void setLastModelName(const std::string &n) override { lastZenerModelName = n; }
};
