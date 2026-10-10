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

#include "Point.h"

// coordinates are doubles because text-based bounding boxes can land on half pixels
struct Rectangle {
    double x = 0;
    double y = 0;
    double width = 0;
    double height = 0;

    Rectangle() = default;
    Rectangle(double x_, double y_, double w, double h) : x(x_), y(y_), width(w), height(h) {}
    explicit Rectangle(const Point &pt) : x(pt.x), y(pt.y) {}

    void setBounds(double x_, double y_, double w, double h) { x = x_; y = y_; width = w; height = h; }
    void translate(double dx, double dy) { x += dx; y += dy; }

    bool contains(double X, double Y) const {
        double w = width, h = height;
        if (w < 0 || h < 0)
            return false;
        if (X < x || Y < y)
            return false;
        double w2 = w + x;
        double h2 = h + y;
        return ((w2 < x || w2 > X) && (h2 < y || h2 > Y));
    }

    bool contains(const Rectangle &r) const {
        return contains(r.x, r.y) && contains(r.x + r.width, r.y + r.height);
    }

    bool intersects(const Rectangle &r) const {
        double tw = width, th = height, rw = r.width, rh = r.height;
        if (rw <= 0 || rh <= 0 || tw <= 0 || th <= 0)
            return false;
        double tx = x, ty = y, rx = r.x, ry = r.y;
        rw += rx; rh += ry; tw += tx; th += ty;
        return ((rw < rx || rw > tx) && (rh < ry || rh > ty) &&
                (tw < tx || tw > rx) && (th < ty || th > ry));
    }
};
