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

#include <string>

// the GWT/Java NumberFormat patterns the TS version uses: "####.###" (optional digits),
// "####.000" (fixed digits), and "#.##E000" (scientific)
class NumberFormat {
public:
    static NumberFormat getFormat(const std::string &pattern) { return NumberFormat(pattern); }
    std::string format(double v) const;

private:
    explicit NumberFormat(std::string p) : pattern(std::move(p)) {}
    std::string pattern;
};

// JS Number.prototype.toFixed()
std::string jsToFixed(double v, int digits);

// JS Number.prototype.toPrecision()
std::string jsToPrecision(double v, int precision);
