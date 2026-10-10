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

class OutputElm : public CircuitElm {
public:
    void addRoutingObstacle(WireRouter &wr) override;
    ELM_CLASS(OutputElm)
    static constexpr int FLAG_VALUE = 1;
    static constexpr int FLAG_FIXED = 2;
    int scale;

    OutputElm(int xx, int yy) : CircuitElm(xx, yy) { scale = SCALE_AUTO; }
    OutputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    bool isOutputElm() override { return true; }
    int getDumpType() override { return 'O'; }
    int getPostCount() override { return 1; }
    void setPoints() override;
    double getVoltageDiff() override { return nodes[0]->v; }
    bool isFixed() const { return (flags & FLAG_FIXED) != 0; }
    bool showVoltage() const { return (flags & FLAG_VALUE) != 0; }
    void draw(Graphics &g) override;
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};

class LogicOutputElm : public CircuitElm {
public:
    void addRoutingObstacle(WireRouter &wr) override;
    ELM_CLASS(LogicOutputElm)
    static constexpr int FLAG_TERNARY = 1;
    static constexpr int FLAG_NUMERIC = 2;
    static constexpr int FLAG_PULLDOWN = 4;
    double threshold;
    std::string value;

    LogicOutputElm(int xx, int yy) : CircuitElm(xx, yy) { threshold = 2.5; }
    LogicOutputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    std::string dump() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    bool isLogicOutputElm() override { return true; }
    int getDumpType() override { return 'M'; }
    int getPostCount() override { return 1; }
    bool isTernary() const { return (flags & FLAG_TERNARY) != 0; }
    bool isNumeric() const { return (flags & (FLAG_TERNARY | FLAG_NUMERIC)) != 0; }
    bool needsPullDown() const { return (flags & FLAG_PULLDOWN) != 0; }
    void setPoints() override;
    void stamp() override;
    double getVoltageDiff() override { return nodes[0]->v; }
    void draw(Graphics &g) override;
    void getInfo(std::vector<std::string> &arr) override;
    int getShortcut() override { return 'o'; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
