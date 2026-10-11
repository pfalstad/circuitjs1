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

class LampElm : public CircuitElm {
public:
    ELM_CLASS(LampElm)
    double resistance = 0;
    static constexpr double roomTemp = 300;
    double temp;
    double nom_pow;
    double nom_v;
    double warmTime;
    double coolTime;

    LampElm(int xx, int yy);
    LampElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 181; }

    std::vector<Point> bulbLead, filament;
    Point bulb;
    double bulbR = 0;

    void reset() override;
    static constexpr int filament_len = 24;
    void setPoints() override;
    Color getTempColor();
    void draw(Graphics &g) override;
    void calculateCurrent() override;
    void stamp() override;
    bool nonLinear() override { return true; }
    void updateResistance();
    void startIteration() override;
    void doStep() override;
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    double getScopeValue(int x) override;
    int getScopeUnits(int x) override;
    bool canShowValueInScope(int x) override;
};
