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

class CustomTransformerElm : public CircuitElm {
public:
    ELM_CLASS(CustomTransformerElm)
    std::vector<double> coilCurrents;
    std::vector<double> coilInductances;
    std::vector<double> coilCurCounts;
    std::vector<double> coilCurSourceValues;
    std::vector<int> coilPolarities;
    std::vector<double> nodeCurrents;
    std::vector<double> nodeCurCounts;
    static constexpr int FLAG_FLIP = 1;
    int flip = 1;

    // node number n of first node of each coil (second node = n+1)
    std::vector<int> coilNodes;

    int coilCount = 0;
    int nodeCount = 0;

    // number of primary coils
    int primaryCoils = 0;

    std::vector<Point> nodePoints, nodeTaps, ptCore;
    std::string description;
    double inductance;
    double couplingCoef;
    bool needDots = false;

    std::vector<Point> dots;  // empty unless needDots
    int width;

    CustomTransformerElm(int xx, int yy);
    CustomTransformerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void drag(int xx, int yy) override;
    int getDumpType() override { return 406; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    bool parseDescription() { return parseDescription(description, nullptr); }
    bool parseDescription(const std::string &desc, EditInfo *ei = nullptr);

private:
    // Split description string on delimiters, keeping the delimiters as tokens
    std::vector<std::string> tokenizeDesc(const std::string &desc);

public:
    bool isTrapezoidal();
    void draw(Graphics &g) override;
    void setPoints() override;
    Point getPost(int n) override { return nodePoints[n]; }
    int getPostCount() override { return nodeCount; }
    void reset() override;

    std::vector<std::vector<double>> xformMatrix;  // empty until stamp()

    void stamp() override;
    void startIteration() override;
    void doStep() override;
    void calculateCurrent() override;
    double getCurrentIntoNode(int n) override { return -nodeCurrents[n]; }
    void getInfo(std::vector<std::string> &arr) override;
    bool getConnection(int n1, int n2) override;
    // VCCS stamps couple all nodes, so they must all be in the same matrix
    bool getMatrixConnection(int n1, int n2) override { return true; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    // vertical not supported
    bool canFlipXY() override { return false; }
};
