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
    int nodes[];
    int flags;
    SimulationManager sim;

    double inductance;
    double compResistance, current;
    double curSourceValue;
    double saturationCurrent; // 0 = disabled (linear), >0 = saturation onset current (A)

    // Jiles-Atherton hysteresis (0 = disabled). All internal state uses normalized
    // dimensionless m in [-1,1] scaled by coerciveCurrent. Physics params (shape an,
    // coupling alphaN) have fixed internal defaults so user only sees Ic and c.
    double coerciveCurrent;    // k in JA, A. 0 = hysteresis disabled.
    double reversibility;      // c in JA, 0..1.
    static final double JA_SHAPE = 1.0/3.0;    // an, gives dm/dh=1 at h=0 (virgin L = L0)
    static final double JA_COUPLING = 1e-3;    // alpha, small = weak interdomain
    double mIrr;               // irreversible magnetization, dimensionless
    double mTotal;             // mIrr + c*(man-mIrr)
    double prevI;              // I from previous startIteration
    double prevM;              // mTotal from previous startIteration
    double lastLeff;           // effective inductance last computed

    Inductor(SimulationManager s) {
	sim = s;
	nodes = new int[2];
    }
    void setup(double ic, double cr, int f) {
	inductance = ic;
	current = cr;
	flags = f;
	lastLeff = inductance;
    }
    void setup(double ic, double cr, int f, double isat) {
	setup(ic, cr, f);
	saturationCurrent = isat;
    }
    void setup(double ic, double cr, int f, double isat, double icoerc, double rev) {
	setup(ic, cr, f, isat);
	coerciveCurrent = icoerc;
	reversibility = rev;
    }
    boolean isTrapezoidal() { return (flags & FLAG_BACK_EULER) == 0; }
    boolean hasHysteresis() { return coerciveCurrent > 0; }
    void reset() { resetTo(0); }
    void resetTo(double c) {
	// need to set curSourceValue here in case one of inductor nodes is node 0.  In that case
	// calculateCurrent() may get called (from setNodeVoltage()) when analyzing circuit, before
	// startIteration() gets called
	curSourceValue = current = c;
	mIrr = mTotal = 0;
	prevI = c;
	prevM = 0;
	lastLeff = inductance;
    }

    // compute effective inductance with saturation: L(I) = L0 / (1 + (I/Isat)^2)
    // smooth rolloff: at |I|=Isat, L=L0/2; at |I|=3*Isat, L=L0/10
    // When hysteresis is active, effective L is derived from JA state instead
    // and this function returns the last computed value.
    double calcEffectiveInductance(double i) {
	if (hasHysteresis()) return lastLeff;
	if (saturationCurrent <= 0) return inductance;
	double ratio = i / saturationCurrent;
	return inductance / (1 + ratio * ratio);
    }

    // Advance Jiles-Atherton state by one timestep. h = I/Ic (dimensionless
    // field). Magnetization m evolves according to:
    //   Man(he) = coth(he/an) - an/he        (Langevin, normalized Ms=1)
    //   he = h + alpha*m
    //   dMirr/dh = (Man-Mirr)/(sign*1 - alpha*(Man-Mirr))     (k normalized to 1)
    //   m = Mirr + c*(Man-Mirr)
    void advanceHysteresis(double i) {
	double h = i / coerciveCurrent;
	double dh = h - prevI / coerciveCurrent;
	double sign = (dh >= 0) ? 1.0 : -1.0;
	double he = h + JA_COUPLING * mTotal;
	double man;
	double heOverA = he / JA_SHAPE;
	if (Math.abs(he) < 1e-6) {
	    man = he / (3.0 * JA_SHAPE);
	} else {
	    // coth(x) = (e^x + e^-x) / (e^x - e^-x); for large |x| approach sign(x)
	    double coth;
	    if (Math.abs(heOverA) > 30) {
		coth = (heOverA > 0) ? 1.0 : -1.0;
	    } else {
		double ep = Math.exp(heOverA);
		double em = Math.exp(-heOverA);
		coth = (ep + em) / (ep - em);
	    }
	    man = coth - JA_SHAPE / he;
	}
	// clamp anhysteretic to [-1,1] (numerical safety near saturation)
	if (man > 1) man = 1;
	if (man < -1) man = -1;

	double diff = man - mIrr;
	double denom = sign - JA_COUPLING * diff;
	// floor denominator to avoid singularity at loop tips
	if (Math.abs(denom) < 1e-3) denom = sign * 1e-3;
	double dMirr = diff / denom * dh;
	mIrr += dMirr;
	if (mIrr > 1) mIrr = 1;
	if (mIrr < -1) mIrr = -1;

	double newM = mIrr + reversibility * (man - mIrr);

	// effective inductance from numerical slope dm/dh times L0
	double dm_dh;
	if (Math.abs(dh) > 1e-6) {
	    dm_dh = (newM - mTotal) / dh;
	} else {
	    // no change this step: fall back to anhysteretic tangent
	    dm_dh = 1.0; // = 1/(3*JA_SHAPE) with an=1/3
	}
	// floor and cap incremental slope for convergence
	if (dm_dh < 0.01) dm_dh = 0.01;
	if (dm_dh > 3.0) dm_dh = 3.0;
	lastLeff = inductance * dm_dh;

	prevM = mTotal;
	mTotal = newM;
	prevI = i;
    }

    void stamp(int n0, int n1) {
	// inductor companion model using trapezoidal or backward euler
	// approximations (Norton equivalent) consists of a current
	// source in parallel with a resistor.  Trapezoidal is more
	// accurate than backward euler but can cause oscillatory behavior.
	// The oscillation is a real problem in circuits with switches.
	nodes[0] = n0;
	nodes[1] = n1;
	if (saturationCurrent > 0 || hasHysteresis()) {
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
    boolean nonLinear() { return saturationCurrent > 0 || hasHysteresis(); }

    void startIteration(double voltdiff) {
	if (hasHysteresis()) {
	    // advance JA state once per timestep, then use resulting lastLeff
	    advanceHysteresis(current);
	    double lEff = lastLeff;
	    if (isTrapezoidal())
		compResistance = 2*lEff/sim.timeStep;
	    else
		compResistance = lEff/sim.timeStep;
	} else if (saturationCurrent > 0) {
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
	if (saturationCurrent > 0 || hasHysteresis()) {
	    // stamp companion conductance (matrix was restored to origMatrix)
	    sim.stampConductance(nodes[0], nodes[1], 1.0/compResistance);
	}
	sim.stampCurrentSource(nodes[0], nodes[1], curSourceValue);
    }

    // magnetization state (normalized -1..1) for info panel / debugging
    double getMagnetization() { return mTotal; }
    double getIrreversibleMagnetization() { return mIrr; }
}
