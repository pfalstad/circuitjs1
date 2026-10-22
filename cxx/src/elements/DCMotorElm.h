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

class DCMotorElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(DCMotorElm)
    Inductor ind;
    Inductor indInertia;
    double resistance;
    double inductance;
    double K;
    double Kb;
    double J;
    double b;
    double gearRatio;
    double tau;
    double angle;
    double speed = 0;
    double coilCurrent = 0;
    double inertiaCurrent = 0;
    VoltageSource *voltSources[2] = {nullptr, nullptr};
    Point motorCenter;

    DCMotorElm(int xx, int yy);
    DCMotorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 415; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    double getAngle() { return angle; }
    void setPoints() override;
    int getPostCount() override { return 2; }
    int getInternalNodeCount() override { return 4; }
    int getVoltageSourceCount() override { return 2; }
    void setVoltageSource(int n, VoltageSource *v) override;
    void reset() override;
    void stamp() override;
    void startIteration() override;
    void doStep() override;
    void calculateCurrent() override;
    void setCurrent(VoltageSource *vs, double c) override {
        if (vs == voltSources[0])
            current = c;
    }
    void draw(Graphics &g) override;
    static void drawThickerLine(Graphics &g, const Point &pa, const Point &pb);
    void interpPointFix(const Point &a, const Point &b, Point &c, double f, double gg);
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
