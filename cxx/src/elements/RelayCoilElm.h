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
#include "Inductor.h"

class RelayCoilElm : public CircuitElm {
public:
    ELM_CLASS(RelayCoilElm)
    double inductance;
    Inductor ind;
    std::string label;
    double onCurrent, offCurrent;
    std::vector<Point> coilPosts, coilLeads, outline, extraPoints;
    double coilCurrent = 0;
    double coilCurCount = 0;
    double avgCurrent = 0;
    double d_position = 0;
    int i_position = 0;
    double coilR;
    double switchingTime;
    double switchingTimeOn = 0;
    double switchingTimeOff = 0;
    double lastTransition = 0;
    int openhs = 0;
    int state = 0;
    int switchPosition = 0;

    static constexpr int TYPE_NORMAL = 0;
    static constexpr int TYPE_ON_DELAY = 1;
    static constexpr int TYPE_OFF_DELAY = 2;
    static constexpr int TYPE_LATCHING = 3;
    static constexpr int TYPE_LATCHING_ON = 4;
    static constexpr int TYPE_LATCHING_OFF = 5;
    int type = 0;

    static bool isLatchingType(int t) {
        return t == TYPE_LATCHING || t == TYPE_LATCHING_ON || t == TYPE_LATCHING_OFF;
    }

    static constexpr int nCoil1 = 0;
    static constexpr int nCoil2 = 1;
    static constexpr int nCoil3 = 2;
    double currentOffset1 = 0, currentOffset2 = 0;

    RelayCoilElm(int xx, int yy);
    RelayCoilElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 425; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void draw(Graphics &g) override;
    double getCurrentIntoNode(int n) override { return n == 0 ? -coilCurrent : coilCurrent; }
    void setPoints() override;
    Point getPost(int n) override { return coilPosts[n]; }
    int getPostCount() override { return 2; }
    int getInternalNodeCount() override { return 1; }
    void reset() override;
    void stamp() override;
    void startIteration() override;
    void setParentList(std::vector<CircuitElm *> &list) override { elmList = &list; }
    void toggleSwitchPositions();
    // for set/reset coils: unconditionally drive matching contacts to an
    // explicit position, since a set/reset coil may fire without its own
    // switchPosition value actually changing
    void setSwitchPositions(int position);
    void doStep() override;
    void calculateCurrent() override;
    std::string getElmType() override { return "relay"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    bool getConnection(int, int) override { return true; }

private:
    std::vector<CircuitElm *> *elmList = nullptr;
};
