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

#include "GraphicElm.h"

class BoxElm : public GraphicElm {
public:
    ELM_CLASS(BoxElm)
    BoxElm(int xx, int yy);
    BoxElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 'b'; }
    void drag(int xx, int yy) override { x2 = xx; y2 = yy; }
    bool creationFailed() override { return std::abs(x2 - x) < 32 || std::abs(y2 - y) < 32; }
    void draw(Graphics &g) override;
    std::optional<EditInfo> getEditInfo(int n) override { return std::nullopt; }
    void setEditValue(int n, EditInfo &ei) override {}
    void getInfo(std::vector<std::string> &arr) override {}
    int getShortcut() override { return 0; }
    double getMouseDistance(int gx, int gy) override;
    void selectRect(const Rectangle &r, bool add) override;
};
