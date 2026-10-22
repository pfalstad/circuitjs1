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

#include <memory>
#include <string>
#include <vector>

#include "FFT.h"

class Graphics;
class Scope;

class ScopeFFT {
public:
    explicit ScopeFFT(Scope *s) : scope(s) {}

    bool enabled = false;
    bool logSpectrum = false;
    bool showPhaseAngle = false;
    double fftMaxMagnitude = 0;
    std::vector<double> fftReal;
    std::vector<double> fftImag;

    void show(bool b);
    void drawVerticalGridLines(Graphics &g);
    void draw(Graphics &g);
    void drawPhaseAngle(Graphics &g);
    void addCursorInfo(std::vector<std::string> &info, double mouseCursorX);

private:
    Scope *scope;
    std::unique_ptr<FFT> fft;
};
