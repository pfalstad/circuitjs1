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

class TappedTransformerElm : public CircuitElm {
public:
    ELM_CLASS(TappedTransformerElm)
    double inductance;
    double ratio;
    double couplingCoef;
    int flip = 1;
    static constexpr int FLAG_FLIP = 1;
    std::vector<Point> ptEnds, ptCoil, ptCore;
    double currents[4] = {0, 0, 0, 0};
    double curcounts[4] = {0, 0, 0, 0};
    double voltdiff[3] = {0, 0, 0};
    double curSourceValue[3] = {0, 0, 0};
    double a[9] = {0, 0, 0, 0, 0, 0, 0, 0, 0};

    TappedTransformerElm(int xx, int yy);
    TappedTransformerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 169; }
    std::string getXmlDumpType() override { return "tt"; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void draw(Graphics &g) override;
    void setPoints() override;
    Point getPost(int n) override { return ptEnds[n]; }
    int getPostCount() override { return 5; }
    void reset() override;
    void stamp() override;
    bool isTrapezoidal();
    void startIteration() override;
    void doStep() override;
    void calculateCurrent() override;
    void getInfo(std::vector<std::string> &arr) override;
    double getCurrentIntoNode(int n) override;
    bool getConnection(int n1, int n2) override;
    // VCCS stamps couple all nodes, so they must all be in the same matrix
    bool getMatrixConnection(int n1, int n2) override { return true; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int c2, int count) override;
};
