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

class MotorProtectionSwitchElm : public CircuitElm {
public:
    ELM_CLASS(MotorProtectionSwitchElm)
    double resistance;
    double heats[3] = {0, 0, 0};
    double i2t;
    std::vector<Point> posts, leads;
    double currents[3] = {0, 0, 0};
    double curcounts[3] = {0, 0, 0};
    bool blown = false;
    std::string label;
    static constexpr double blownResistance = 1e9;

    MotorProtectionSwitchElm(int xx, int yy);
    MotorProtectionSwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    std::string dump() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 428; }
    void reset() override;
    void setPoints() override;
    int getPostCount() override { return 6; }
    Point getPost(int n) override { return posts[n]; }
    Color getTempColor(Graphics &g, int num);
    void draw(Graphics &g) override;
    void calculateCurrent() override;
    void stamp() override;
    bool nonLinear() override { return true; }
    bool getConnection(int n1, int n2) override { return n1 / 2 == n2 / 2; }
    void startIteration() override;
    void setSwitchPositions();
    void doStep() override;
    void getInfo(std::vector<std::string> &arr) override;
    double getCurrentIntoNode(int n) override { return (n % 2 == 1) ? currents[n / 2] : -currents[n / 2]; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    bool canFlipX() override { return false; }
    bool canFlipY() override { return false; }
};
