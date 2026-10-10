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

#include "Inductor.h"

#include "../core/SimulationManager.h"

double Inductor::calcEffectiveInductance(double i) const {
    if (saturationCurrent <= 0)
        return inductance;
    double ratio = i / saturationCurrent;
    return inductance / (1 + ratio * ratio);
}

void Inductor::stamp(const NodeRef &n0, const NodeRef &n1) {
    // inductor companion model using trapezoidal or backward euler
    // approximations (Norton equivalent) consists of a current
    // source in parallel with a resistor.  Trapezoidal is more
    // accurate than backward euler but can cause oscillatory behavior.
    // The oscillation is a real problem in circuits with switches.
    nodes[0] = n0;
    nodes[1] = n1;
    if (saturationCurrent > 0) {
        // nonlinear: conductance changes with current, stamped in doStep()
        sim->stampNonLinear(nodes[0]);
        sim->stampNonLinear(nodes[1]);
    } else {
        // linear: fixed companion conductance
        if (isTrapezoidal())
            compResistance = 2 * inductance / sim->timeStep;
        else  // backward euler
            compResistance = inductance / sim->timeStep;
        sim->stampResistor(nodes[0], nodes[1], compResistance);
    }
}

void Inductor::startIteration(double voltdiff) {
    if (saturationCurrent > 0) {
        // recompute companion resistance from current-dependent inductance
        double lEff = calcEffectiveInductance(current);
        if (isTrapezoidal())
            compResistance = 2 * lEff / sim->timeStep;
        else
            compResistance = lEff / sim->timeStep;
    }
    if (isTrapezoidal())
        curSourceValue = voltdiff / compResistance + current;
    else  // backward euler
        curSourceValue = current;
}

double Inductor::calculateCurrent(double voltdiff) {
    // we check compResistance because this might get called
    // before stamp(), which sets compResistance, causing
    // infinite current
    if (compResistance > 0)
        current = voltdiff / compResistance + curSourceValue;
    return current;
}

void Inductor::doStep(double voltdiff) {
    if (saturationCurrent > 0) {
        // stamp companion conductance (matrix was restored to origMatrix)
        sim->stampConductance(nodes[0], nodes[1], 1.0 / compResistance);
    }
    sim->stampCurrentSource(nodes[0], nodes[1], curSourceValue);
}
