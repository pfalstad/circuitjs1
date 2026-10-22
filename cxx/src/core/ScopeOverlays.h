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

#include <functional>
#include <string>

class Graphics;
class Scope;
class ScopePlot;
class ScopeDataIterator;

// the text drawn over a scope: max/min, scale, RMS, frequency, label, legend
class ScopeOverlays {
public:
    explicit ScopeOverlays(Scope *s) : scope(s) {}

    Scope *scope;
    double textY = 0;

    // true if `lines` more lines of text fit in the scope
    bool hasRoomForText(int lines) const;
    void drawInfoText(Graphics &g, const std::string &text);
    void drawScale(Graphics &g);
    // shared cycle-detection loop for drawAverage, drawRMS, drawDutyCycle.
    // calls onCycleStart at first rising edge, onSample each sample thereafter,
    // onCycleEnd at each subsequent rising edge.  returns end-start span, or 0.
    int iterateCycles(ScopeDataIterator &sdi, double mid, const std::function<void()> &onCycleStart,
                      const std::function<void()> &onSample, const std::function<void()> &onCycleEnd);
    void drawRMS(Graphics &g);
    void drawAverage(Graphics &g);
    void drawDutyCycle(Graphics &g);
    void drawFrequency(Graphics &g);
    void drawElmInfo(Graphics &g);
    // legend showing each plot's color and description, used when multiple plots are combined
    void drawLegend(Graphics &g);
    bool sameLabelAsScopeAbove(const std::string &t) const;
    void draw(Graphics &g);
};
