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

class CrossSwitchElm : public SwitchElm {
public:
    ELM_CLASS(CrossSwitchElm)
    static constexpr int poleCount = 2;
    std::vector<Point> poleLeads, throwLeads, polePosts, throwPosts, linePoints, crossPoints;
    VoltageSource *voltageSources[2] = {nullptr, nullptr};
    double currents[2] = {0, 0};
    double curcounts[2] = {0, 0};

    CrossSwitchElm(int xx, int yy, bool mm = false);
    CrossSwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 430; }
    void setPoints() override;
    void draw(Graphics &g) override;
    double getCurrentIntoNode(int n) override;
    void setCurrent(VoltageSource *vs, double c) override;
    Rectangle getSwitchRect() override;
    Point getPost(int n) override;
    int getPostCount() override { return 2 * poleCount; }
    void calculateCurrent() override;
    void setVoltageSource(int j, VoltageSource *vs) override;
    void stamp() override;
    int getVoltageSourceCount() override { return resistance > 0 ? 0 : poleCount; }
    bool getConnection(int n1, int n2) override;
    bool isWireEquivalent() override { return resistance == 0; }
    // optimizing out this element is too complicated to be worth it (see #646)
    bool isRemovableWire() override { return false; }
    std::string getElmType() override { return "cross switch"; }
    void getInfo(std::vector<std::string> &arr) override;
    bool validate() override;
    int getShortcut() override { return 0; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
