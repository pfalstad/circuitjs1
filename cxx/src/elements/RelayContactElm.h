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

class RelayContactElm : public CircuitElm {
public:
    ELM_CLASS(RelayContactElm)
    double r_on, r_off;
    std::vector<Point> swposts, swpoles, extraPoints;
    Point ptSwitch;
    double switchCurrent = 0;
    double switchCurCount = 0;
    std::string label;
    static constexpr int FLAG_NORMALLY_CLOSED = 2;
    static constexpr int FLAG_IEC = 4;
    int type = 0;
    int i_position = 0;
    int openhs = 0;
    static constexpr int nSwitch0 = 0;
    static constexpr int nSwitch1 = 1;

    RelayContactElm(int xx, int yy);
    RelayContactElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 426; }
    bool useIECSymbol() const { return (flags & FLAG_IEC) != 0; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void draw(Graphics &g) override;
    double getCurrentIntoNode(int n) override;
    void setPoints() override;
    void setContactPosition(int i_position_, int type_);
    bool isNormallyClosed() const { return (flags & FLAG_NORMALLY_CLOSED) != 0; }
    Point getPost(int n) override { return swposts[n]; }
    int getPostCount() override { return 2; }
    void reset() override;
    void stamp() override;
    bool nonLinear() override { return true; }
    void doStep() override;
    void calculateCurrent() override;
    std::string getElmType() override { return "relay"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    bool getConnection(int, int) override { return true; }
};
