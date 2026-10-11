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

class ThreePhaseMotorElm : public CircuitElm {
public:
    ELM_CLASS(ThreePhaseMotorElm)
    double Rs, Rr, Ls, Lr, Lm;
    double b;
    double angle = pi / 2;
    double speed = 0;
    double filteredSpeed = 0;
    std::vector<double> coilCurrents;
    std::vector<double> coilCurSourceValues;
    std::vector<std::vector<double>> xformMatrix;  // empty until stamp()
    std::vector<double> nodeCurrents;
    VoltageSource *voltSources[2] = {nullptr, nullptr};
    double J;
    std::vector<Point> posts, leads;
    double curcounts[3] = {0, 0, 0};
    Point motorCenter;

    static constexpr int n001_ind = 6;
    static constexpr int n002_ind = 7;
    static constexpr int n003_ind = 8;
    static constexpr int n004_ind = 9;
    static constexpr int n005_ind = 10;
    static constexpr int n006_ind = 11;
    static constexpr int n007_ind = 12;
    static constexpr int Zp = 2;
    static constexpr int coilCount = 5;
    static constexpr int coilNodes[10] = {6, 1, 8, 3, 10, 5, 7, 9, 11, 12};

    ThreePhaseMotorElm(int xx, int yy);
    ThreePhaseMotorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 427; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    double getAngle() { return angle; }
    void setPoints() override;
    int getPostCount() override { return 6; }
    Point getPost(int n) override { return posts[n]; }
    int getInternalNodeCount() override { return 7; }
    int getVoltageSourceCount() override { return 2; }
    void reset() override;
    void stamp() override;
    void setVoltageSource(int n, VoltageSource *v) override;

    double vs1value = 0;
    double vs2value = 0;

    void startIteration() override;
    void doStep() override;
    void calculateCurrent() override;
    bool hasGroundConnection(int n1) override { return false; }
    bool getConnection(int n1, int n2) override { return true; }

    static constexpr int cr = 37;

    void draw(Graphics &g) override;
    static void drawThickerLine(Graphics &g, const Point &pa, const Point &pb);
    void interpPointFix(const Point &a, const Point &b, Point &c, double f, double gg);
    void getInfo(std::vector<std::string> &arr) override;
    double getCurrentIntoNode(int n) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    bool canFlipX() override { return false; }
    bool canFlipY() override { return false; }
};
