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

#include "VoltageElm.h"

class RailElm : public VoltageElm {
public:
    ELM_CLASS(RailElm)
    static constexpr int FLAG_CLOCK = 1;

    RailElm(int xx, int yy, int wf = WF_DC) : VoltageElm(xx, yy, wf) {}
    RailElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : VoltageElm(xa, ya, xb, yb, f, st) {}

    bool isRailElm() override { return true; }
    // unlike other VoltageElm subclasses, RailElm can be placed either horizontally or
    // vertically via toolbar drag-and-drop, so this undoes VoltageElm's forced-vertical override
    bool getDragVertical(bool requestedVertical) override { return requestedVertical; }
    int getDumpType() override { return 'R'; }
    int getPostCount() override { return 1; }
    void setPoints() override;
    double getVoltageDiff() override { return nodes[0]->v; }
    void setVoltageSource(int n, VoltageSource *v) override;
    void stamp() override;
    void doStep() override;
    bool hasGroundConnection(int) override { return true; }
    int getShortcut() override { return 'V'; }
    bool validateRailNode(int n);
    bool validate() override { return internalResistance > 0 || validateRailNode(0); }
    virtual std::optional<std::string> getRailText() { return std::nullopt; }
    void draw(Graphics &g) override;
    virtual void drawRail(Graphics &g);
    void drawRailText(Graphics &g, const std::string &s);
};
