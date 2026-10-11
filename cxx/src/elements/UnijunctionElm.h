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

#include "CompositeElm.h"

class UnijunctionElm : public CompositeElm {
public:
    ELM_CLASS(UnijunctionElm)
    // node 0 = E
    // node 1 = B1
    // node 2 = B2
    static constexpr int FLAG_FLIP = 2;

    UnijunctionElm(int xx, int yy) : CompositeElm(xx, yy) { setup(); }
    UnijunctionElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &) : CompositeElm(xa, ya, xb, yb, f) { setup(); }

    void setup();
    void reset() override;
    int getDumpType() override { return 417; }
    void draw(Graphics &g) override;
    void setPoints() override;
    Point getPost(int n) override { return (n == 0) ? emitter[0] : (n == 1) ? b1[0] : b2[0]; }
    int getPostCount() override { return 3; }
    void getInfo(std::vector<std::string> &arr) override;
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int xmy, int count) override;

private:
    std::vector<Point> b1, b2, emitter;
    Polygon emitterPoly, arrowPoly;
    double curcountb1 = 0, curcountb2 = 0, curcounte = 0;
    static constexpr int hs = 16;
};
