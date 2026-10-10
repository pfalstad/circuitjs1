/*
    Copyright (C) Paul Falstad

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

#include <string>

// Number parsing and printing with JavaScript semantics, so circuit files read and
// write exactly the same as the TypeScript version.

// JS parseFloat(): leading whitespace, then the longest valid decimal prefix; NaN if none
double jsParseFloat(const std::string &s);

// JS parseInt(s, radix).  With no radix (0): decimal, or hex with a 0x prefix.  Radix 16
// also allows a 0x prefix.  NaN if no digits.
double jsParseInt(const std::string &s, int radix = 0);

// JS String(number), e.g. "0.000015", "1e-7", "1000000"
std::string jsNumberToString(double d);

// parseIntStrict()/parseFloatStrict(): throw std::runtime_error on NaN
int parseIntStrict(const std::string &s, int radix = 0);
double parseFloatStrict(const std::string &s);
