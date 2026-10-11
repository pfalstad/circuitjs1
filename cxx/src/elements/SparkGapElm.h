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

class SparkGapElm : public CircuitElm {
public:
    ELM_CLASS(SparkGapElm)
    double resistance;
    double onresistance;
    double offresistance;
    double breakdown;
    double holdcurrent;
    bool state;

    SparkGapElm(int xx, int yy);
    SparkGapElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    bool nonLinear() override { return true; }
    int getDumpType() override { return 187; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;

    Polygon arrow1, arrow2;

    void setPoints() override;
    void draw(Graphics &g) override;
    void calculateCurrent() override;
    void reset() override;
    void startIteration() override;
    void doStep() override;
    void stamp() override;
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
