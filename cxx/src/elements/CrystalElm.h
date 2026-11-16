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

#include "CompositeElm.h"

class CrystalElm : public CompositeElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(CrystalElm)
    static constexpr int FLAG_SHOW_FREQ = 2;

    double seriesCapacitance = 0;
    double parallelCapacitance = 0;
    double inductance = 0;
    double resistance = 0;

    CrystalElm(int xx, int yy);
    CrystalElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 412; }
    std::string getXmlDumpType() override { return "cr"; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    void draw(Graphics &g) override;
    void stepFinished() override;
    void getInfo(std::vector<std::string> &arr) override;
    bool canViewInScope() override { return true; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;

private:
    std::vector<Point> plate1, plate2, sandwichPoints;
    void initCrystal();
};
