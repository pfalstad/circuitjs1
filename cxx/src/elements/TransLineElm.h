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

class TransLineElm : public CircuitElm {
public:
    ELM_CLASS(TransLineElm)
    double delay, imped;
    // the delay lines (TS: null when the delay is too long, here buffersOk is false)
    std::vector<double> voltageL, voltageR;
    bool buffersOk = false;
    int lenSteps = 0;
    int ptr = 0;
    int width = 0;
    long lastStepCount = 0;

    std::vector<Point> posts, inner;

    VoltageSource *voltSource1 = nullptr;
    VoltageSource *voltSource2 = nullptr;
    double current1 = 0, current2 = 0;
    double curCount1 = 0, curCount2 = 0;

    TransLineElm(int xx, int yy);
    TransLineElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 171; }
    int getPostCount() override { return 4; }
    int getInternalNodeCount() override { return 2; }
    std::string getXmlDumpType() override { return "tl"; }
    std::string dump() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void drag(int xx, int yy) override;
    void reset() override;
    void setPoints() override;
    void draw(Graphics &g) override;
    void setVoltageSource(int n, VoltageSource *v) override;
    void setCurrent(VoltageSource *vs, double c) override;
    void stamp() override;
    void startIteration() override;
    void doStep() override;
    void stepFinished() override;
    Point getPost(int n) override { return posts[n]; }
    int getVoltageSourceCount() override { return 2; }
    bool hasGroundConnection(int) override { return false; }
    bool getConnection(int, int) override { return false; }
    // odd nodes == right side, even nodes == left side
    bool getMatrixConnection(int n1, int n2) override { return (n1 % 2) == (n2 % 2); }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    double getCurrentIntoNode(int n) override;
    bool canFlipX() override { return dy == 0; }
    bool canFlipY() override { return dx == 0; }
};
