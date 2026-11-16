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

namespace ScopeConstants {
constexpr int VAL_POWER     = 7;
constexpr int VAL_POWER_OLD = 1;
constexpr int VAL_VOLTAGE   = 0;
constexpr int VAL_CURRENT   = 3;
constexpr int VAL_IB        = 1;
constexpr int VAL_IC        = 2;
constexpr int VAL_IE        = 3;
constexpr int VAL_VBE       = 4;
constexpr int VAL_VBC       = 5;
constexpr int VAL_VCE       = 6;
constexpr int VAL_R         = 2;
constexpr int VAL_CHARGE    = 8;
constexpr int UNITS_V       = 0;
constexpr int UNITS_A       = 1;
constexpr int UNITS_W       = 2;
constexpr int UNITS_OHMS    = 3;
constexpr int UNITS_C       = 4;
constexpr int UNITS_COUNT   = 5;
constexpr int V_POSITION_STEPS = 200;
constexpr double MIN_MAN_SCALE = 1e-9;
constexpr double multa[] = {2.0, 2.5, 2.0};
}
