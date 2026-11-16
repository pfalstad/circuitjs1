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

class ResistorElm : public CircuitElm {
public:
    ELM_CLASS(ResistorElm)
    void addRoutingObstacle(WireRouter &wr) override;
    double resistance;

    ResistorElm(int xx, int yy);
    ResistorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    bool isResistorElm() override { return true; }
    int getDumpType() override { return 'r'; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    void calculateCurrent() override;
    void stamp() override;
    int getShortcut() override { return 'r'; }
    double getResistance() const { return resistance; }
    void setResistance(double r) { resistance = r; }
    void draw(Graphics &g) override;
    void getInfo(std::vector<std::string> &arr) override;
    std::string getScopeText(int v) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
