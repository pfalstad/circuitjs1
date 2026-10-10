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

class WireElm : public CircuitElm {
public:
    ELM_CLASS(WireElm)
    int busWidth = 1;
    std::vector<double> currents;  // per-bit currents for bus wires (empty otherwise)

    static constexpr int FLAG_SHOWCURRENT = 1;
    static constexpr int FLAG_SHOWVOLTAGE = 2;
    static constexpr int FLAG_SHOW_BUS_VALUE = 4;
    static constexpr int FLAG_SHOW_BUS_VALUE_HEX = 8;

    WireElm(int xx, int yy) : CircuitElm(xx, yy) {}
    WireElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &)
        : CircuitElm(xa, ya, xb, yb, f) {}

    int getPostCount() override { return busWidth * 2; }
    int getBusWidth() override { return busWidth; }
    Point getPost(int n) override;
    int getPostWidth(int) override { return busWidth; }
    bool getConnection(int n1, int n2) override;
    std::optional<Point> getConnectedPost(int n) override;
    int getBusValue();

    bool mustShowCurrent() const { return (flags & FLAG_SHOWCURRENT) != 0; }
    bool mustShowVoltage() const { return (flags & FLAG_SHOWVOLTAGE) != 0; }
    bool mustShowBusValue() const { return (flags & FLAG_SHOW_BUS_VALUE) != 0; }
    bool mustShowBusValueHex() const { return (flags & FLAG_SHOW_BUS_VALUE_HEX) != 0; }

    int getDumpType() override { return 'w'; }
    double getPower() override { return 0; }
    double getVoltageDiff() override { return nodes[0]->v; }
    bool isWireEquivalent() override { return true; }
    bool isRemovableWire() override { return true; }
    bool isWireElm() override { return true; }
    bool showPropertiesOnCreate() override { return false; }
    void setWireCurrent(int bit, double c) override;
    double getCurrentIntoNode(int n) override;
    int getShortcut() override { return 'w'; }

    static bool pointOnWireInteriorForPoints(int px, int py, const std::vector<Point> &pts);
    virtual bool pointOnWireInterior(int px, int py);
    // split this wire at (px, py), returning the new second half (or null)
    virtual WireElm *split(int px, int py);
    double getMouseDistance(int gx, int gy) override;
    void draw(Graphics &g) override;
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
