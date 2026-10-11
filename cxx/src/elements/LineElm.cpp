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

#include "LineElm.h"

#include "../core/Graphics.h"

LineElm::LineElm(int xx, int yy) : GraphicElm(xx, yy) {
    x2 = xx;
    y2 = yy;
    setBbox(x, y, x2, y2);
}

LineElm::LineElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : GraphicElm(xa, ya, xb, yb, f) {
    x2 = xb;
    y2 = yb;
    setBbox(x, y, x2, y2);
}

void LineElm::draw(Graphics &g) {
    //g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    g.setColor(needsHighlight() ? selectColor : Color::GRAY);
    setBbox(x, y, x2, y2);
    g.drawLine(x, y, x2, y2);
}

double LineElm::getMouseDistance(int gx, int gy) {
    const int thresh = 10;
    double d2 = lineDistanceSq(x, y, x2, y2, gx, gy);
    if (d2 <= thresh * thresh)
        return d2;
    return -1;
}
