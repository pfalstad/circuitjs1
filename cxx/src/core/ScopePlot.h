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

#include <string>
#include <vector>

class CircuitElm;

// one trace in a scope: a ring buffer of min/max values per pixel column
class ScopePlot {
public:
    // The buffers timeStep() records into. Everything outside this class except ScopeTrigger's
    // edge detection reads minValues()/maxValues() instead (see below).
    std::vector<double> liveMin;
    std::vector<double> liveMax;
    int scopePointCount = 0;
    int ptr = 0;  // ptr is pointer to the current sample
    int value = 0;  // Value - the property being shown - e.g. VAL_CURRENT
    // scopePlotSpeed is in sim timestep units per pixel
    int scopePlotSpeed = 0;
    int units;
    double lastUpdateTime = 0;
    double lastValue = 0;
    std::string color = "#FFFFFF";
    CircuitElm *elm;
    // Has a manual scale in "/div" format been put in by the user (as opposed to being
    // inferred from a "MaxValue" format or from an automatically calculated scale)?
    bool manScaleSet = false;
    double manScale = 1.0;  // Units per division
    int manVPosition = 0;  // 0 is center of screen. +V_POSITION_STEPS/2 is top of screen
    double gridMult = 0;
    double gridStepY = 0;  // units per vertical division, set by Scope::calcGridParams
    double plotOffset = 0;
    bool acCoupled = false;
    double acAlpha = 0.9999;  // Filter coefficient for AC coupling
    double acDc = 0;  // DC level removed by AC coupling filter (the coupling capacitor's voltage)
    long acCount = 0;  // samples since filter was reset, for fast start

    static constexpr int FLAG_AC = 1;
    static const char *const colors[8];

    ScopePlot(CircuitElm *e, int u);
    ScopePlot(CircuitElm *e, int u, int v, double manS);

    int startIndex(int w) const { return ptr + scopePointCount - w; }
    void reset(int spc, int sp, bool full);
    void timeStep();
    std::string getUnitText(double v) const;
    void assignColor(int count);
    void setAcCoupled(bool b) { acCoupled = canAcCouple() && b; }
    bool canAcCouple() const;
    bool isAcCoupled() const { return acCoupled; }
    int getPlotFlags() const { return acCoupled ? FLAG_AC : 0; }

    // What the display shows: the frozen trigger snapshot if there is one, else live data.
    const std::vector<double> &minValues() const { return frozen ? frozenMin : liveMin; }
    const std::vector<double> &maxValues() const { return frozen ? frozenMax : liveMax; }
    void freeze() {
        frozenMin = liveMin;
        frozenMax = liveMax;
        frozen = true;
    }
    void thaw() { frozen = false; }

private:
    // Snapshot of liveMin/liveMax taken by ScopeTrigger once a triggered sweep has been fully
    // captured. The live buffer has to keep recording (the next trigger needs pre-trigger
    // history), so without this the displayed sweep gets overwritten as soon as the write pointer
    // laps it - long before a rare trigger event comes around again.
    std::vector<double> frozenMin;
    std::vector<double> frozenMax;
    bool frozen = false;  // false means show live data
};

// iterates over the valid samples of a plot, oldest first (ScopeDataIterator.ts)
class ScopeDataIterator {
public:
    const ScopePlot &plot;
    int ipa;
    int validCount;
    int currentIp = 0;
    int startIndex = 0;
    int scopePointCount;

    ScopeDataIterator(int spc, int ipa_, int validCount_, const ScopePlot &p)
        : plot(p), ipa(ipa_), validCount(validCount_), scopePointCount(spc) {}

    double skipNonzeroValues() {
        for (; startIndex < validCount; startIndex++) {
            int ip = (startIndex + ipa) & (scopePointCount - 1);
            if (plot.maxValues()[ip] != 0)
                return plot.maxValues()[ip];
        }
        return 0;
    }

    double getMin() const { return plot.minValues()[currentIp]; }
    double getMax() const { return plot.maxValues()[currentIp]; }

    // for (int i = sdi.begin(); sdi.more(i); i++) -- sets currentIp as it goes
    int begin() const { return startIndex; }
    bool more(int i) {
        if (i >= validCount)
            return false;
        currentIp = (i + ipa) & (scopePointCount - 1);
        return true;
    }
};
