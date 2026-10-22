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

#include "RailElm.h"

class ExtVoltageElm : public RailElm {
public:
    ELM_CLASS(ExtVoltageElm)
    std::string name;
    double voltage = 0;

    ExtVoltageElm(int xx, int yy) : RailElm(xx, yy, WF_AC) { name = "ext"; }
    ExtVoltageElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void drawRail(Graphics &g) override { drawRailText(g, name); }
    void setVoltage(double v) { if (!std::isnan(v)) voltage = v; }
    const std::string &getName() const { return name; }
    double getVoltage() override { return voltage; }
    int getDumpType() override { return 418; }
    int getShortcut() override { return 0; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    bool isExtVoltageElm() override { return true; }
    std::string getElmType() override { return "ext. voltage"; }
    void getInfo(std::vector<std::string> &arr) override;
};
