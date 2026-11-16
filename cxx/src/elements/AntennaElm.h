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

#include "RailElm.h"

class AntennaElm : public RailElm {
public:
    ELM_CLASS(AntennaElm)
    double fmphase = 0;

    AntennaElm(int xx, int yy) : RailElm(xx, yy, WF_AC) {}
    AntennaElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : RailElm(xa, ya, xb, yb, f, st) {
        waveform = WF_AC;
    }

    void drawRail(Graphics &g) override { drawRailText(g, "Ant"); }
    double getVoltage() override;
    void stepFinished() override;
    int getDumpType() override { return 'A'; }
    int getShortcut() override { return 0; }
    void getInfo(std::vector<std::string> &arr) override {
        RailElm::getInfo(arr);
        arr[0] = "Antenna (amplified)";
    }
    std::optional<EditInfo> getEditInfo(int n) override { return std::nullopt; }
};
