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

class OpAmpElm : public CircuitElm {
public:
    ELM_CLASS(OpAmpElm)
    void addRoutingObstacle(WireRouter &wr) override;
    int opsize = 2;
    int opheight = 16;
    int opwidth = 26;
    int opaddtext = 0;
    double maxOut;
    double minOut;
    double gain = 100000;
    double gbw;
    static constexpr int FLAG_SWAP = 1;
    static constexpr int FLAG_SMALL = 2;
    static constexpr int FLAG_LOWGAIN = 4;
    static constexpr int FLAG_GAIN = 8;
    std::vector<Point> in1p, in2p, textp;
    Polygon triangle;
    Font plusFont;
    double lastvd = 0;
    double savedVd = 0;
    bool justLoaded = false;

    OpAmpElm(int xx, int yy);
    OpAmpElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void setGain();
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    bool nonLinear() override { return true; }
    double getPower() override { return nodes[2]->v * current; }
    void setSize(int s);
    void setPoints() override;
    int getPostCount() override { return 3; }
    Point getPost(int n) override;
    int getVoltageSourceCount() override { return 1; }
    void stamp() override;
    void doStep() override;
    // there is no current path through the op-amp inputs, but there
    // is an indirect path through the output to ground.
    bool validate() override { return validateRailNode(2); }
    bool getConnection(int, int) override { return false; }
    bool getMatrixConnection(int, int) override { return true; }
    bool hasGroundConnection(int n1) override { return n1 == 2; }
    double getVoltageDiff() override { return nodes[2]->v - nodes[1]->v; }
    int getDumpType() override { return 'a'; }
    double getCurrentIntoNode(int n) override { return n == 2 ? -current : 0; }
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int xmy, int count) override;
    void draw(Graphics &g) override;
    void getInfo(std::vector<std::string> &arr) override;
    int getShortcut() override { return 'a'; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
