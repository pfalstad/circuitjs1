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

class AMElm : public CircuitElm {
public:
    ELM_CLASS(AMElm)
    static constexpr int FLAG_COS = 2;
    double carrierfreq;
    double signalfreq;
    double maxVoltage;
    double freqTimeZero = 0;

    AMElm(int xx, int yy);
    AMElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 200; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void reset() override;
    int getPostCount() override { return 1; }
    void stamp() override;
    void doStep() override;
    double getVoltage();
    static constexpr int circleSize = 17;
    void draw(Graphics &g) override;
    void drawWaveform(Graphics &g, const Point &center);
    void setPoints() override;
    double getVoltageDiff() override { return nodes[0]->v; }
    bool validate() override { return validateRailNode(0); }
    bool hasGroundConnection(int n1) override { return true; }
    int getVoltageSourceCount() override { return 1; }
    double getPower() override { return -getVoltageDiff() * current; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
