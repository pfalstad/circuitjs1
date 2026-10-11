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

class TriodeElm : public CircuitElm {
public:
    ELM_CLASS(TriodeElm)
    static constexpr int FLAG_FLIP = 1;
    static constexpr int FLAG_DSIGN_FIX = 2;

    double mu;
    double kg1;
    double curcountp = 0;
    double curcountc = 0;
    double curcountg = 0;
    double currentp = 0;
    double currentg = 0;
    double currentc = 0;
    static constexpr double gridCurrentR = 6000;

    TriodeElm(int xx, int yy);
    TriodeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void setup() { noDiagonal = true; }
    bool nonLinear() override { return true; }
    void reset() override { curcount = 0; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 173; }

    std::vector<Point> plate, grid, cath;
    Point midgrid, midcath;
    double circler = 0;

    void setPoints() override;
    void draw(Graphics &g) override;
    double getCurrentIntoNode(int n) override;
    Point getPost(int n) override { return (n == 0) ? plate[0] : (n == 1) ? grid[0] : cath[0]; }
    int getPostCount() override { return 3; }
    double getPower() override;
    double getCurrent() override { return currentc; }

    static constexpr int gridN = 1;
    static constexpr int cathN = 2;
    static constexpr int plateN = 0;

    double lastv0 = 0;
    double lastv1 = 0;
    double lastv2 = 0;

    void doStep() override;
    void stamp() override;
    void getInfo(std::vector<std::string> &arr) override;
    // grid not connected to other terminals
    bool getConnection(int n1, int n2) override { return !(n1 == 1 || n2 == 1); }
    bool getMatrixConnection(int n1, int n2) override { return true; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    bool canViewInScope() override { return true; }
    double getVoltageDiff() override { return nodes[plateN]->v - nodes[cathN]->v; }
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int xmy, int count) override;
};
