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

// contributed by Edward Calver

class InvertingSchmittElm : public CircuitElm {
public:
    ELM_CLASS(InvertingSchmittElm)
    double slewRate;  // V/ns
    double lowerTrigger;
    double upperTrigger;
    bool state = false;
    double logicOnLevel;
    double logicOffLevel;

    InvertingSchmittElm(int xx, int yy);
    InvertingSchmittElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 183; }
    void draw(Graphics &g) override;
    Polygon gatePoly;
    Polygon symbolPoly;
    Point pcircle;
    void setPoints() override;
    int getVoltageSourceCount() override { return 1; }
    void stamp() override;
    void doStep() override;
    double getVoltageDiff() override { return nodes[0]->v; }
    void getInfo(std::vector<std::string> &arr) override;
    double dlt = 0;
    double dut = 0;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    // there is no current path through the InvertingSchmitt input, but there
    // is an indirect path through the output to ground.
    bool getConnection(int n1, int n2) override { return false; }
    bool hasGroundConnection(int n1) override { return n1 == 1; }
    double getCurrentIntoNode(int n) override { return (n == 1) ? current : 0; }
};

class SchmittElm : public InvertingSchmittElm {
public:
    ELM_CLASS(SchmittElm)
    SchmittElm(int xx, int yy) : InvertingSchmittElm(xx, yy) {}
    SchmittElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : InvertingSchmittElm(xa, ya, xb, yb, f, st) {}

    int getDumpType() override { return 182; }
    double lastOutputVoltage = 0;
    void startIteration() override { lastOutputVoltage = nodes[1]->v; }
    void doStep() override;
    void draw(Graphics &g) override;
    void setPoints() override;
    void getInfo(std::vector<std::string> &arr) override { arr[0] = "Schmitt Trigger~"; }  // ~ is for localization
};
