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

class WattmeterElm : public CircuitElm {
public:
    ELM_CLASS(WattmeterElm)
    int width = 0;
    VoltageSource *voltSources[2] = {nullptr, nullptr};
    double currents[2] = {0, 0};
    double curcounts[2] = {0, 0};
    int meter = 0;
    static constexpr int PM_INST = 0;
    static constexpr int PM_AVG = 1;
    double avgPower = 0;
    double totalEnergy = 0;
    double cycleTime = 0;
    double lastCycleTime = 0;
    double runEnergy = 0;
    double runTime = 0;
    double zeroTime = 0;
    double peak = 0;
    double trough = 0;
    bool wasAboveMid = false;
    bool haveFullCycle = false;

    std::vector<Point> posts, inner;
    std::vector<int> rectPointsX, rectPointsY;
    Point center;
    int maxTextLen = 0;

    WattmeterElm(int xx, int yy);
    WattmeterElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void setup();
    std::string dump() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getVoltageSourceCount() override { return 2; }
    int getDumpType() override { return 420; }
    int getPostCount() override { return 4; }
    void drag(int xx, int yy) override;
    void setPoints() override;
    Point getPost(int n) override { return posts[n]; }
    void stamp() override;
    void setVoltageSource(int j, VoltageSource *vs) override;
    void stepFinished() override;
    void draw(Graphics &g) override;
    double getPower() override { return getVoltageDiff() * getCurrent(); }
    void setCurrent(VoltageSource *vs, double c) override { currents[vs == voltSources[0] ? 0 : 1] = c; }
    double getCurrentIntoNode(int n) override { return n % 2 == 0 ? -currents[n / 2] : currents[n / 2]; }
    bool getConnection(int n1, int n2) override { return n1 / 2 == n2 / 2; }
    bool hasGroundConnection(int n1) override { return false; }
    void getInfo(std::vector<std::string> &arr) override;
    bool canViewInScope() override { return true; }
    double getCurrent() override { return currents[1]; }
    double getVoltageDiff() override { return nodes[2]->v - nodes[0]->v; }
    bool canFlipX() override { return false; }
    bool canFlipY() override { return false; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
