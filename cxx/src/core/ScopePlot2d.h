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

class Graphics;
class Scope;

// X/Y and V-vs-I plots.  TODO: port ScopePlot2d.ts; for now this only keeps the state
// that loading and saving need, and draws a placeholder.
class ScopePlot2d {
public:
    static constexpr int DEFAULT_TRAIL_PERSISTENCE = 0;

    explicit ScopePlot2d(Scope *s) : scope(s) {}

    bool enabled = false;
    bool plotXY = false;
    double scaleX = 5, scaleY = 0.1;
    int plotX = 0, plotY = 1;
    int plotBrightness = -1, plotColorR = -1, plotColorG = -1, plotColorB = -1;
    int trailPersistence = DEFAULT_TRAIL_PERSISTENCE;
    double lastTrailSimTime = -1;

    void clearView() {}
    void allocImage() {}
    void timeStep() {}
    void maxScale() {}
    void draw(Graphics &g);
    int validPlotIndex(int idx, int def) const;

private:
    Scope *scope;
};

// FFT display.  TODO: port ScopeFFT.ts
class ScopeFFT {
public:
    explicit ScopeFFT(Scope *s) : scope(s) {}

    bool enabled = false;
    bool logSpectrum = false;
    bool showPhaseAngle = false;

    void show(bool b) { enabled = b; }
    void draw(Graphics &) {}
    void drawVerticalGridLines(Graphics &) {}
    void drawPhaseAngle(Graphics &) {}

private:
    [[maybe_unused]] Scope *scope;
};
