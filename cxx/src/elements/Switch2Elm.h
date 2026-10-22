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

// SPDT switch
class Switch2Elm : public SwitchElm {
public:
    void addRoutingObstacle(WireRouter &wr) override;
    ELM_CLASS(Switch2Elm)
    int link = 0;
    int throwCount = 2;
    static constexpr int FLAG_CENTER_OFF = 1;
    static constexpr int FLAG_FLIPPED = 8;  // tracks runtime flip state for sync

    std::vector<Point> swposts;
    std::vector<Point> swpoles;

    Switch2Elm(int xx, int yy, bool mm = false);
    Switch2Elm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 'S'; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    void draw(Graphics &g) override;
    double getCurrentIntoNode(int n) override;
    Rectangle getSwitchRect() override;
    Point getPost(int n) override { return (n == 0) ? point1 : swposts[n - 1]; }
    int getPostCount() override { return 1 + throwCount; }
    void calculateCurrent() override;
    void setVoltageSource(int n, VoltageSource *v) override;
    void stamp() override;
    int getVoltageSourceCount() override;
    void toggle() override;
    bool getConnection(int n1, int n2) override;
    bool isWireEquivalent() override { return resistance == 0; }
    // optimizing out this element is too complicated to be worth it (see #646)
    bool isRemovableWire() override { return false; }
    std::string getElmType() override { return "switch (SPDT)"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    // this is for backwards compatibility only.  we only support it if throwCount = 2
    bool hasCenterOff() const { return (flags & FLAG_CENTER_OFF) != 0 && throwCount == 2; }
    bool isPositionFlipped() const { return (flags & FLAG_FLIPPED) != 0; }
    int getShortcut() override { return 'S'; }
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int c2, int count) override;
    bool validate() override;
};
