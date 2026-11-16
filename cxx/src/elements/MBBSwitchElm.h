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

#include "SwitchElm.h"

class MBBSwitchElm : public SwitchElm {
public:
    ELM_CLASS(MBBSwitchElm)
    int link = 0;
    VoltageSource *voltSources[2] = {nullptr, nullptr};
    double currents[2] = {0, 0};
    double curcounts[3] = {0, 0, 0};
    bool both = false;

    MBBSwitchElm(int xx, int yy);
    MBBSwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void setup();
    int getDumpType() override { return 416; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;

    std::vector<Point> swposts, swpoles;

    void setPoints() override;
    void draw(Graphics &g) override;
    double getCurrentIntoNode(int n) override;
    Rectangle getSwitchRect() override;
    Point getPost(int n) override { return n == 0 ? point1 : swposts[n - 1]; }
    int getPostCount() override { return 3; }
    void setCurrent(VoltageSource *vs, double c) override;
    void calculateCurrent() override;
    void setVoltageSource(int n, VoltageSource *v) override;
    void stamp() override;
    // connection is implemented by voltage source with voltage = 0.
    // need two for both loads connected, otherwise one.
    int getVoltageSourceCount() override;
    void toggle() override;
    bool getConnection(int n1, int n2) override;
    // do not optimize out, even though isWireEquivalent() is true (because it may have 3 nodes to merge
    // and calcWireClosure() doesn't handle that case)
    bool isRemovableWire() override { return false; }
    bool isWireEquivalent() override { return resistance == 0; }
    std::string getElmType() override { return "switch (SPDT, MBB)"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    bool validate() override;
    int getShortcut() override { return 0; }
};
