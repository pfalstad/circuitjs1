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

class GroundElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    void addRoutingObstacle(WireRouter &wr) override;
    ELM_CLASS(GroundElm)
    static int lastSymbolType;
    int symbolType;

    // this is needed for old subcircuits which have GroundElm dumped
    static constexpr int FLAG_OLD_STYLE = 1;

    GroundElm(int xx, int yy);
    GroundElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    bool getDragVertical(bool) override { return true; }
    int getDragLength() override { return 32; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;

    bool isGroundElm() override { return true; }
    int getDumpType() override { return 'g'; }
    int getPostCount() override { return 1; }

    void setOldStyle() { flags |= FLAG_OLD_STYLE; }
    bool isOldStyle() const { return (flags & FLAG_OLD_STYLE) != 0; }
    int getVoltageSourceCount() override { return isOldStyle() ? 1 : 0; }
    void stamp() override;
    void setCurrent(VoltageSource *, double c) override { current = isOldStyle() ? -c : c; }

    bool isWireEquivalent() override { return true; }
    bool isRemovableWire() override { return true; }

    static std::optional<Point> firstGround;
    static void resetNodeList() { firstGround.reset(); }
    std::optional<Point> getConnectedPost(int n) override;

    double getVoltageDiff() override { return 0; }
    bool hasGroundConnection(int) override { return true; }
    int getShortcut() override { return 'g'; }
    double getCurrentIntoNode(int) override { return -current; }
    void draw(Graphics &g) override;
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
