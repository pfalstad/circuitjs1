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

class SweepElm : public CircuitElm {
public:
    ELM_CLASS(SweepElm)
    double maxV, maxF, minF, sweepTime, frequency;
    static constexpr int FLAG_LOG = 1;
    static constexpr int FLAG_BIDIR = 2;
    static constexpr int circleSize = 17;

    double fadd = 0;
    double fmul = 1;
    double freqTime = 0;
    double savedTimeStep = 0;
    int dir = 1;
    double v = 0;

    SweepElm(int xx, int yy);
    SweepElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 170; }
    std::string getXmlDumpType() override { return "sw"; }
    int getPostCount() override { return 1; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    void draw(Graphics &g) override;
    bool validate() override { return validateRailNode(0); }
    void stamp() override;
    void setParams();
    void reset() override;
    void startIteration() override;
    void doStep() override;
    double getVoltageDiff() override { return nodes[0]->v; }
    int getVoltageSourceCount() override { return 1; }
    bool hasGroundConnection(int) override { return true; }
    bool isSweepElm() override { return true; }
    std::string getElmType() override { return "sweep"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    double getPower() override { return -getVoltageDiff() * current; }
};
