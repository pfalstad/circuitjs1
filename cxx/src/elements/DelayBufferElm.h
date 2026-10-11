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

#include <cmath>

#include "../core/CircuitElm.h"

class DelayBufferElm : public CircuitElm {
public:
    ELM_CLASS(DelayBufferElm)
    double delay = 0;
    double threshold = 2.5;
    double highVoltage = 5;
    Point center;
    Polygon gatePoly;
    // unset (undefined in the TS version) until the input first matches the output
    double delayEndTime = NAN;

    DelayBufferElm(int xx, int yy);
    DelayBufferElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 422; }
    void setHighVoltage(double hv) override { highVoltage = hv; }
    void draw(Graphics &g) override;
    void setPoints() override;
    int getVoltageSourceCount() override { return 1; }
    void stamp() override;
    void doStep() override;
    double getVoltageDiff() override { return nodes[0]->v; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    // there is no current path through the inverter input, but there
    // is an indirect path through the output to ground.
    bool getConnection(int n1, int n2) override { return false; }
    bool hasGroundConnection(int n1) override { return n1 == 1; }
    double getCurrentIntoNode(int n) override { return (n == 1) ? current : 0; }
};
