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

    // the smallest rectangle containing both (TS: union())
    Rectangle unite(const Rectangle &r) const {
        double tx2 = width, ty2 = height;
        if (tx2 < 0 || ty2 < 0)
            return r;
        double rx2 = r.width, ry2 = r.height;
        if (rx2 < 0 || ry2 < 0)
            return *this;
        double tx1 = x, ty1 = y;
        tx2 += tx1;
        ty2 += ty1;
        double rx1 = r.x, ry1 = r.y;
        rx2 += rx1;
        ry2 += ry1;
        if (tx1 > rx1) tx1 = rx1;
        if (ty1 > ry1) ty1 = ry1;
        if (tx2 < rx2) tx2 = rx2;
        if (ty2 < ry2) ty2 = ry2;
        return Rectangle(tx1, ty1, tx2 - tx1, ty2 - ty1);
    }
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
