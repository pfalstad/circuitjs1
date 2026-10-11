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

#include "CurrentElm.h"

class OhmMeterElm : public CurrentElm {
public:
    ELM_CLASS(OhmMeterElm)
    OhmMeterElm(int xx, int yy) : CurrentElm(xx, yy) {}
    OhmMeterElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CurrentElm(xa, ya, xb, yb, f, st) {}

    int getDumpType() override { return 216; }
    void setPoints() override;
    void draw(Graphics &g) override;
    double getScopeValue(int x) override;
    int getScopeUnits(int x) override;
    bool canShowValueInScope(int x) override;
    void getInfo(std::vector<std::string> &arr) override;
};
