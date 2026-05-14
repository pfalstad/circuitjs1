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

import com.lushprojects.circuitjs1.client.util.Locale;

// plot of single value on a scope
class ScopePlot {
    double minValues[], maxValues[];
    int scopePointCount;
    int ptr; // ptr is pointer to the current sample
    int value; // Value - the property being shown - e.g. VAL_CURRENT
    // scopePlotSpeed is in sim timestep units per pixel
    int scopePlotSpeed, units;
    double lastUpdateTime;
    double lastValue;
    String color;
    CircuitElm elm;
   // Has a manual scale in "/div" format been put in by the user (as opposed to being
   // inferred from a "MaxValue" format or from an automatically calculated scale)?
   // Manual scales should be kept to sane values anyway, but this shows if this is a user
   // intention we should respect, or if we should try and populate reasonable values from
   // the data we have
    boolean manScaleSet = false;
    double manScale = 1.0; // Units per division
    int manVPosition = 0; // 0 is center of screen. +V_POSITION_STEPS/2 is top of screen
    double gridMult;
    double plotOffset;
    boolean acCoupled = false;
    double acAlpha = 0.9999; // Filter coefficient for AC coupling
    double acLastOut = 0; // Store y[i-1] term for AC coupling filter

    final static int FLAG_AC=1;

    ScopePlot(CircuitElm e, int u) {
	elm = e;
	units = u;
    }

    ScopePlot(CircuitElm e, int u, int v, double manS) {
	elm = e;
	units = u;
	value = v;
	manScale = manS;
	// ohms can only be positive, so move the v position to the bottom.
	// power can be negative for caps and inductors, but still move to the bottom (for backward compatibility)
	if (units == Scope.UNITS_OHMS || units == Scope.UNITS_W || units == Scope.UNITS_C)
	    manVPosition = -Scope.V_POSITION_STEPS/2;
    }

    int startIndex(int w) {
	return ptr + scopePointCount - w;
    }

    void reset(int spc, int sp, boolean full) {
	int oldSpc = scopePointCount;
	scopePointCount = spc;
	if (scopePlotSpeed != sp)
	    oldSpc = 0; // throw away old data
	scopePlotSpeed = sp;
	// Adjust the time constant of the AC coupled filter in proportion to the number of samples
	// we are seeing on the scope (if my maths is right). The constant is empirically determined
	acAlpha = 1.0-1.0/(1.15*scopePlotSpeed*scopePointCount);
	double oldMin[] = minValues;
	double oldMax[] = maxValues;
    	minValues = new double[scopePointCount];
    	maxValues = new double[scopePointCount];
    	if (oldMin != null && !full) {
    	    // preserve old data if possible
    	    int i;
    	    for (i = 0; i != scopePointCount && i != oldSpc; i++) {
    		int i1 = (-i) & (scopePointCount-1);
    		int i2 = (ptr-i) & (oldSpc-1);
    		minValues[i1] = oldMin[i2];
    		maxValues[i1] = oldMax[i2];
    	    }
    	} else
    	    lastUpdateTime = SimulationManager.theSim.t;
    	ptr = 0;
    }

    void timeStep() {
	if (elm == null)
		return;
	double v = elm.getScopeValue(value);
	 // AC coupling filter. 1st order IIR high pass
	 // y[i] = alpha x (y[i-1]+x[i]-x[i-1])
	 // We calculate for all iterations (even DC coupled) to prime the data in case they switch to AC later
	double newAcOut=acAlpha*(acLastOut+v-lastValue);
	lastValue = v;
	acLastOut = newAcOut;
	if (isAcCoupled())
	    v = newAcOut;
	if (v < minValues[ptr])
		minValues[ptr] = v;
	if (v > maxValues[ptr])
		maxValues[ptr] = v;
	double maxTimeStep = SimulationManager.theSim.maxTimeStep;
	if (SimulationManager.theSim.t-lastUpdateTime >= maxTimeStep * scopePlotSpeed) {
	    ptr = (ptr+1) & (scopePointCount-1);
	    minValues[ptr] = maxValues[ptr] = v;
	    lastUpdateTime += maxTimeStep * scopePlotSpeed;
	}
    }

    String getUnitText(double v) {
	switch (units) {
	case Scope.UNITS_V:
	    return CircuitElm.getVoltageText(v);
	case Scope.UNITS_A:
	    return CircuitElm.getCurrentText(v);
	case Scope.UNITS_OHMS:
	    return CircuitElm.getUnitText(v, Locale.ohmString);
	case Scope.UNITS_W:
	    return CircuitElm.getUnitText(v, "W");
	case Scope.UNITS_C:
	    return CircuitElm.getUnitText(v, "C");
	}
	return null;
    }

    static final String colors[] = {
	    "#FF0000", "#FF8000", "#FF00FF", "#7F00FF",
	    "#0000FF", "#0080FF", "#FFFF00", "#00FFFF",
    };

    void assignColor(int count) {
	if (count > 0) {
	    color = colors[(count-1) % 8];
	    return;
	}
	switch (units) {
	case Scope.UNITS_V:
	    color = CircuitElm.positiveColor.getHexValue();
	    break;
	case Scope.UNITS_A:
	    color = (CirSim.theApp.isPrintable()) ? "#A0A000" : "#FFFF00";
	    break;
	default:
	    color = (CirSim.theApp.isPrintable()) ? "#000000" : "#FFFFFF";
	    break;
	}
    }

    void setAcCoupled(boolean b) {
	if (canAcCouple()) {
	    acCoupled = b;
	}
	else
	    acCoupled = false;
    }

    boolean canAcCouple() {
	return units == Scope.UNITS_V; // AC coupling is permitted if the plot is displaying volts
    }

    boolean isAcCoupled() {
	return acCoupled;
    }

    int getPlotFlags() {
	return (acCoupled ? FLAG_AC : 0);
    }
}
