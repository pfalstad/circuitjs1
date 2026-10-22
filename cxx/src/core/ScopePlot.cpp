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

#include "ScopePlot.h"

#include <algorithm>

#include "CircuitElm.h"
#include "Locale.h"
#include "ScopeConstants.h"
#include "SimApp.h"
#include "SimulationManager.h"

using namespace ScopeConstants;

const char *const ScopePlot::colors[8] = {
    "#FF0000", "#FF8000", "#FF00FF", "#7F00FF",
    "#0000FF", "#0080FF", "#FFFF00", "#00FFFF",
};

ScopePlot::ScopePlot(CircuitElm *e, int u) : units(u), elm(e) {}

ScopePlot::ScopePlot(CircuitElm *e, int u, int v, double manS) : value(v), units(u), elm(e) {
    manScale = manS;
    // ohms can only be positive, so move the v position to the bottom.
    // power can be negative for caps and inductors, but still move to the bottom (for backward compatibility)
    if (u == UNITS_OHMS || u == UNITS_W || u == UNITS_C)
        manVPosition = -V_POSITION_STEPS / 2;
}

void ScopePlot::reset(int spc, int sp, bool full) {
    int oldSpc = scopePointCount;
    scopePointCount = spc;
    if (scopePlotSpeed != sp)
        oldSpc = 0;  // throw away old data
    scopePlotSpeed = sp;
    // Adjust the time constant of the AC coupled filter in proportion to the number of samples
    // we are seeing on the scope (if my maths is right). The constant is empirically determined
    acAlpha = 1.0 - 1.0 / (1.15 * sp * spc);
    // restart AC coupling filter so we don't carry over stale state (e.g. after reset)
    acDc = 0;
    acCount = 0;
    std::vector<double> oldMin = std::move(liveMin);
    std::vector<double> oldMax = std::move(liveMax);
    liveMin.assign(spc, 0.0);
    liveMax.assign(spc, 0.0);
    if (!oldMin.empty() && !full) {
        // preserve old data if possible
        for (int i = 0; i != spc && i != oldSpc; i++) {
            int i1 = (-i) & (spc - 1);
            int i2 = (ptr - i) & (oldSpc - 1);
            liveMin[i1] = oldMin[i2];
            liveMax[i1] = oldMax[i2];
        }
    } else
        lastUpdateTime = SimulationManager::theSim->t;
    ptr = 0;
    thaw();
}

void ScopePlot::timeStep() {
    if (elm == nullptr)
        return;
    double v = elm->getScopeValue(value);
    // AC coupling filter. 1st order IIR high pass, written as y[i] = x[i] - dc[i] where
    // dc[i] = dc[i-1] + k (x[i]-dc[i-1]).  To avoid a long startup transient, k starts at 1
    // and decreases as 1/n, so dc is the running average of all samples so far, until it
    // reaches 1-alpha.
    // We calculate for all iterations (even DC coupled) to prime the data in case they switch to AC later
    acCount++;
    double k = std::max(1.0 / acCount, 1 - acAlpha);
    acDc += (v - acDc) * k;
    lastValue = v;
    if (isAcCoupled())
        v -= acDc;
    if (v < liveMin[ptr])
        liveMin[ptr] = v;
    if (v > liveMax[ptr])
        liveMax[ptr] = v;
    double maxTimeStep = SimulationManager::theSim->maxTimeStep;
    if (SimulationManager::theSim->t - lastUpdateTime >= maxTimeStep * scopePlotSpeed) {
        ptr = (ptr + 1) & (scopePointCount - 1);
        liveMin[ptr] = liveMax[ptr] = v;
        lastUpdateTime += maxTimeStep * scopePlotSpeed;
    }
}

std::string ScopePlot::getUnitText(double v) const {
    switch (units) {
    case UNITS_V: return CircuitElm::getVoltageText(v);
    case UNITS_A: return CircuitElm::getCurrentText(v);
    case UNITS_OHMS: return CircuitElm::getUnitText(v, Locale::ohmString);
    case UNITS_W: return CircuitElm::getUnitText(v, "W");
    case UNITS_C: return CircuitElm::getUnitText(v, "C");
    }
    return "";
}

void ScopePlot::assignColor(int count) {
    if (count > 0) {
        color = colors[(count - 1) % 8];
        return;
    }
    switch (units) {
    case UNITS_V:
        color = CircuitElm::positiveColor.getHexValue();
        break;
    case UNITS_A:
        color = CircuitElm::app->options.printable ? "#A0A000" : "#FFFF00";
        break;
    default:
        color = CircuitElm::app->options.printable ? "#000000" : "#FFFFFF";
        break;
    }
}

bool ScopePlot::canAcCouple() const {
    return units == UNITS_V;  // AC coupling is permitted if the plot is displaying volts
}
