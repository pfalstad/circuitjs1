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

// Shared constants used by Scope and ScopePlot to avoid circular imports.
// also bit positions 25, 26, 27 should not be used because they might be set by old trigger mode code

export const VAL_POWER     = 7;
export const VAL_POWER_OLD = 1;
export const VAL_VOLTAGE   = 0;
export const VAL_CURRENT   = 3;
export const VAL_IB        = 1;
export const VAL_IC        = 2;
export const VAL_IE        = 3;
export const VAL_VBE       = 4;
export const VAL_VBC       = 5;
export const VAL_VCE       = 6;
export const VAL_R         = 2;
export const VAL_CHARGE    = 8;
export const UNITS_V       = 0;
export const UNITS_A       = 1;
export const UNITS_W       = 2;
export const UNITS_OHMS    = 3;
export const UNITS_C       = 4;
export const UNITS_COUNT   = 5;
export const V_POSITION_STEPS = 200;
export const MIN_MAN_SCALE    = 1e-9;
export const multa: number[] = [2.0, 2.5, 2.0];
