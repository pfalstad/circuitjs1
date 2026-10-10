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

#include <cmath>

#include "VoltageElm.h"

class DCVoltageElm : public VoltageElm {
public:
    ELM_CLASS(DCVoltageElm)
    DCVoltageElm(int xx, int yy) : VoltageElm(xx, yy, WF_DC) {}
    std::string getDumpClassName() const override { return "VoltageElm"; }
    int getShortcut() override { return 'v'; }
};

class ACVoltageElm : public VoltageElm {
public:
    ELM_CLASS(ACVoltageElm)
    ACVoltageElm(int xx, int yy) : VoltageElm(xx, yy, WF_AC) { maxVoltage = 120 * std::sqrt(2); }
    std::string getDumpClassName() const override { return "VoltageElm"; }
};
