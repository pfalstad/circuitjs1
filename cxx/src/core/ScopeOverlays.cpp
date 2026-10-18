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

#include "ScopeOverlays.h"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <vector>

#include "CircuitElm.h"
#include "Graphics.h"
#include "Locale.h"
#include "Scope.h"
#include "ScopeManager.h"
#include "SimApp.h"
#include "SimulationManager.h"

bool ScopeOverlays::hasRoomForText(int lines) const {
    return textY + 15 * (lines - 1) <= scope->rect.height * 3 / 4;
}

void ScopeOverlays::drawInfoText(Graphics &g, const std::string &text) {
    if (scope->rect.height <= textY + 5)
        return;
    g.drawString(text, 0, textY);
    textY += 15;
}

void ScopeOverlays::drawScale(Graphics &g) {
    if (scope->rect.height <= textY + 5)
        return;
    std::vector<ScopePlot *> &plots = scope->visiblePlots;
    std::string hs = "H=" + CircuitElm::getUnitText(scope->gridStepX, "s") + "/div";

    // if every plot has the same vertical scale, just show it once
    std::string vs = plots[0]->getUnitText(plots[0]->gridStepY);
    bool sameScale = true;
    for (ScopePlot *p : plots)
        if (p->getUnitText(p->gridStepY) != vs)
            sameScale = false;
    if (sameScale) {
        drawInfoText(g, hs + " V=" + vs + "/div");
        return;
    }
    // in auto mode, plots of different units have no common grid, so just show the time scale
    if (!scope->isManualScale()) {
        drawInfoText(g, hs);
        return;
    }

    // otherwise show the scale of each plot next to a bullet in its color
    double x = 0;
    g.drawString(hs, 0, textY);
    x += g.measureWidth(hs);
    const double bulletWidth = 17;
    for (ScopePlot *p : plots) {
        std::string vScaleText = "=" + p->getUnitText(p->gridStepY) + "/div";
        double vScaleWidth = g.measureWidth(vScaleText);
        if (x + bulletWidth + vScaleWidth > scope->rect.width) {
            x = 0;
            textY += 15;
            if (scope->rect.height <= textY + 5)
                return;
        }
        g.setColor(p->color);
        g.fillOval(x + 7, textY - 9, 8, 8);
        x += bulletWidth;
        g.setColor(CircuitElm::whiteColor);
        g.drawString(vScaleText, x, textY);
        x += vScaleWidth;
    }
    textY += 15;
}

int ScopeOverlays::iterateCycles(ScopeDataIterator &sdi, double mid, const std::function<void()> &onCycleStart,
                                 const std::function<void()> &onSample, const std::function<void()> &onCycleEnd) {
    double fnz = sdi.skipNonzeroValues();
    int state = (fnz > mid) ? 1 : -1;
    int waveCount = 0;
    int start = 0, end = 0;
    for (int i = sdi.begin(); sdi.more(i); i++) {
        bool sw = false;
        if (state == 1) {
            if (sdi.getMax() < mid)
                sw = true;
        } else if (sdi.getMin() > mid)
            sw = true;
        if (sw) {
            state = -state;
            if (state == 1) {
                if (waveCount == 0) {
                    start = i;
                    onCycleStart();
                } else {
                    end = i;
                    onCycleEnd();
                }
                waveCount++;
            }
        }
        if (waveCount > 0)
            onSample();
    }
    return end - start;
}

static ScopeDataIterator makeSdi(Scope *scope, ScopePlot &plot) {
    int ipa = scope->displayStartIndex(plot, (int) scope->rect.width);
    int validCount = scope->validDataCount(plot, ipa, (int) scope->rect.width);
    return ScopeDataIterator(scope->scopePointCount, ipa, validCount, plot);
}

void ScopeOverlays::drawRMS(Graphics &g) {
    if (!scope->canShowRMS()) {
        // backward compatibility: fall back to average
        scope->showRMS = false;
        scope->showAverage = true;
        drawAverage(g);
        return;
    }
    ScopePlot &plot = *scope->visiblePlots[0];
    double mid = (scope->maxValue + scope->minValue) / 2;
    ScopeDataIterator sdi = makeSdi(scope, plot);
    double avg = 0, endAvg = 0;
    int span = iterateCycles(sdi, mid,
        [&] { avg = 0; },
        [&] { double m = (sdi.getMax() + sdi.getMin()) * .5; avg += m * m; },
        [&] { endAvg = avg; });
    if (span > 0)
        drawInfoText(g, plot.getUnitText(std::sqrt(endAvg / span)) + "rms");
}

void ScopeOverlays::drawAverage(Graphics &g) {
    ScopePlot &plot = *scope->visiblePlots[0];
    double mid = (scope->maxValue + scope->minValue) / 2;
    ScopeDataIterator sdi = makeSdi(scope, plot);
    double avg = 0, endAvg = 0;
    int span = iterateCycles(sdi, mid,
        [&] { avg = 0; },
        [&] { avg += (sdi.getMax() + sdi.getMin()) * .5; },
        [&] { endAvg = avg; });
    if (span > 0)
        drawInfoText(g, plot.getUnitText(endAvg / span) + Locale::LS(" average"));
}

