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

class Font {
public:
    static constexpr int BOLD = 1;
    static constexpr int ITALIC = 2;

    std::string family;  // "sans-serif", "monospace", ...
    int style = 0;
    int size = 12;       // pixels

    Font() = default;
    Font(const std::string &name, int style_, int size_)
        : family(name == "SansSerif" ? "sans-serif" : name), style(style_), size(size_) {}
    bool bold() const { return (style & BOLD) != 0; }
    bool italic() const { return (style & ITALIC) != 0; }
};
