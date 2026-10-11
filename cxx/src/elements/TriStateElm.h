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

class TriStateElm : public CircuitElm {
public:
    ELM_CLASS(TriStateElm)
    double resistance = 0;
    double r_on;
    double r_off;
    double r_off_ground;
    double highVoltage;
    int busWidth = 1;
    std::vector<VoltageSource *> voltageSources;

    static constexpr int FLAG_FLIP = 1;
    static constexpr int FLAG_FLIP_X = 2;
    static constexpr int FLAG_FLIP_Y = 4;

    bool open = false;
    Point ps, point3, lead3, busLead1;
    Polygon gatePoly;

    TriStateElm(int xx, int yy);
    TriStateElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    std::string dump() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 180; }
    std::string getXmlDumpType() override { return "ts"; }
    void setHighVoltage(double hv) override { highVoltage = hv; }
    void setPoints() override;
    void draw(Graphics &g) override;
    int controlNode() { return 2 * busWidth; }
    int internalNode(int bit) { return 2 * busWidth + 1 + bit; }
    void calculateCurrent() override;
    double getCurrentIntoNode(int n) override;
    bool nonLinear() override { return true; }
    void stamp() override;
    void doStep() override;
    void drag(int xx, int yy) override;
    int getPostCount() override { return 2 * busWidth + 1; }
    int getInternalNodeCount() override { return busWidth; }
    int getVoltageSourceCount() override { return busWidth; }
    void setVoltageSource(int n, VoltageSource *v) override;
    bool getMatrixConnection(int n1, int n2) override;
    Point getPost(int n) override;
    int getPostWidth(int n) override { return n < 2 * busWidth ? busWidth : 1; }
    void getInfo(std::vector<std::string> &arr) override;
    bool getConnection(int n1, int n2) override { return false; }
    bool hasGroundConnection(int n1) override { return n1 >= busWidth && n1 < 2 * busWidth; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int c2, int count) override;
};
