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

#include "BoxElm.h"

#include <cstdlib>

#include "../core/Graphics.h"

BoxElm::BoxElm(int xx, int yy) : GraphicElm(xx, yy) {
    x2 = xx;
    y2 = yy;
    setBbox(x, y, x2, y2);
}

BoxElm::BoxElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : GraphicElm(xa, ya, xb, yb, f) {
    x2 = xb;
    y2 = yb;
    setBbox(x, y, x2, y2);
}

void BoxElm::draw(Graphics &g) {
    //g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    g.setColor(needsHighlight() ? selectColor : Color::GRAY);
    setBbox(x, y, x2, y2);
    g.setLineDash(16, 6);
    if (x < x2 && y < y2)
        g.drawRect(x, y, x2 - x, y2 - y);
    else if (x > x2 && y < y2)
        g.drawRect(x2, y, x - x2, y2 - y);
    else if (x < x2 && y > y2)
        g.drawRect(x, y2, x2 - x, y - y2);
    else
        g.drawRect(x2, y2, x - x2, y - y2);
    g.setLineDash(0, 0);
}

double BoxElm::getMouseDistance(int gx, int gy) {
    const int thresh = 10;
    int dx1 = std::abs(gx - x);
    int dy1 = std::abs(gy - y);
    int dx2 = std::abs(gx - x2);
    int dy2 = std::abs(gy - y2);
    if (std::abs(dx1) < thresh)
        return dx1 * dx1;
    if (std::abs(dx2) < thresh)
        return dx2 * dx2;
    if (std::abs(dy1) < thresh)
        return dy1 * dy1;
    if (std::abs(dy2) < thresh)
        return dy2 * dy2;
    return -1;
}

void BoxElm::selectRect(const Rectangle &r, bool add) {
    if (r.contains(boundingBox))
        selected = true;
    else if (!add)
        selected = false;
}
