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

#include "ScopeFFT.h"

#include <cmath>

#include "CircuitElm.h"
#include "Graphics.h"
#include "JsMath.h"
#include "JsNumber.h"
#include "Locale.h"
#include "Scope.h"
#include "ScopeConstants.h"
#include "SimulationManager.h"

using namespace ScopeConstants;

void ScopeFFT::show(bool b) {
    enabled = b;
    if (!enabled)
        fft.reset();
}

void ScopeFFT::drawVerticalGridLines(Graphics &g) {
    double prevEnd = 0;
    const int divs = 20;
    double maxFrequency = 1 / (scope->sim->maxTimeStep * scope->speed * divs * 2);
    for (int i = 0; i < divs; i++) {
        int x = (int) std::floor(scope->rect.width * i / divs);
        if (x < prevEnd)
            continue;
        std::string s = jsNumberToString(jsmath::round(i * maxFrequency)) + "Hz";
        double sWidth = std::ceil(g.measureWidth(s));
        prevEnd = x + sWidth + 4;
        if (i > 0) {
            g.setColor("#880000");
            g.drawLine(x, 0, x, scope->rect.height);
        }
        g.setColor("#FF0000");
        g.drawString(s, x + 2, scope->rect.height);
    }
}

void ScopeFFT::draw(Graphics &g) {
    int n = scope->scopePointCount;
    if (fft == nullptr || fft->getSize() != n)
        fft = std::make_unique<FFT>(n);
    std::vector<double> real(n, 0.0);
    std::vector<double> imag(n, 0.0);
    ScopePlot &plot = scope->visiblePlots.empty() ? *scope->plots[0] : *scope->visiblePlots[0];
    const std::vector<double> &maxV = plot.maxValues;
    const std::vector<double> &minV = plot.minValues;
    int ptr = plot.ptr;
    for (int i = 0; i < n; i++) {
        int ii = (ptr - i + n) & (n - 1);
        // average max and min to prevent DC spike from masking rest of spectrum
        real[i] = 0.5 * (maxV[ii] + minV[ii]);
        imag[i] = 0;
    }
    fft->fft(real, imag, true);
    double maxM = 1e-8;
    for (int i = 0; i < n / 2; i++) {
        double m = fft->magnitude(real[i], imag[i]);
        if (m > maxM)
            maxM = m;
    }
    fftMaxMagnitude = maxM;
    int prevX = 0;
    g.setColor("#FF0000");
    if (!logSpectrum) {
        int prevHeight = 0;
        double y = (scope->rect.height - 1) - 12;
        for (int i = 0; i < n / 2; i++) {
            int x = (int) std::floor(2.0 * i * scope->rect.width / n);
            double magnitude = fft->magnitude(real[i], imag[i]);
            int height = (int) std::floor((magnitude * y) / maxM);
            if (x != prevX)
                g.drawLine(prevX, y - prevHeight, x, y - height);
            prevHeight = height;
            prevX = x;
        }
    } else {
        const double dbRange = 80;
        const double topMargin = 5;
        const double bottomMargin = 12;
        double plotHeight = scope->rect.height - topMargin - bottomMargin;
        double pixelsPerDb = plotHeight / dbRange;
        double prevY = 0;
        for (int db = -20; db >= -80; db -= 20) {
            double y = topMargin + std::floor(-db * pixelsPerDb);
            if (y < 0 || y >= scope->rect.height)
                continue;
            g.setColor("#880000");
            g.drawLine(0, y, scope->rect.width, y);
            g.setColor("#FF0000");
            g.drawString(std::to_string(db) + " dB", 2, y - 2);
        }
        g.setColor("#FF0000");
        for (int i = 0; i < n / 2; i++) {
            int x = (int) std::floor(2.0 * i * scope->rect.width / n);
            double magnitude = fft->magnitude(real[i], imag[i]);
            double db = 20 * jsmath::log(magnitude / maxM) / jsmath::log(10);
            if (db < -dbRange)
                db = -dbRange;
            double y = topMargin + std::floor(-db * pixelsPerDb);
            if (x != prevX)
                g.drawLine(prevX, prevY, x, y);
            prevY = y;
            prevX = x;
        }
    }
    fftReal = std::move(real);
    fftImag = std::move(imag);
}

void ScopeFFT::drawPhaseAngle(Graphics &g) {
    ScopePlot *vPlot = nullptr;
    ScopePlot *iPlot = nullptr;
    for (ScopePlot *p : scope->visiblePlots) {
        if (p->units == UNITS_V) {
            if (vPlot != nullptr)
                return;
            vPlot = p;
        } else if (p->units == UNITS_A) {
            if (iPlot != nullptr)
                return;
            iPlot = p;
        } else
            return;
    }
    if (vPlot == nullptr || iPlot == nullptr)
        return;
    int n = scope->scopePointCount;
    if (fft == nullptr || fft->getSize() != n)
        fft = std::make_unique<FFT>(n);
    std::vector<double> vReal(n, 0.0), vImag(n, 0.0), iReal(n, 0.0), iImag(n, 0.0);
    int ipa = scope->displayStartIndex(*vPlot, (int) scope->rect.width);
    int validCount = scope->validDataCount(*vPlot, ipa, (int) scope->rect.width);
    for (int i = 0; i < validCount; i++) {
        int ip = (i + ipa) & (n - 1);
        vReal[i] = 0.5 * (vPlot->maxValues[ip] + vPlot->minValues[ip]);
        iReal[i] = 0.5 * (iPlot->maxValues[ip] + iPlot->minValues[ip]);
    }
    fft->fft(vReal, vImag, true);
    fft->fft(iReal, iImag, true);
    int fund = 1;
    double maxM = 0;
    for (int i = 1; i < n / 2; i++) {
        double m = fft->magnitude(vReal[i], vImag[i]);
        if (m > maxM) {
            maxM = m;
            fund = i;
        }
    }
    if (maxM < 1e-8)
        return;
    double angleV = jsmath::atan2(vImag[fund], vReal[fund]);
    double angleI = jsmath::atan2(iImag[fund], iReal[fund]);
    double angle = (angleV - angleI) * 180 / M_PI;
    while (angle > 180)
        angle -= 360;
    while (angle < -180)
        angle += 360;
    scope->drawInfoText(g, Locale::LS("Phase angle: ") + CircuitElm::showFormat.format(angle) + "°");
}

void ScopeFFT::addCursorInfo(std::vector<std::string> &info, double mouseCursorX) {
    double maxFrequency = 1 / (scope->sim->maxTimeStep * scope->speed * 2);
    info.push_back(CircuitElm::getUnitText(maxFrequency * (mouseCursorX - scope->rect.x) / scope->rect.width, "Hz"));
    if (fft != nullptr && !fftReal.empty() && fftMaxMagnitude > 0) {
        int fftIndex = (int) std::floor((mouseCursorX - scope->rect.x) * scope->scopePointCount / (2 * scope->rect.width));
        if (fftIndex >= 0 && fftIndex < scope->scopePointCount / 2) {
            double mag = fft->magnitude(fftReal[fftIndex], fftImag[fftIndex]);
            double db = 20 * jsmath::log(mag / fftMaxMagnitude) / jsmath::log(10);
            info.push_back(jsNumberToString(jsmath::round(db)) + " dB");
        }
    }
}
