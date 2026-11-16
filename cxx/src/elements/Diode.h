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
class DiodeModel;

class Diode {
public:
    NodeRef nodes[2];
    SimulationManager *sim;

    explicit Diode(SimulationManager *s) : sim(s) {}

    void setup(DiodeModel *model);
    void setupForDefaultModel();
    void reset() { lastvoltdiff = 0; }

    // Electron thermal voltage at SPICE's default temperature of 27 C (300.15 K):
    static constexpr double vt = 0.025865;
    // The diode's "scale voltage", the voltage increase which will raise current by a factor of e.
    double vscale = 0;
    // The multiplicative equivalent of dividing by vscale (for speed).
    double vdcoef = 0;
    // The Zener breakdown curve is represented by a steeper exponential, one like the ideal
    // Shockley curve, but flipped and translated. This curve removes the moderating influence
    // of emcoef, replacing vscale and vdcoef with vt and vzcoef.
    // vzcoef is the multiplicative equivalent of dividing by vt (for speed).
    static constexpr double vzcoef = 1 / vt;
    // User-specified diode parameters for forward voltage drop and Zener voltage.
    double fwdrop = 0;
    double zvoltage = 0;
    // The diode current's scale factor, calculated from the user-specified forward voltage drop.
    double leakage = 0;
    // Voltage offset for Zener breakdown exponential, calculated from user-specified Zener voltage.
    double zoffset = 0;
    // Critical voltages for limiting the normal diode and Zener breakdown exponentials.
    double vcrit = 0;
    double vzcrit = 0;
    double lastvoltdiff = 0;

    double limitStep(double vnew, double vold);
    void stamp(const NodeRef &n0, const NodeRef &n1);
    void doStep(double voltdiff);
    double calculateCurrent(double voltdiff);
};
