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

class BusLogicInputElm : public SwitchElm {
public:
    ELM_CLASS(BusLogicInputElm)
    int busWidth = 4;
    int value = 0;
    double hiV = 5;
    double loV = 0;
    std::vector<VoltageSource *> voltageSources;  // empty until the first setVoltageSource()
    std::vector<double> currents;

    BusLogicInputElm(int xx, int yy) : SwitchElm(xx, yy) {}
    BusLogicInputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : SwitchElm(xa, ya, xb, yb, f, st) {}

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 0; }
    int getPostCount() override { return busWidth; }
    int getNumHandles() override { return 1; }
    int getPostWidth(int n) override { return busWidth; }
    int getVoltageSourceCount() override { return busWidth; }
    Point getPost(int n) override { return Point(x, y, n); }
    void setVoltageSource(int n, VoltageSource *v) override;
    void setCurrent(VoltageSource *vs, double c) override;
    double getCurrentIntoNode(int n) override { return currents.empty() ? 0 : currents[n]; }
    void setPoints() override;
    void draw(Graphics &g) override;
    Rectangle getSwitchRect() override { return Rectangle(x2 - 10, y2 - 10, 20, 20); }
    void toggle() override;
    void stamp() override;
    void calculateCurrent() override {}
    bool hasGroundConnection(int n) override { return true; }
    bool isWireEquivalent() override { return false; }
    bool isRemovableWire() override { return false; }
    std::string getXmlDumpType() override { return "bli"; }
    void getInfo(std::vector<std::string> &arr) override;
    int getShortcut() override { return 0; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
