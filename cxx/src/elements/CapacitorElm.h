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

class CapacitorElm : public CircuitElm {
public:
    ELM_CLASS(CapacitorElm)
    double capacitance;
    double compResistance;
    double voltdiff;
    double seriesResistance;
    double initialVoltage;
    int capNode2;
    double curSourceValue;
    std::vector<Point> plate1, plate2;
    static constexpr int FLAG_BACK_EULER = 2;
    static constexpr int FLAG_RESISTANCE = 4;

    CapacitorElm(int xx, int yy);
    CapacitorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    bool isTrapezoidal() const { return (flags & FLAG_BACK_EULER) == 0; }
    void reset() override;
    void shorted();
    bool isCapacitorElm() override { return true; }
    int getDumpType() override { return 'c'; }
    std::string dump() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    void stamp() override;
    void startIteration() override;
    void stepFinished() override;
    void calculateCurrent() override;
    void doStep() override;
    int getInternalNodeCount() override;
    double getScopeValue(int x) override;
    int getScopeUnits(int x) override;
    int getShortcut() override { return 'c'; }
    double getCapacitance() const { return capacitance; }
    double getSeriesResistance() const { return seriesResistance; }
    void setCapacitance(double c) { capacitance = c; }
    void setSeriesResistance(double c) { seriesResistance = c; }
    bool isIdealCapacitor() override { return seriesResistance == 0; }
    bool validate() override;
    // used for PolarCapacitorElm
    std::vector<Point> platePoints;
    void draw(Graphics &g) override;
    void getInfo(std::vector<std::string> &arr) override;
    std::string getScopeText(int v) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
