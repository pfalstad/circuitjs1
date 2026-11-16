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

#include <optional>
#include <string>

class Color {
public:
    static const Color white, lightGray, gray, GRAY, dark_gray, darkGray, black, red, pink,
        orange, yellow, green, magenta, cyan, blue, NONE;

    Color() = default;
    Color(int r_, int g_, int b_) : r(r_), g(g_), b(b_) {}
    // mix: 0 = c1, 1 = c2
    Color(const Color &c1, const Color &c2, double mix);
    // "#rrggbb", or any CSS color string (kept as text for the UI layer)
    explicit Color(const std::string &colorText);

    int getRed() const { return r; }
    int getGreen() const { return g; }
    int getBlue() const { return b; }
    bool hasText() const { return colorText.has_value(); }
    const std::optional<std::string> &text() const { return colorText; }
    std::string getHexValue() const;
    bool operator==(const Color &o) const {
        return r == o.r && g == o.g && b == o.b && colorText == o.colorText;
    }

private:
    int r = 0, g = 0, b = 0;
    std::optional<std::string> colorText;
};
