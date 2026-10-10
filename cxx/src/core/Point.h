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
#include <tuple>

// a post location.  z distinguishes the bits of a bus that share one (x,y) location.
struct Point {
    int x = 0;
    int y = 0;
    int z = 0;

    Point() = default;
    Point(int x_, int y_, int z_ = 0) : x(x_), y(y_), z(z_) {}

    void setLocation(const Point &p) { x = p.x; y = p.y; z = p.z; }
    void move(int dx, int dy) { x += dx; y += dy; }

    bool equals(const Point &o) const { return x == o.x && y == o.y && z == o.z; }
    bool operator==(const Point &o) const { return equals(o); }
    bool operator!=(const Point &o) const { return !equals(o); }
    bool operator<(const Point &o) const { return std::tie(x, y, z) < std::tie(o.x, o.y, o.z); }

    std::string toString() const {
        if (z != 0)
            return "Point(" + std::to_string(x) + "," + std::to_string(y) + "," + std::to_string(z) + ")";
        return "Point(" + std::to_string(x) + "," + std::to_string(y) + ")";
    }
};
