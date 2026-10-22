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

#include "AnalogSwitchElm.h"

class AnalogSwitch2Elm : public AnalogSwitchElm {
public:
    ELM_CLASS(AnalogSwitch2Elm)
    std::vector<Point> swposts, swpoles, labelPts;
    Point ctlPoint;

    AnalogSwitch2Elm(int xx, int yy) : AnalogSwitchElm(xx, yy) {}
    AnalogSwitch2Elm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
        : AnalogSwitchElm(xa, ya, xb, yb, f, st) {}

    void setPoints() override;
    int getPostCount() override { return 4; }
    void draw(Graphics &g) override;
    Point getPost(int n) override;
    int getDumpType() override { return 160; }
    std::string getXmlDumpType() override { return "as2"; }
    void calculateCurrent() override;
    void stamp() override;
    void doStep() override;
    // we have to just assume current will flow either way (regardless of
    // switch position), since getConnection() is used to determine the
    // matrix closures, and that can't depend on "open," which changes
    // every step -- see comment in AnalogSwitchElm.getConnection()
    bool getConnection(int n1, int n2) override { return n1 != 3 && n2 != 3; }
    bool hasGroundConnection(int n) override { return needsPulldown() && (n == 1 || n == 2); }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    double getCurrentIntoNode(int n) override;
};
