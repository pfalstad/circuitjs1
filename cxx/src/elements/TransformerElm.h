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

class TransformerElm : public CircuitElm {
public:
    ELM_CLASS(TransformerElm)
    double inductance, ratio, couplingCoef;
    double saturationCurrent = 0;  // 0 = disabled (linear core)
    std::vector<Point> ptEnds, ptCoil, ptCore;
    double currents[2] = {0, 0};
    double curcounts[2] = {0, 0};
    std::vector<Point> dots;  // empty if none
    int width;
    int polarity;
    int flip = 1;
    static constexpr int FLAG_REVERSE = 4;
    static constexpr int FLAG_VERTICAL = 8;
    static constexpr int FLAG_FLIP = 16;

    double a1 = 0, a2 = 0, a3 = 0, a4 = 0;
    double curSourceValue1 = 0, curSourceValue2 = 0;

    TransformerElm(int xx, int yy);
    TransformerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 'T'; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    bool nonLinear() override { return saturationCurrent > 0; }
    bool isTrapezoidal() const;
    void draw(Graphics &g) override;
    void setPoints() override;
    Point getPost(int n) override { return ptEnds[n]; }
    int getPostCount() override { return 4; }
    void reset() override;
    // compute effective inductance with saturation: L(I) = L0 / (1 + (I/Isat)^2)
    double calcEffectiveInductance(double l0, double i, double isat);
    // compute a1-a4 companion model coefficients from effective inductances
    void computeCoefficients(double l1, double l2, double m);
    void stamp() override;
    void startIteration() override;
    void doStep() override;
    void calculateCurrent() override;
    double getCurrentIntoNode(int n) override;
    void getInfo(std::vector<std::string> &arr) override;
    bool getConnection(int n1, int n2) override;
    // VCCS stamps couple all nodes, so they must all be in the same matrix
    bool getMatrixConnection(int, int) override { return true; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    int getShortcut() override { return 'T'; }
    void drag(int xx, int yy) override;
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int xmy, int count) override;
};
