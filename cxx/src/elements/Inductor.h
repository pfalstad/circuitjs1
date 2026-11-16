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

#include "../core/CircuitNode.h"

class SimulationManager;

class Inductor {
public:
    static constexpr int FLAG_BACK_EULER = 2;
    NodeRef nodes[2];
    int flags = 0;
    SimulationManager *sim;

    double inductance = 0;
    double compResistance = 0;
    double current = 0;
    double curSourceValue = 0;
    double saturationCurrent = 0;  // 0 = disabled (linear), >0 = saturation onset current (A)

    explicit Inductor(SimulationManager *s) : sim(s) {}

    void setup(double ic, double cr, int f) { inductance = ic; current = cr; flags = f; }
    void setup(double ic, double cr, int f, double isat) { setup(ic, cr, f); saturationCurrent = isat; }
    bool isTrapezoidal() const { return (flags & FLAG_BACK_EULER) == 0; }
    void reset() { resetTo(0); }
    // need to set curSourceValue here in case one of inductor nodes is node 0.  In that case
    // calculateCurrent() may get called (from setNodeVoltage()) when analyzing circuit, before
    // startIteration() gets called
    void resetTo(double c) { curSourceValue = current = c; }

    // compute effective inductance with saturation: L(I) = L0 / (1 + (I/Isat)^2)
    // smooth rolloff: at |I|=Isat, L=L0/2; at |I|=3*Isat, L=L0/10
    double calcEffectiveInductance(double i) const;

    void stamp(const NodeRef &n0, const NodeRef &n1);
    bool nonLinear() const { return saturationCurrent > 0; }
    void startIteration(double voltdiff);
    double calculateCurrent(double voltdiff);
    void doStep(double voltdiff);
};
