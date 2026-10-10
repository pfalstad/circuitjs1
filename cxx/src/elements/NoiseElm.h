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

class NoiseElm : public RailElm {
public:
    ELM_CLASS(NoiseElm)
    NoiseElm(int xx, int yy) : RailElm(xx, yy, WF_NOISE) {}
    NoiseElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : RailElm(xa, ya, xb, yb, f, st) {
        waveform = WF_NOISE;
    }

    // dump this class as a RailElm.  The 'n' dump type is still used in ElementFactory::createCe to read old files
    std::string getDumpClassName() const override { return "RailElm"; }
    int getShortcut() override { return 0; }
};
