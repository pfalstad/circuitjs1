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

class AnalogSwitchElm : public CircuitElm {
public:
    ELM_CLASS(AnalogSwitchElm)
    static constexpr int FLAG_INVERT = 1;
    static constexpr int FLAG_PULLDOWN = 2;
    static constexpr int FLAG_FLIPPED_X = 4;
    static constexpr int FLAG_FLIPPED_Y = 8;
    static constexpr int FLAG_FLIPPED = 16;

    double resistance = 0;
    double r_on = 20;
    double r_off = 1e10;
    double threshold = 2.5;
    bool open = false;
    int openhs = 16;

    Point ps, ps1, point3, lead3;

    AnalogSwitchElm(int xx, int yy);
    AnalogSwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 159; }
    std::string getXmlDumpType() override { return "as"; }
    bool isFlippedX() const { return hasFlag(FLAG_FLIPPED_X); }
    bool isFlippedY() const { return hasFlag(FLAG_FLIPPED_Y); }
    bool isFlipped() const { return hasFlag(FLAG_FLIPPED); }
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int c2, int count) override;
    void setPoints() override;
    void draw(Graphics &g) override;
    void calculateCurrent() override;
    bool nonLinear() override { return true; }
    bool needsPulldown() const { return hasFlag(FLAG_PULLDOWN); }
    void stamp() override;
    void doStep() override;
    int getPostCount() override { return 3; }
    Point getPost(int n) override { return (n == 0) ? point1 : (n == 1) ? point2 : point3; }
    void getInfo(std::vector<std::string> &arr) override;
    bool getConnection(int n1, int n2) override { return !(n1 == 2 || n2 == 2); }
    bool hasGroundConnection(int n1) override { return needsPulldown() && (n1 < 2); }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    double getCurrentIntoNode(int n) override;
};
