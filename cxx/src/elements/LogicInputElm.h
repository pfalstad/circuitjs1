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

class LogicInputElm : public SwitchElm {
public:
    void addRoutingObstacle(WireRouter &wr) override;
    Rectangle getSwitchRect() override;
    ELM_CLASS(LogicInputElm)
    static constexpr int FLAG_TERNARY = 1;
    static constexpr int FLAG_NUMERIC = 2;
    double hiV;
    double loV;

    LogicInputElm(int xx, int yy);
    LogicInputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    bool isTernary() const { return (flags & FLAG_TERNARY) != 0; }
    bool isNumeric() const { return (flags & (FLAG_TERNARY | FLAG_NUMERIC)) != 0; }
    int getDumpType() override { return 'L'; }
    bool showPropertiesOnCreate() override { return false; }
    std::string dump() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getPostCount() override { return 1; }
    void setPoints() override;
    void setCurrent(VoltageSource *, double c) override { current = c; }
    void calculateCurrent() override {}
    void stamp() override;
    bool isLogicInputElm() override { return true; }
    bool isWireEquivalent() override { return false; }
    bool isRemovableWire() override { return false; }
    void doStep() override;
    int getVoltageSourceCount() override { return 1; }
    double getVoltageDiff() override { return nodes[0]->v; }
    bool hasGroundConnection(int) override { return true; }
    double getCurrentIntoNode(int) override { return current; }
    bool validate() override { return validateRailNode(0); }
    void draw(Graphics &g) override;
    std::string getElmType() override { return "logic input"; }
    void getInfo(std::vector<std::string> &arr) override;
    int getShortcut() override { return 'i'; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
