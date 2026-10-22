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

#include <cmath>

#include "GraphicElm.h"

class LineElm : public GraphicElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(LineElm)
    LineElm(int xx, int yy);
    LineElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 423; }
    void drag(int xx, int yy) override { x2 = xx; y2 = yy; }
    bool creationFailed() override { return std::hypot(x - x2, y - y2) < 16; }
    void draw(Graphics &g) override;
    std::optional<EditInfo> getEditInfo(int n) override { return std::nullopt; }
    void setEditValue(int n, EditInfo &ei) override {}
    void getInfo(std::vector<std::string> &arr) override {}
    int getShortcut() override { return 0; }
    double getMouseDistance(int gx, int gy) override;
};
