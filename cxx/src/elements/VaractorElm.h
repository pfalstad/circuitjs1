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

#include "DiodeElm.h"

class VaractorElm : public DiodeElm {
public:
    bool showPropertiesOnCreate() override { return true; }
    ELM_CLASS(VaractorElm)
    double baseCapacitance;
    double capacitance = 0;
    double capCurrent = 0;

    // DiodeElm.lastvoltdiff = volt diff from last iteration
    // capvoltdiff = volt diff from last timestep
    double compResistance = 0;
    double capvoltdiff = 0;
    std::vector<Point> plate1, plate2;
    double voltSourceValue = 0;

    VaractorElm(int xx, int yy);
    VaractorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 176; }
    std::string getElmType() override { return "varactor"; }
    void getInfo(std::vector<std::string> &arr) override;
    void stepFinished() override;
    void calculateCurrent() override;
    void reset() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    void draw(Graphics &g) override;
    void setVoltageSource(int n, VoltageSource *v) override;
    void stamp() override;
    void startIteration() override;
    void doStep() override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    int getShortcut() override { return 0; }
    void setCurrent(VoltageSource *vs, double c) override { capCurrent = c; }
    int getVoltageSourceCount() override { return 1; }
    int getInternalNodeCount() override { return 1; }
};
