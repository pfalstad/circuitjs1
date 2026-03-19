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

package com.lushprojects.circuitjs1.client;

class Inductor {
    public static final int FLAG_BACK_EULER = 2;
    CircuitNode nodes[];
    int flags;
    SimulationManager sim;

    double inductance;
    double compResistance, current;
    double curSourceValue;
    double saturationCurrent; // 0 = disabled (linear), >0 = saturation onset current (A)
    Inductor(SimulationManager s) {
	sim = s;
	nodes = new CircuitNode[2];
    }
    void setup(double ic, double cr, int f) {
	inductance = ic;
	current = cr;
	flags = f;
    }
    void setup(double ic, double cr, int f, double isat) {
	setup(ic, cr, f);
	saturationCurrent = isat;
    }
    boolean isTrapezoidal() { return (flags & FLAG_BACK_EULER) == 0; }
    void reset() { resetTo(0); }
    void resetTo(double c) {
	// need to set curSourceValue here in case one of inductor nodes is node 0.  In that case
	// calculateCurrent() may get called (from setNodeVoltage()) when analyzing circuit, before
	// startIteration() gets called
	curSourceValue = current = c;
    }

    // compute effective inductance with saturation: L(I) = L0 / (1 + (I/Isat)^2)
    // smooth rolloff: at |I|=Isat, L=L0/2; at |I|=3*Isat, L=L0/10
    double calcEffectiveInductance(double i) {
	if (saturationCurrent <= 0) return inductance;
	double ratio = i / saturationCurrent;
	return inductance / (1 + ratio * ratio);
    }

    void stamp(CircuitNode n0, CircuitNode n1) {
	// inductor companion model using trapezoidal or backward euler
	// approximations (Norton equivalent) consists of a current
	// source in parallel with a resistor.  Trapezoidal is more
	// accurate than backward euler but can cause oscillatory behavior.
	// The oscillation is a real problem in circuits with switches.
	nodes[0] = n0;
	nodes[1] = n1;
	if (saturationCurrent > 0) {
	    // nonlinear: conductance changes with current, stamped in doStep()
	    sim.stampNonLinear(nodes[0]);
	    sim.stampNonLinear(nodes[1]);
	} else {
	    // linear: fixed companion conductance
	    if (isTrapezoidal())
		compResistance = 2*inductance/sim.timeStep;
	    else // backward euler
		compResistance = inductance/sim.timeStep;
	    sim.stampResistor(nodes[0], nodes[1], compResistance);
	}
	sim.stampRightSide(nodes[0]);
	sim.stampRightSide(nodes[1]);
    }
    boolean nonLinear() { return saturationCurrent > 0; }

    void startIteration(double voltdiff) {
	if (saturationCurrent > 0) {
	    // recompute companion resistance from current-dependent inductance
	    double lEff = calcEffectiveInductance(current);
	    if (isTrapezoidal())
		compResistance = 2*lEff/sim.timeStep;
	    else
		compResistance = lEff/sim.timeStep;
	}
	if (isTrapezoidal())
	    curSourceValue = voltdiff/compResistance+current;
	else // backward euler
	    curSourceValue = current;
    }

    double calculateCurrent(double voltdiff) {
	// we check compResistance because this might get called
	// before stamp(), which sets compResistance, causing
	// infinite current
	if (compResistance > 0)
	    current = voltdiff/compResistance + curSourceValue;
	return current;
    }
    void doStep(double voltdiff) {
	if (saturationCurrent > 0) {
	    // stamp companion conductance (matrix was restored to origMatrix)
	    sim.stampConductance(nodes[0], nodes[1], 1.0/compResistance);
	}
	sim.stampCurrentSource(nodes[0], nodes[1], curSourceValue);
    }
}
