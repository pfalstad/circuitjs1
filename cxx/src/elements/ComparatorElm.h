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

#include "../core/Font.h"
#include "CompositeElm.h"

class ComparatorElm : public CompositeElm {
public:
    ELM_CLASS(ComparatorElm)
    static constexpr int FLAG_SMALL = 2;
    static constexpr int FLAG_SWAP = 4;
    int opsize = 0, opheight = 0, opwidth = 0;

    ComparatorElm(int xx, int yy);
    ComparatorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 401; }
    void setSize(int s);
    bool getConnection(int, int) override { return false; }
    void draw(Graphics &g) override;
    void setPoints() override;
    void getInfo(std::vector<std::string> &arr) override;
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int xmy, int count) override;

private:
    std::vector<Point> in1p, in2p, textp;
    Polygon triangle;
    Font plusFont;
};
