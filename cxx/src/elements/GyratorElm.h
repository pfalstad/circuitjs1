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

#include "../core/CircuitElm.h"

class GyratorElm : public CircuitElm {
public:
    ELM_CLASS(GyratorElm)
    double gyrResistance;
    std::vector<Point> ptEnds, ptStub;
    Point boxTL, boxTR, boxBL, boxBR;
    Point arrowTail, arrowHead;
    Polygon arrowPoly;
    double currents[2];
    double curcounts[2];
    int width;
    int flip = 1;

    static constexpr int FLAG_VERTICAL = 8;
    static constexpr int FLAG_FLIP = 16;

    GyratorElm(int xx, int yy);

    void drag(int xx, int yy) override;
    // Wikipedia gyrator symbol: rectangular box with the Greek letter pi
    // (denoting the 180-degree phase shift in the gyration direction)
    // and an arrow showing the gyration direction.
    void draw(Graphics &g) override;
    void setPoints() override;
    Point getPost(int n) override { return ptEnds[n]; }
    int getPostCount() override { return 4; }
    void reset() override;
    void stamp() override;
    void calculateCurrent() override;
    double getCurrent() override { return currents[0]; }  // for scope
    double getCurrentIntoNode(int n) override;
    // VCCS stamps couple all nodes, so they must all be in the same matrix
    bool getMatrixConnection(int n1, int n2) override { return true; }
    bool getConnection(int n1, int n2) override;
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int xmy, int count) override;
};
