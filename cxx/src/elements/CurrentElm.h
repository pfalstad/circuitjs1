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

class CurrentElm : public CircuitElm {
public:
    ELM_CLASS(CurrentElm)
    double currentValue = 0.01;
    // Compliance voltage. 0 = unlimited (ideal current source).
    double maxVoltage = 0;
    double lastVoltDiff = 0;
    bool broken = false;
    Polygon arrow;
    Point ashaft1, ashaft2, center;

    CurrentElm(int xx, int yy) : CircuitElm(xx, yy) {}
    CurrentElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    bool isVoltageLimited() const { return maxVoltage > 0; }
    bool nonLinear() override { return isVoltageLimited(); }
    void reset() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 'i'; }
    bool isCurrentElm() override { return true; }
    void setPoints() override;
    // analyzeCircuit determines if current source has a path or if it's broken
    void setBroken(bool b) { broken = b && !isVoltageLimited(); }
    void stamp() override;
    void doStep() override;
    double getVoltageDiff() override { return nodes[1]->v - nodes[0]->v; }
    double getPower() override { return -getVoltageDiff() * current; }
    bool validate() override;
    void draw(Graphics &g) override;
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
