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

#include "Color.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>

const Color Color::white(255, 255, 255);
const Color Color::lightGray(192, 192, 192);
const Color Color::gray(128, 128, 128);
const Color Color::GRAY(128, 128, 128);
const Color Color::dark_gray(64, 64, 64);
const Color Color::darkGray(64, 64, 64);
const Color Color::black(0, 0, 0);
const Color Color::red(255, 0, 0);
const Color Color::pink(255, 175, 175);
const Color Color::orange(255, 200, 0);
const Color Color::yellow(255, 255, 0);
const Color Color::green(0, 255, 0);
const Color Color::magenta(255, 0, 255);
const Color Color::cyan(0, 255, 255);
const Color Color::blue(0, 0, 255);
const Color Color::NONE(std::string(""));

Color::Color(const Color &c1, const Color &c2, double mix) {
    double m0 = 1 - mix;
    r = (int) std::trunc(c1.r * m0 + c2.r * mix);
    g = (int) std::trunc(c1.g * m0 + c2.g * mix);
    b = (int) std::trunc(c1.b * m0 + c2.b * mix);
}

Color::Color(const std::string &text) : colorText(text) {
    if (text.size() == 7 && text[0] == '#') {
        r = (int) std::strtol(text.substr(1, 2).c_str(), nullptr, 16);
        g = (int) std::strtol(text.substr(3, 2).c_str(), nullptr, 16);
        b = (int) std::strtol(text.substr(5, 2).c_str(), nullptr, 16);
    }
}

std::string Color::getHexValue() const {
    if (colorText)
        return *colorText;
    char buf[8];
    std::snprintf(buf, sizeof(buf), "#%02x%02x%02x", r & 255, g & 255, b & 255);
    return buf;
}
