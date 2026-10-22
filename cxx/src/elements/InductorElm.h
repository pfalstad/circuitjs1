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
#include "Inductor.h"

class InductorElm : public CircuitElm {
public:
    ELM_CLASS(InductorElm)
    Inductor ind;
    double inductance;
    double initialCurrent;
    double saturationCurrent;  // 0 = disabled (linear)
    double seriesResistance;

    InductorElm(int xx, int yy);
    InductorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 'l'; }
    bool isInductorElm() override { return true; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    void reset() override;
    // The inductor companion model is stamped between nodes 0 and getIndNode2().
    // For an ideal inductor, that's node 1.  If a series resistance is set,
    // it's an internal node 2, and a resistor is placed between nodes 2 and 1.
    // This is derived from seriesResistance rather than cached at stamp() time, because
    // calculateCurrent() can run (from setNodeVoltage()) after the resistance
    // is edited but before the circuit is re-stamped.
    int getIndNode2() const { return (seriesResistance > 0) ? 2 : 1; }
    void stamp() override;
    void startIteration() override;
    bool nonLinear() override { return ind.nonLinear(); }
    void calculateCurrent() override;
    void doStep() override;
    int getInternalNodeCount() override { return (seriesResistance > 0) ? 1 : 0; }
    int getShortcut() override { return 'L'; }
    double getInductance() const { return inductance; }
    void setInductance(double l);
    void setSaturationCurrent(double isat);
    double getSaturationCurrent() const { return saturationCurrent; }
    double getSeriesResistance() const { return seriesResistance; }
    void setSeriesResistance(double r);
    bool isIdealInductor() const { return seriesResistance == 0; }
    bool validate() override;
    void draw(Graphics &g) override;
    void getInfo(std::vector<std::string> &arr) override;
    std::string getScopeText(int v) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