void ScopeOverlays::drawDutyCycle(Graphics &g) {
    ScopePlot &plot = *scope->visiblePlots[0];
    double mid = (scope->maxValue + scope->minValue) / 2;
    ScopeDataIterator sdi = makeSdi(scope, plot);
    int dutyLen = 0, prevDuty = 0;
    int span = iterateCycles(sdi, mid,
        [&] { dutyLen = 0; },
        [&] { if (sdi.getMax() > mid) dutyLen++; },
        [&] { prevDuty = dutyLen; });
    if (span > 0)
        drawInfoText(g, Locale::LS("Duty cycle ") + std::to_string((int) std::trunc(100.0 * prevDuty / span)) + "%");
}

void ScopeOverlays::drawFrequency(Graphics &g) {
    ScopePlot &plot = *scope->visiblePlots[0];
    ScopeDataIterator sdi = makeSdi(scope, plot);
    double avg = 0;
    for (int i = sdi.begin(); sdi.more(i); i++)
        avg += sdi.getMin() + sdi.getMax();
    avg /= sdi.validCount * 2;
    int state = 0;
    double thresh = avg * .05;
    int oi = 0;
    double avperiod = 0;
    int periodct = -1;
    double avperiod2 = 0;
    for (int i = sdi.begin(); sdi.more(i); i++) {
        double q = sdi.getMax() - avg;
        int os = state;
        if (q < thresh)
            state = 1;
        else if (q > -thresh)
            state = 2;
        if (state == 2 && os == 1) {
            int pd = i - oi;
            oi = i;
            if (pd < 12)
                continue;
            if (periodct >= 0) {
                avperiod += pd;
                avperiod2 += (double) pd * pd;
            }
            periodct++;
        }
    }
    avperiod /= periodct;
    avperiod2 /= periodct;
    double periodstd = std::sqrt(avperiod2 - avperiod * avperiod);
    double freq = 1 / (avperiod * scope->sim->maxTimeStep * scope->speed);
    if (periodct < 1 || periodstd > 2 || !std::isfinite(freq))
        return;
    drawInfoText(g, CircuitElm::getUnitText(freq, "Hz"));
}

void ScopeOverlays::drawElmInfo(Graphics &g) {
    std::vector<std::string> info(10);
    scope->getElm()->getInfo(info);
    for (size_t i = 0; i < info.size() && !info[i].empty(); i++)
        drawInfoText(g, info[i]);
}

// true if this scope is stacked under another scope with the same label, so we
// don't repeat it (e.g. several stacked "logic output" scopes)
bool ScopeOverlays::sameLabelAsScopeAbove(const std::string &t) const {
    if (scope->position < 0 || scope->exporting)
        return false;
    ScopeManager *mgr = scope->app->scopeManager;
    int i = -1;
    for (int j = 0; j < mgr->scopeCount; j++)
        if (mgr->scopes[j].get() == scope)
            i = j;
    if (i <= 0)
        return false;
    Scope *above = mgr->scopes[i - 1].get();
    return above->position == scope->position && above->getScopeLabelOrText(true) == t;
}

void ScopeOverlays::drawLegend(Graphics &g) {
    std::vector<ScopePlot *> &plots = scope->visiblePlots;
    std::vector<size_t> order(plots.size());
    std::iota(order.begin(), order.end(), 0);
    // in manual mode, plots may be vertically displaced; list them top to bottom
    // in the order they appear (stable sort keeps original order for ties)
    if (scope->manualScale)
        std::stable_sort(order.begin(), order.end(),
                         [&](size_t a, size_t b) { return plots[b]->manVPosition < plots[a]->manVPosition; });
    for (size_t i : order) {
        if (scope->rect.height <= textY + 5)
            return;
        ScopePlot *plot = plots[i];
        std::string label = (plot->elm != nullptr) ? Locale::LS(plot->elm->getScopeText(plot->value))
                                                   : "Plot " + std::to_string(i + 1);
        g.setColor(plot->color);
        g.fillRect(0, textY - 9, 10, 10);
        g.setColor(CircuitElm::whiteColor);
        g.drawString(label, 16, textY);
        textY += 15;
    }
}

void ScopeOverlays::draw(Graphics &g) {
    g.setColor(CircuitElm::whiteColor);
    textY = 10;
    if (scope->visiblePlots.empty()) {
        if (scope->showElmInfo)
            drawElmInfo(g);
        return;
    }
    ScopePlot &plot = *scope->visiblePlots[0];
    if (scope->showScale)
        drawScale(g);
    if (scope->showMax)
        drawInfoText(g, "Max=" + plot.getUnitText(scope->maxValue));
    if (scope->showMin) {
        double ym = scope->rect.height - 5;
        g.drawString("Min=" + plot.getUnitText(scope->minValue), 0, ym);
    }
    if (scope->showP2P)
        drawInfoText(g, "P-P=" + plot.getUnitText(scope->maxValue - scope->minValue));
    if (scope->showRMS)
        drawRMS(g);
    if (scope->showAverage)
        drawAverage(g);
    if (scope->showDutyCycle)
        drawDutyCycle(g);
    std::string t = scope->getScopeLabelOrText(true);
    if (!t.empty()) {
        if (!sameLabelAsScopeAbove(t) && (scope->text || hasRoomForText(1)))
            drawInfoText(g, t);
    } else if (scope->visiblePlots.size() > 1 && hasRoomForText((int) scope->visiblePlots.size()))
        drawLegend(g);
    if (scope->showFreq)
        drawFrequency(g);
    if (scope->showElmInfo)
        drawElmInfo(g);
    if (scope->fftPlot.showPhaseAngle)
        scope->fftPlot.drawPhaseAngle(g);
}
