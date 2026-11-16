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
#include "Diode.h"

class SCRElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(SCRElm)
    static constexpr int anode = 0;
    static constexpr int cnode = 1;
    static constexpr int gnode = 2;
    static constexpr int inode = 3;
    static constexpr int FLAG_GATE_FIX = 1;
    Diode diode;
    int dir = 0;

    SCRElm(int xx, int yy);
    SCRElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void setDefaults();
    void setup();
    bool nonLinear() override { return true; }
    void reset() override;
    int getDumpType() override { return 177; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;

    double ia = 0;
    double ic = 0;
    double ig = 0;
    double curcount_a = 0;
    double curcount_c = 0;
    double curcount_g = 0;
    double lastvac = 0;
    double lastvag = 0;
    double gresistance;
    double triggerI;
    double holdingI;

    static constexpr int hs = 8;
    Polygon poly;
    std::vector<Point> cathode;
    std::vector<Point> gate;

    bool applyGateFix() { return (flags & FLAG_GATE_FIX) != 0; }
    void setPoints() override;
    void draw(Graphics &g) override;
    double getCurrentIntoNode(int n) override;
    Point getPost(int n) override { return (n == 0) ? point1 : (n == 1) ? point2 : gate[1]; }
    int getPostCount() override { return 3; }
    int getInternalNodeCount() override { return 1; }
    double getPower() override;

    double aresistance;

    void stamp() override;
    void doStep() override;
    void getInfo(std::vector<std::string> &arr) override;
    void calculateCurrent() override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void fixEnds();
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int c2, int count) override;
};
