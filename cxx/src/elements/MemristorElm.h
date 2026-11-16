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

class MemristorElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(MemristorElm)
    double r_on, r_off, dopeWidth, totalWidth, mobility, resistance;
    Point ps3, ps4;

    MemristorElm(int xx, int yy);
    MemristorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 'm'; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    void draw(Graphics &g) override;
    bool nonLinear() override { return true; }
    void calculateCurrent() override;
    void reset() override { dopeWidth = 0; }
    void startIteration() override;
    void stamp() override;
    void doStep() override;
    void getInfo(std::vector<std::string> &arr) override;
    double getScopeValue(int x) override;
    int getScopeUnits(int x) override;
    bool canShowValueInScope(int x) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
