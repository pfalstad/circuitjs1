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

class FuseElm : public CircuitElm {
public:
    ELM_CLASS(FuseElm)
    double resistance;
    double heat = 0;
    double i2t;
    bool blown = false;
    static constexpr int FLAG_IEC_SYMBOL = 1;
    static constexpr double blownResistance = 1e9;

    FuseElm(int xx, int yy);
    FuseElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    std::string dump() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 404; }
    bool isIECSymbol() { return (flags & FLAG_IEC_SYMBOL) != 0; }
    void reset() override;
    void setPoints() override;
    Color getTempColor(Graphics &g);
    void draw(Graphics &g) override;
    void calculateCurrent() override;
    void stamp() override;
    bool nonLinear() override { return true; }
    void startIteration() override;
    void doStep() override;
    std::string getElmType() override { return "fuse"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
