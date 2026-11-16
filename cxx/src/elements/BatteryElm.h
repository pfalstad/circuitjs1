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

#include <array>

#include "../core/CircuitElm.h"

// Battery model: drawn like a DC voltage source, but internally modeled as
//   (-) terminal -- Vsrc -- nodeA -- R0 -- nodeB -- (R1 parallel C1) -- (+) terminal
// Vsrc's voltage is derived from the state of charge (SOC) via a configurable
// table.  SOC is tracked over time by coulomb counting the terminal current.
class BatteryElm : public CircuitElm {
public:
    ELM_CLASS(BatteryElm)
    static constexpr int FLAG_SHOW_VOLTAGE = 1;
    static constexpr int FLAG_SHOW_SOC = 2;

    // BT_CUSTOM is -1 (not an index into batteryTypeNames/batteryTypeTables) so that
    // new preset types can be appended below without renumbering it.
    static constexpr int BT_ALKALINE = 0;
    static constexpr int BT_LITHIUM = 1;
    static constexpr int BT_NIMH = 2;
    static constexpr int BT_NICD = 3;
    static constexpr int BT_LEAD_ACID = 4;
    static constexpr int BT_CUSTOM = -1;
    static const std::vector<std::string> batteryTypeNames;
    static const std::vector<std::string> batteryTypeTables;

    // default capacity (Ah), R0 (ohms), R1 (ohms), C1 (F) for each preset battery type,
    // applied when the user switches to that type in the edit dialog
    static const std::vector<std::array<double, 4>> batteryTypeDefaults;

    int batteryType;
    double r0, r1, c1;
    double capacityAh;
    double initialSoc;  // 0 to 1, used when resetting
    double soc = 0;     // 0 to 1, current state of charge

    // internal node indices: nodes[0] = (-) terminal, nodes[1] = (+) terminal,
    // nodes[2] = node between Vsrc and R0, nodes[3] = node between R0 and R1/C1
    double compResistance = 0;
    double capVoltDiff = 0;
    double capCurrent = 0;
    double curSourceValue = 0;

    std::string socVoltageTable;
    std::vector<std::array<double, 2>> socTable;  // each entry is [socPercent, voltage], sorted ascending

    BatteryElm(int xx, int yy);

    int getInternalNodeCount() override { return 2; }
    int getVoltageSourceCount() override { return 1; }
    bool getDragVertical(bool requestedVertical) override { return true; }
    bool isBatteryElm() override { return true; }
    // point 2, not point 1, should track the mouse during toolbar drag-and-drop
    void dragPlace(int xa, int ya, bool vertical) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void reset() override;
    static double clampSoc(double s);
    void parseSocTable(EditInfo *ei);
    double getVoltageForSoc(double socFrac);
    double interpSocTable(double socPct);
    void setVoltageSource(int n, VoltageSource *v) override;
    void stamp() override;
    void startIteration() override;
    void doStep() override;
    void stepFinished() override;
    static constexpr int circleSize = 17;
    void setPoints() override;
    void draw(Graphics &g) override;
    void addRoutingObstacle(WireRouter &wr) override { addRoutingObstacleWithLeads(wr, 16); }
    double getPower() override { return -getVoltageDiff() * current; }
    double getVoltageDiff() override { return nodes[1]->v - nodes[0]->v; }
    // SOC is always shown as a whole percentage; getShortUnitText()/getUnitText() would
    // apply metric prefixes or decimal places that don't make sense for a percentage.
    std::string getSocText();
    std::string getBatteryTypeName();
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
