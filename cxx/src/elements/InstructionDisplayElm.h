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

class LookupEntry {
public:
    int lo;
    int hi;
    std::string templ;

    LookupEntry(int lo_, int hi_, std::string t) : lo(lo_), hi(hi_), templ(std::move(t)) {}
    std::string getText(int value) const;
};

class InstructionDisplayElm : public CircuitElm {
public:
    ELM_CLASS(InstructionDisplayElm)
    int busWidth = 4;
    double threshold = 2.5;
    std::string lookupText;
    std::vector<LookupEntry> entries;

    InstructionDisplayElm(int xx, int yy);
    InstructionDisplayElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CircuitElm(xa, ya, xb, yb, f) {}

    std::string getXmlDumpType() override { return "ins"; }
    int getPostCount() override { return busWidth; }
    int getPostWidth(int n) override { return busWidth; }
    int getNumHandles() override { return 1; }
    int getVoltageSourceCount() override { return 0; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    Point getPost(int n) override { return Point(x, y, n); }
    void setPoints() override;
    int readInputValue();
    std::string getDisplayText();
    void draw(Graphics &g) override;
    void addRoutingObstacle(WireRouter &router) override;
    double getVoltageDiff() override { return nodes[0]->v; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void parseEntries(EditInfo *ei);
    int findDash(const std::string &s);
    int parseNumber(std::string s);
    bool getConnection(int n1, int n2) override { return false; }
};
