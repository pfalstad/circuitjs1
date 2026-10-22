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

class TriacElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(TriacElm)
    static constexpr int mt1node = 1;
    static constexpr int mt2node = 0;
    static constexpr int gnode = 2;
    static constexpr int mtinode = 3;

    Diode diode03;
    Diode diode30;
    bool state = false;

    double i1 = 0;
    double i2 = 0;
    double ig = 0;
    double curcount_1 = 0;
    double curcount_2 = 0;
    double curcount_g = 0;
    double cresistance = 0;
    double triggerI = 0;
    double holdingI = 0;
    double aresistance = 0;

    TriacElm(int xx, int yy);
    TriacElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void setDefaults();
    void setup();
    bool nonLinear() override { return true; }
    void reset() override;
    int getDumpType() override { return 206; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;

    static constexpr int hs = 8;
    std::vector<Polygon> arrows;
    std::vector<Point> plate1, plate2, gate;

    void setPoints() override;
    void draw(Graphics &g) override;
    Point getPost(int n) override { return (n == 0) ? point1 : (n == 1) ? point2 : gate[1]; }
    double getCurrentIntoNode(int n) override;
    int getPostCount() override { return 3; }
    int getInternalNodeCount() override { return 1; }
    void stamp() override;
    void startIteration() override;
    void doStep() override;
    void getInfo(std::vector<std::string> &arr) override;
    void calculateCurrent() override;
    double getPower() override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    bool canViewInScope() override { return true; }
    double getVoltageDiff() override { return nodes[mt2node]->v - nodes[mt1node]->v; }
    double getCurrent() override { return i2; }
};
