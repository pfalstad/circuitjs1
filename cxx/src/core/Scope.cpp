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

#include "Scope.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include "CircuitElm.h"
#include "Graphics.h"
#include "JsMath.h"
#include "Locale.h"
#include "ScopeManager.h"
#include "ScopeOverlays.h"
#include "ScopeSerializer.h"
#include "SimApp.h"
#include "SimulationManager.h"

using namespace ScopeConstants;

int Scope::lastManDivisions = 8;
double Scope::cursorTime = -1;
double Scope::dragStartTime = -1;
int Scope::cursorUnits = 0;
Scope *Scope::cursorScope = nullptr;
Scope *Scope::draggingPlotYScope = nullptr;

Scope::Scope(SimApp *app_, SimulationManager *sim_)
    : plot2d(this), fftPlot(this), app(app_), sim(sim_) {
    position = -1;
    manDivisions = lastManDivisions;
    rect = Rectangle(0, 0, 1, 1);
    overlays = std::make_unique<ScopeOverlays>(this);
    serializer = std::make_unique<ScopeSerializer>(this);
    initialize();
}

Scope::~Scope() {
    if (cursorScope == this)
        cursorScope = nullptr;
    if (draggingPlotYScope == this)
        draggingPlotYScope = nullptr;
}

void Scope::showCurrent(bool b) {
    showI = b;
    if (b && !hasPlotValue(VAL_CURRENT)) {
        CircuitElm *ce = getElm();
        if (ce != nullptr)
            plots.push_back(std::make_unique<ScopePlot>(ce, UNITS_A, VAL_CURRENT, getManScaleFromMaxScale(UNITS_A, false)));
    }
    calcVisiblePlots();
    resetGraph();
}

void Scope::showVoltage(bool b) {
    showV = b;
    if (b && !hasPlotValue(VAL_VOLTAGE)) {
        CircuitElm *ce = getElm();
        if (ce != nullptr)
            plots.push_back(std::make_unique<ScopePlot>(ce, UNITS_V, VAL_VOLTAGE, getManScaleFromMaxScale(UNITS_V, false)));
    }
    calcVisiblePlots();
    resetGraph();
}

bool Scope::hasPlotValue(int v) const {
    for (auto &p : plots)
        if (p->value == v)
            return true;
    return false;
}

void Scope::showPlotValue(int val, bool b) {
    if (b) {
        if (!hasPlotValue(val)) {
            CircuitElm *ce = getElm();
            if (ce != nullptr) {
                int u = ce->getScopeUnits(val);
                plots.push_back(std::make_unique<ScopePlot>(ce, u, val, getManScaleFromMaxScale(u, false)));
            }
        }
    } else {
        for (int i = (int) plots.size() - 1; i >= 0; i--) {
            if (plots[i]->value == val && plots.size() > 1)
                plots.erase(plots.begin() + i);
        }
    }
    calcVisiblePlots();
    resetGraph();
}

void Scope::setManualScale(bool value, bool roundup) {
    if (value != manualScale)
        plot2d.clearView();
    manualScale = value;
    for (auto &p : plots) {
        if (!p->manScaleSet) {
            p->manScale = getManScaleFromMaxScale(p->units, roundup);
            p->manVPosition = 0;
            p->manScaleSet = true;
        }
    }
}

void Scope::resetGraphFull(bool full) {
    scopePointCount = 1;
    while (scopePointCount <= rect.width)
        scopePointCount *= 2;
    // Double buffer for trigger mode to prevent overwriting displayed data
    if (trigger.isActive())
        scopePointCount *= 2;
    showNegative = false;
    for (auto &p : plots)
        p->reset(scopePointCount, speed, full);
    calcVisiblePlots();
    scopeTimeStep = sim->maxTimeStep;
    plot2d.allocImage();
    trigger.reset(scopePointCount);
    plot2d.lastTrailSimTime = -1;
}

void Scope::setManualScaleValue(int plotId, double d) {
    if (plotId >= (int) visiblePlots.size())
        return;  // Shouldn't happen, but just in case...
    plot2d.clearView();
    visiblePlots[plotId]->manScale = d;
    visiblePlots[plotId]->manScaleSet = true;
}

double Scope::getScaleValue() const {
    if (visiblePlots.empty())
        return 0;
    return scale[visiblePlots[0]->units];
}

std::string Scope::getScaleUnitsText() const {
    if (visiblePlots.empty())
        return "V";
    return getScaleUnitsTextStatic(visiblePlots[0]->units);
}

std::string Scope::getScaleUnitsTextStatic(int units) {
    switch (units) {
    case UNITS_A: return "A";
    case UNITS_OHMS: return Locale::ohmString;
    case UNITS_W: return "W";
    case UNITS_C: return "C";
    default: return "V";
    }
}

void Scope::checkTrigger() {
    trigger.check(visiblePlots, plot2d.enabled, sim, scopePointCount, (int) rect.width);
}

void Scope::setTriggerMode(int mode) {
    trigger.mode = mode;
    resetGraph();
}

void Scope::initialize() {
    resetGraph();
    scale[UNITS_W] = scale[UNITS_OHMS] = scale[UNITS_V] = scale[UNITS_C] = 5;
    scale[UNITS_A] = 0.1;
    plot2d.scaleX = 5;
    plot2d.scaleY = 0.1;
    plot2d.enabled = false;
    speed = 64;
    showMax = true;
    showV = showI = false;
    showScale = showFreq = manualScale = showMin = showP2P = showElmInfo = false;
    fftPlot.enabled = false;
    if (!serializer->loadDefaults()) {
        // set showV and showI appropriately depending on what plots are present
        for (auto &plot : plots) {
            if (plot->units == UNITS_V)
                showV = true;
            if (plot->units == UNITS_A)
                showI = true;
        }
    }
}

void Scope::calcVisiblePlots() {
    visiblePlots.clear();
    int vc = 0, ac = 0, oc = 0;
    if (!plot2d.enabled) {
        for (auto &pp : plots) {
            ScopePlot *plot = pp.get();
            if (plot->value == VAL_VOLTAGE) {
                if (showV) {
                    visiblePlots.push_back(plot);
                    plot->assignColor(vc++);
                }
            } else if (plot->value == VAL_CURRENT) {
                if (showI) {
                    visiblePlots.push_back(plot);
                    plot->assignColor(ac++);
                }
            } else {
                visiblePlots.push_back(plot);
                plot->assignColor(oc++);
            }
        }
    } else {  // In 2D mode show all plots so scales can be adjusted for any
        for (auto &pp : plots)
            visiblePlots.push_back(pp.get());
    }
}

void Scope::setRect(const Rectangle &r) {
    double w = rect.width;
    double h = rect.height;
    rect = r;
    if (rect.width != w || (plot2d.plotXY && rect.height != h))
        resetGraph();
}

void Scope::setElm(CircuitElm *ce) {
    plots.clear();
    visiblePlots.clear();
    if (ce != nullptr && ce->isTransistorElm())
        setValue(VAL_VCE, ce);
    else
        setValue(0, ce);
    initialize();
}

void Scope::addElm(CircuitElm *ce) {
    if (ce->isTransistorElm())
        addValue(VAL_VCE, ce);
    else
        addValue(0, ce);
}

void Scope::setValueNum(int val) {
    if (plots.size() > 2 || plots.empty())
        return;
    CircuitElm *ce = plots[0]->elm;
    if (plots.size() == 2 && plots[1]->elm != ce)
        return;
    plot2d.enabled = plot2d.plotXY = false;
    setValue(val, ce);
}

void Scope::addValue(int val, CircuitElm *ce) {
    if (val == 0) {
        plots.push_back(std::make_unique<ScopePlot>(ce, UNITS_V, VAL_VOLTAGE, getManScaleFromMaxScale(UNITS_V, false)));

        // create plot for current if applicable
        if (ce != nullptr && app->options.dots && !ce->isOutputElm() && !ce->isLogicOutputElm() &&
            !ce->isAudioOutputElm() && !ce->isTestPointElm() && !ce->isProbeElm())
            plots.push_back(std::make_unique<ScopePlot>(ce, UNITS_A, VAL_CURRENT, getManScaleFromMaxScale(UNITS_A, false)));
    } else {
        if (ce == nullptr)
            return;
        int u = ce->getScopeUnits(val);
        plots.push_back(std::make_unique<ScopePlot>(ce, u, val, getManScaleFromMaxScale(u, false)));
        if (u == UNITS_V)
            showV = true;
        if (u == UNITS_A)
            showI = true;
    }
    calcVisiblePlots();
    resetGraph();
}

void Scope::setValue(int val, CircuitElm *ce) {
    plots.clear();
    visiblePlots.clear();
    addValue(val, ce);
}

void Scope::setValues(int val, int ival, CircuitElm *ce, CircuitElm *yelm) {
    if (ival > 0) {
        plots.clear();
        visiblePlots.clear();
        if (ce == nullptr)
            return;
        plots.push_back(std::make_unique<ScopePlot>(ce, ce->getScopeUnits(val), val, getManScaleFromMaxScale(ce->getScopeUnits(val), false)));
        plots.push_back(std::make_unique<ScopePlot>(ce, ce->getScopeUnits(ival), ival, getManScaleFromMaxScale(ce->getScopeUnits(ival), false)));
        return;
    }
    if (yelm != nullptr) {
        plots.clear();
        visiblePlots.clear();
        if (ce == nullptr)
            return;
        plots.push_back(std::make_unique<ScopePlot>(ce, ce->getScopeUnits(val), 0, getManScaleFromMaxScale(ce->getScopeUnits(val), false)));
        plots.push_back(std::make_unique<ScopePlot>(yelm, ce->getScopeUnits(ival), 0, getManScaleFromMaxScale(ce->getScopeUnits(val), false)));
        return;
    }
    setValueNum(val);
}

bool Scope::showingValue(int v) const {
    for (auto &sp : plots)
        if (sp->value != v)
            return false;
    return true;
}

bool Scope::showingVoltageAndMaybeCurrent() const {
    bool gotv = false;
    for (auto &sp : plots) {
        if (sp->value == VAL_VOLTAGE)
            gotv = true;
        else if (sp->value != VAL_CURRENT && sp->value != VAL_CHARGE)
            return false;
    }
    return gotv;
}

void Scope::setPlotsTo(const std::vector<ScopePlot *> &newOrder, std::vector<std::unique_ptr<ScopePlot>> *other) {
    std::vector<std::unique_ptr<ScopePlot>> result;
    auto take = [&](ScopePlot *p) {
        for (auto *list : {&plots, other}) {
            if (list == nullptr)
                continue;
            for (auto &up : *list)
                if (up.get() == p) {
                    result.push_back(std::move(up));
                    return;
                }
        }
    };
    for (ScopePlot *p : newOrder)
        take(p);
    plots = std::move(result);
}

void Scope::combine(Scope &s) {
    std::vector<ScopePlot *> order = visiblePlots;
    order.insert(order.end(), s.visiblePlots.begin(), s.visiblePlots.end());
    setPlotsTo(order, &s.plots);
    s.plots.clear();
    s.visiblePlots.clear();
    calcVisiblePlots();
}

int Scope::separate(std::vector<std::unique_ptr<Scope>> &arr, int pos) {
    ScopePlot *lastPlot = nullptr;
    for (size_t i = 0; i != visiblePlots.size(); i++) {
        if (pos >= (int) arr.size())
            return pos;
        ScopePlot *sp = visiblePlots[i];
        if (lastPlot != nullptr && lastPlot->elm == sp->elm && lastPlot->value == VAL_VOLTAGE && sp->value == VAL_CURRENT)
            continue;
        auto s = std::make_unique<Scope>(app, sim);
        s->setValue(sp->value, sp->elm);
        s->position = pos;
        s->serializer->setFlags(serializer->getFlags());
        s->setSpeed(speed);
        arr[pos++] = std::move(s);
        lastPlot = sp;
    }
    return pos;
}

void Scope::removePlot(int plot) {
    if (plot >= 0 && plot < (int) visiblePlots.size()) {
        ScopePlot *p = visiblePlots[plot];
        for (size_t i = 0; i < plots.size(); i++)
            if (plots[i].get() == p) {
                plots.erase(plots.begin() + i);
                break;
            }
        calcVisiblePlots();
    }
}

void Scope::timeStep() {
    for (auto &p : plots)
        p->timeStep();

    checkTrigger();

    // For 2d plots we draw here rather than in the drawing routine
    if (plot2d.enabled)
        plot2d.timeStep();
}

void Scope::setMaxScale(bool s) {
    // This procedure is added to set maxscale to an explicit value instead of just having a toggle
    // We call the toggle procedure first because it has useful side-effects and then set the value explicitly.
    maxScaleToggle();
    maxScale = s;
}

void Scope::maxScaleToggle() {
    if (plot2d.enabled) {
        plot2d.maxScale();
        return;
    }
    // toggle max scale.  This isn't on by default because, for the examples, we sometimes want two plots
    // matched to the same scale so we can show one is larger.  Also, for some fast-moving scopes
    // (like for AM detector), the amplitude varies over time but you can't see that if the scale is
    // constantly adjusting.  It's also nice to set the default scale to hide noise and to avoid
    // having the scale moving around a lot when a circuit starts up.
    maxScale = !maxScale;
    showNegative = false;
}

void Scope::drawSettingsWheel(Graphics &g) {
    const int outR = 8;
    const int inR = 5;
    const int inR45 = 4;
    const int outR45 = 6;
    if (showSettingsWheel()) {
        g.saveState();
        if (cursorInSettingsWheel())
            g.setColor(CircuitElm::selectColor);
        else
            g.setColor(Color::dark_gray);
        g.translate(rect.x + 18, rect.y + rect.height - 18);
        CircuitElm::drawThickCircle(g, 0, 0, inR);
        CircuitElm::drawThickLine(g, -outR, 0, -inR, 0);
        CircuitElm::drawThickLine(g, outR, 0, inR, 0);
        CircuitElm::drawThickLine(g, 0, -outR, 0, -inR);
        CircuitElm::drawThickLine(g, 0, outR, 0, inR);
        CircuitElm::drawThickLine(g, -outR45, -outR45, -inR45, -inR45);
        CircuitElm::drawThickLine(g, outR45, -outR45, inR45, -inR45);
        CircuitElm::drawThickLine(g, -outR45, outR45, -inR45, inR45);
        CircuitElm::drawThickLine(g, outR45, outR45, inR45, inR45);
        g.restoreState();
    }
}

bool Scope::cursorInSettingsWheel() const {
    return showSettingsWheel() &&
        app->mouseCursorX >= rect.x &&
        app->mouseCursorX <= rect.x + 36 &&
        app->mouseCursorY >= rect.y + rect.height - 36 &&
        app->mouseCursorY <= rect.y + rect.height;
}

void Scope::checkForSelectionElsewhere() {
    // if mouse is here, then selection is already set by checkForSelection()
    if (cursorScope == this)
        return;
    // don't hijack the plot being dragged
    if (draggingPlotY)
        return;

    if (cursorScope == nullptr || visiblePlots.empty()) {
        selectedPlot = -1;
        return;
    }

    // find a plot with same units as selected plot
    for (size_t i = 0; i != visiblePlots.size(); i++) {
        if (visiblePlots[i]->units == cursorUnits) {
            selectedPlot = (int) i;
            return;
        }
    }

    // default if we can't find anything with matching units
    selectedPlot = 0;
}

void Scope::drawImpl(Graphics &g, bool forExport) {
    if (plots.empty())
        return;

    // reset if timestep changed
    if (scopeTimeStep != sim->maxTimeStep) {
        scopeTimeStep = sim->maxTimeStep;
        resetGraph();
    }

    if (plot2d.enabled) {
        plot2d.draw(g);
        return;
    }

    if (!forExport)
        drawSettingsWheel(g);
    g.saveState();
    g.setColor(Color::red);
    g.translate(rect.x, rect.y);
    g.clipRect(0, 0, rect.width, rect.height);

    if (fftPlot.enabled) {
        fftPlot.drawVerticalGridLines(g);
        fftPlot.draw(g);
    }

    for (int i = 0; i != UNITS_COUNT; i++) {
        reduceRange[i] = false;
        if (maxScale && !manualScale)
            scale[i] = 1e-4;
    }

    somethingSelected = false;  // is one of our plots selected?

    for (ScopePlot *plot : visiblePlots) {
        calcPlotScale(*plot);
        if (app->scopeManager->scopeSelected == -1 && plot->elm != nullptr && plot->elm->isMouseElm() && !exporting)
            somethingSelected = true;
        reduceRange[plot->units] = true;
    }

    bool sel = app->scopeManager->scopeMenuIsSelected(this) && !exporting;

    bool somethingSelectedHere = somethingSelected;

    if (!exporting)
        checkForSelectionElsewhere();
    if (selectedPlot >= 0)
        somethingSelected = true;

    if (!forExport && (somethingSelectedHere || sel)) {
        g.saveState();
        g.setGlobalAlpha(0.15);
        g.setColor(CircuitElm::selectColor);
        g.fillRect(0, 0, rect.width, rect.height);
        g.restoreState();
    }
    if (getSingleElm() != nullptr)
        somethingSelected = false;

    drawGridLines = true;
    bool allPlotsSameUnits = true;
    for (size_t i = 1; i < visiblePlots.size(); i++) {
        if (visiblePlots[i]->units != visiblePlots[0]->units)
            allPlotsSameUnits = false;  // Don't draw horizontal grid lines unless all plots are in same units
    }

    if ((allPlotsSameUnits || showMax || showMin || showP2P) && !visiblePlots.empty())
        calcMaxAndMin(visiblePlots[0]->units);

    // draw volt plots on top (last), then current plots underneath, then everything else
    int n = (int) visiblePlots.size();
    for (int i = 0; i != n; i++)
        if (visiblePlots[i]->units > UNITS_A && i != selectedPlot)
            drawPlot(g, *visiblePlots[i], allPlotsSameUnits, false, sel);
    for (int i = 0; i != n; i++)
        if (visiblePlots[i]->units == UNITS_A && i != selectedPlot)
            drawPlot(g, *visiblePlots[i], allPlotsSameUnits, false, sel);
    for (int i = 0; i != n; i++)
        if (visiblePlots[i]->units == UNITS_V && i != selectedPlot)
            drawPlot(g, *visiblePlots[i], allPlotsSameUnits, false, sel);
    // draw selection on top.  only works if selection chosen from scope
    if (selectedPlot >= 0 && selectedPlot < n)
        drawPlot(g, *visiblePlots[selectedPlot], allPlotsSameUnits, true, sel);

    drawTriggerIndicator(g);
    overlays->draw(g);

    g.restore();

    if (!forExport)
        drawCursor(g);

    if (plots[0]->ptr > 5 && !manualScale) {
        for (int i = 0; i != UNITS_COUNT; i++)
            if (scale[i] > 1e-4 && reduceRange[i])
                scale[i] /= 2;
    }
    // TODO: refresh the properties dialog
}

void Scope::calcMaxAndMin(int units) {
    maxValue = -1e8;
    minValue = 1e8;
    for (ScopePlot *plot : visiblePlots) {
        if (plot->units != units)
            continue;
        int ipa = displayStartIndex(*plot, (int) rect.width);
        int validCount = validDataCount(*plot, ipa, (int) rect.width);
        ScopeDataIterator sdi(scopePointCount, ipa, validCount, *plot);
        for (int i = sdi.begin(); sdi.more(i); i++) {
            if (sdi.getMax() > maxValue)
                maxValue = sdi.getMax();
            if (sdi.getMin() < minValue)
                minValue = sdi.getMin();
        }
    }
}

void Scope::calcPlotScale(ScopePlot &plot) {
    if (manualScale)
        return;
    double max = 0;
    double gridMax = scale[plot.units];
    int ipa = displayStartIndex(plot, (int) rect.width);
    int validCount = validDataCount(plot, ipa, (int) rect.width);
    ScopeDataIterator sdi(scopePointCount, ipa, validCount, plot);
    for (int i = sdi.begin(); sdi.more(i); i++) {
        if (sdi.getMax() > max)
            max = sdi.getMax();
        if (sdi.getMin() < -max)
            max = -sdi.getMin();
    }
    // scale fixed at maximum?
    if (maxScale)
        gridMax = std::max(max, gridMax);
    else
        // adjust in powers of two
        while (max > gridMax)
            gridMax *= 2;
    scale[plot.units] = gridMax;
}

double Scope::calcGridStepX() const {
    int multptr = 0;
    double gsx = 1e-15;

    double ts = sim->maxTimeStep * speed;
    while (gsx < ts * 20)
        gsx *= multa[(multptr++) % 3];
    return gsx;
}

double Scope::getGridMaxFromManScale(const ScopePlot &plot) const {
    return (manDivisions / 2.0 + 0.05) * plot.manScale;
}

double Scope::calcGridParams(ScopePlot &plot, bool allPlotsSameUnits) {
    int maxy = (int) std::trunc((rect.height - 1) / 2);
    double gridMid, positionOffset, gridMax;
    if (!isManualScale()) {
        gridMax = scale[plot.units];
        gridMid = 0;
        positionOffset = 0;
        if (allPlotsSameUnits) {
            // if we don't have overlapping scopes of different units, we can move zero around.
            // Put it at the bottom if the scope is never negative.
            double mx = gridMax;
            double mn = 0;
            if (maxScale) {
                // scale is maxed out, so fix boundaries of scope at maximum and minimum.
                mx = maxValue;
                mn = minValue;
            } else if (showNegative || minValue < (mx + mn) * 0.5 - (mx - mn) * 0.55) {
                mn = -gridMax;
                showNegative = true;
            }
            gridMid = (mx + mn) * 0.5;
            gridMax = (mx - mn) * 0.55;  // leave space at top and bottom
        }
        gridStepY = 1e-8;
        int multptr = 0;
        while (gridStepY < 20 * gridMax / maxy)
            gridStepY *= multa[(multptr++) % 3];
    } else {
        gridMid = 0;
        gridMax = getGridMaxFromManScale(plot);
        positionOffset = gridMax * 2.0 * plot.manVPosition / V_POSITION_STEPS;
        gridStepY = plot.manScale;
    }
    plot.plotOffset = -gridMid + positionOffset;
    plot.gridMult = maxy / gridMax;
    return gridMid;
}

void Scope::drawHVGridLines(Graphics &g, ScopePlot &plot, double gridMid, bool allPlotsSameUnits, bool allSelected) {
    int maxy = (int) std::trunc((rect.height - 1) / 2);
    std::string minorDiv = "#404040";
    std::string majorDiv = "#A0A0A0";
    if (app->isPrintable()) {
        minorDiv = "#D0D0D0";
        majorDiv = "#808080";
        curColor = "#A0A000";
    }
    if (allSelected)
        majorDiv = CircuitElm::selectColor.getHexValue();
    bool highlightCenter = !isManualScale();

    // horizontal gridlines; only show non-center lines if units are unambiguous
    bool showHGridLines = (gridStepY != 0) && (isManualScale() || allPlotsSameUnits);
    for (int ll = -100; ll <= 100; ll++) {
        if (ll != 0 && !showHGridLines)
            continue;
        double yl = maxy - (ll * gridStepY - gridMid) * plot.gridMult;
        if (yl < 0 || yl >= rect.height - 1)
            continue;
        g.setColor(ll == 0 && highlightCenter ? majorDiv : minorDiv);
        g.drawLine(0, yl, rect.width - 1, yl);
    }

    // vertical (time) gridlines
    double ts = sim->maxTimeStep * speed;
    double tRight = isTriggered() ? trigger.time + ts * rect.width / 2 : sim->t;
    double tstart = tRight - ts * rect.width;
    double tx = tRight - std::fmod(tRight, gridStepX);
    for (int ll = 0;; ll++) {
        double tl = tx - gridStepX * ll;
        double gx = std::trunc((tl - tstart) / ts);
        if (gx < 0)
            break;
        if (gx >= rect.width || tl < 0)
            continue;
        g.setColor(std::fmod(tl + gridStepX / 4, gridStepX * 10) < gridStepX ? majorDiv : minorDiv);
        g.drawLine(gx, 0, gx, rect.height - 1);
    }
}

void Scope::drawPlot(Graphics &g, ScopePlot &plot, bool allPlotsSameUnits, bool selected, bool allSelected) {
    if (plot.elm == nullptr)
        return;
    int maxy = (int) std::trunc((rect.height - 1) / 2);

    std::string color = somethingSelected ? "#A0A0A0" : plot.color;
    if (allSelected || (app->scopeManager->scopeSelected == -1 && getSingleElm() == nullptr && plot.elm->isMouseElm() && !exporting))
        color = CircuitElm::selectColor.getHexValue();
    else if (selected)
        color = plot.color;

    int ipa = displayStartIndex(plot, (int) rect.width);
    const std::vector<double> &maxV = plot.maxValues;
    const std::vector<double> &minV = plot.minValues;

    double gridMid = calcGridParams(plot, allPlotsSameUnits);
    int minRangeLo = -10 - (int) std::trunc(gridMid * plot.gridMult);
    int minRangeHi = 10 - (int) std::trunc(gridMid * plot.gridMult);
    int curMinRangeLo = minRangeLo;

    gridStepX = calcGridStepX();
    if (drawGridLines)
        drawHVGridLines(g, plot, gridMid, allPlotsSameUnits, allSelected);
    drawGridLines = false;

    g.setColor(color);
    if (isManualScale()) {
        int y0 = maxy - (int) std::trunc(plot.gridMult * plot.plotOffset);
        g.drawLine(0, y0, 8, y0);
        g.drawString("0", 0, y0 - 2);
    }

    // In triggered mode, only draw up to the current write pointer.
    // Data beyond that is stale (old circular buffer contents).
    int drawWidth = validDataCount(plot, ipa, (int) rect.width);
    int ox = -1, oy = -1;
    int i;
    for (i = 0; i != drawWidth; i++) {
        int ip = (i + ipa) & (scopePointCount - 1);
        int minvy = (int) jsmath::round(plot.gridMult * (minV[ip] + plot.plotOffset));
        int maxvy = (int) jsmath::round(plot.gridMult * (maxV[ip] + plot.plotOffset));
        if (minvy <= maxy) {
            if (minvy < curMinRangeLo || maxvy > minRangeHi) {
                // value outside min range; no need to rescale later
                reduceRange[plot.units] = false;
                curMinRangeLo = -1000;
                minRangeHi = 1000;
            }
            if (ox != -1) {
                if (minvy == oy && maxvy == oy)
                    continue;
                g.drawLine(ox, maxy - oy, i, maxy - oy);
                ox = oy = -1;
            }
            if (minvy == maxvy) {
                ox = i;
                oy = minvy;
                continue;
            }
            g.drawLine(i, maxy - minvy, i, maxy - maxvy);
        }
    }
    if (ox != -1)
        g.drawLine(ox, maxy - oy, i - 1, maxy - oy);
}

double Scope::mouseXToTime(double mouseX) const {
    if (isTriggered())
        return trigger.time + sim->maxTimeStep * speed * (mouseX - rect.x - rect.width / 2);
    return sim->t - sim->maxTimeStep * speed * (rect.x + rect.width - mouseX);
}

void Scope::selectScope(double mouseX, double mouseY) {
    if (!rect.contains(mouseX, mouseY))
        return;
    if (plot2d.enabled || visiblePlots.empty())
        cursorTime = -1;
    else
        cursorTime = mouseXToTime(mouseX);
    checkForSelection(mouseX, mouseY);
    cursorScope = this;
}

void Scope::mousePressed(double mouseX, double mouseY) {
    if (!rect.contains(mouseX, mouseY))
        return;
    if (plot2d.enabled || fftPlot.enabled || visiblePlots.empty())
        return;
    dragStartTime = mouseXToTime(mouseX);
}

void Scope::checkForSelection(double mouseX, double mouseY) {
    if (app->modalDialogIsShowing())
        return;
    if (draggingPlotY)
        return;
    if (!rect.contains(mouseX, mouseY)) {
        selectedPlot = -1;
        return;
    }
    if (plots.empty()) {
        selectedPlot = -1;
        return;
    }
    int ipa = displayStartIndex(*plots[0], (int) rect.width);
    int ip = ((int) (mouseX - rect.x) + ipa) & (scopePointCount - 1);
    int maxy = (int) std::trunc((rect.height - 1) / 2);
    int y = maxy;
    double bestdist = 10000;
    int best = -1;
    for (size_t i = 0; i != visiblePlots.size(); i++) {
        ScopePlot *plot = visiblePlots[i];
        double maxvy = plot->gridMult * (plot->maxValues[ip] + plot->plotOffset);
        double dist = std::abs(mouseY - (rect.y + y - maxvy));
        if (dist < bestdist) {
            bestdist = dist;
            best = (int) i;
        }
    }
    selectedPlot = best;
    if (selectedPlot >= 0)
        cursorUnits = visiblePlots[selectedPlot]->units;
}

int Scope::timeToX(double t) const {
    if (isTriggered())
        return (int) std::trunc(rect.x + rect.width / 2 + (t - trigger.time) / (sim->maxTimeStep * speed));
    return -(int) std::trunc((sim->t - t) / (sim->maxTimeStep * speed) - rect.x - rect.width);
}

double Scope::drawPlotDot(Graphics &g, ScopePlot &plot, int x) {
    if (x < rect.x || x >= rect.x + rect.width)
        return std::numeric_limits<double>::quiet_NaN();
    int ipa = displayStartIndex(*plots[0], (int) rect.width);
    int ip = ((int) (x - rect.x) + ipa) & (scopePointCount - 1);
    double value = plot.maxValues[ip];
    double vy = plot.gridMult * (value + plot.plotOffset);
    double dotY = rect.y + std::trunc((rect.height - 1) / 2) - vy;
    g.setColor(plot.color);
    if (dotY >= rect.y && dotY < rect.y + rect.height)
        g.fillOval(x - 2, dotY - 2, 5, 5);
    return value;
}

void Scope::drawCursor(Graphics &g) {
    if (app->modalDialogIsShowing())
        return;
    if (cursorScope == nullptr)
        return;
    std::vector<std::string> info;
    int cursorX = -1;
    double cursorValue = std::numeric_limits<double>::quiet_NaN();
    ScopePlot *plot = !visiblePlots.empty() ? visiblePlots[selectedPlot >= 0 ? selectedPlot : 0] : nullptr;
    if (cursorTime >= 0) {
        cursorX = timeToX(cursorTime);
        if (plot != nullptr) {
            cursorValue = drawPlotDot(g, *plot, cursorX);
            if (dragStartTime < 0 && !std::isnan(cursorValue))
                info.push_back(plot->getUnitText(cursorValue));
        }
    }

    // show FFT even if there's no plots (in which case cursorTime/cursorX will be invalid)
    if (fftPlot.enabled && cursorScope == this) {
        if (cursorX < 0)
            cursorX = app->mouseCursorX;
        fftPlot.addCursorInfo(info, app->mouseCursorX);
    } else if (cursorX < rect.x)
        return;

    // draw drag-start cursor and delta readout
    if (dragStartTime >= 0 && cursorScope == this && plot != nullptr && !plot2d.enabled && !fftPlot.enabled) {
        int dragX = timeToX(dragStartTime);
        if (dragX >= rect.x && dragX < rect.x + rect.width) {
            g.setColor(CircuitElm::lightGrayColor);
            g.drawLine(dragX, rect.y, dragX, rect.y + rect.height);
            double startValue = drawPlotDot(g, *plot, dragX);
            double deltaT = cursorTime - dragStartTime;
            info.push_back("\u0394t=" + CircuitElm::getTimeText(std::abs(deltaT)));
            if (!std::isnan(cursorValue) && !std::isnan(startValue)) {
                info.push_back("\u0394=" + plot->getUnitText(cursorValue - startValue));
                info.push_back(plot->getUnitText(cursorValue));
            }
        }
    }

    if (!visiblePlots.empty())
        info.push_back(CircuitElm::getTimeText(cursorTime));

    if (cursorScope != this) {
        // don't show cursor info if not enough room, or stacked with selected one
        // (position == -1 for embedded scopes)
        if (rect.height < 40 || (position >= 0 && cursorScope->position == position)) {
            drawCursorInfo(g, nullptr, 0, cursorX, false);
            return;
        }
    }
    drawCursorInfo(g, &info, (int) info.size(), cursorX, false);
}

void Scope::drawCursorInfo(Graphics &g, const std::vector<std::string> *info, int ct, double x, bool drawY) {
    double szw = 0, szh = 15 * ct;
    if (info != nullptr) {
        for (int i = 0; i != ct; i++) {
            double w = g.measureWidth((*info)[i]);
            if (w > szw)
                szw = w;
        }
    }

    g.setColor(CircuitElm::whiteColor);
    g.drawLine(x, rect.y, x, rect.y + rect.height);
    if (drawY)
        g.drawLine(rect.x, app->mouseCursorY, rect.x + rect.width, app->mouseCursorY);
    g.setColor(app->isPrintable() ? Color::white : Color::black);
    double bx = x;
    if (bx < szw / 2)
        bx = szw / 2;
    g.fillRect(bx - szw / 2, rect.y - szh, szw, szh);
    if (info != nullptr) {
        g.setColor(CircuitElm::whiteColor);
        for (int i = 0; i != ct; i++) {
            double w = g.measureWidth((*info)[i]);
            g.drawString((*info)[i], bx - w / 2, rect.y - 2 - (ct - 1 - i) * 15);
        }
    }
}

bool Scope::canShowRMS() const {
    if (visiblePlots.empty())
        return false;
    ScopePlot *plot = visiblePlots[0];
    return plot->units == UNITS_V || plot->units == UNITS_A;
}

void Scope::drawInfoText(Graphics &g, const std::string &t) {
    overlays->drawInfoText(g, t);
}

std::optional<std::string> Scope::getScopeText() {
    // multiple elms?  don't show text (unless one is selected)
    if (selectedPlot < 0 && getSingleElm() == nullptr)
        return std::nullopt;

    // no visible plots?
    if (visiblePlots.empty())
        return std::nullopt;

    ScopePlot *plot = visiblePlots[0];
    if (selectedPlot >= 0 && (int) visiblePlots.size() > selectedPlot)
        plot = visiblePlots[selectedPlot];
    if (plot->elm == nullptr)
        return std::string();
    return plot->elm->getScopeText(plot->value);
}

std::string Scope::getScopeLabelOrText(bool forInfo) {
    if (!text) {
        // if we're drawing the info and showElmInfo is true, return null so we don't print redundant info.
        // But don't do that if we're getting the scope label to generate "Add to Existing Scope" menu.
        if (forInfo && showElmInfo)
            return "";
        std::optional<std::string> t = getScopeText();
        if (!t)
            return "";
        return Locale::LS(*t);
    }
    return *text;
}

void Scope::saveAsDefault() { serializer->saveAsDefault(); }

void Scope::setSpeed(int sp) {
    if (sp < 1)
        sp = 1;
    if (sp > 1024)
        sp = 1024;
    speed = sp;
    resetGraph();
}

void Scope::speedUp() {
    if (speed > 1) {
        speed /= 2;
        resetGraph();
    }
}

void Scope::slowDown() {
    if (speed < 1024)
        speed *= 2;
    resetGraph();
}

bool Scope::startDragPlotY(double mouseX, double mouseY) {
    if (!rect.contains(mouseX, mouseY))
        return false;
    if (!isManualScale() || selectedPlot < 0 || selectedPlot >= (int) visiblePlots.size())
        return false;
    draggingPlotY = true;
    dragPlotYMouseStart = mouseY;
    dragPlotYInitialPosition = visiblePlots[selectedPlot]->manVPosition;
    draggingPlotYScope = this;
    return true;
}

void Scope::dragPlotY(double mouseY) {
    if (selectedPlot < 0 || selectedPlot >= (int) visiblePlots.size())
        return;
    int maxy = std::max(1, (int) std::trunc((rect.height - 1) / 2));
    double ddy = mouseY - dragPlotYMouseStart;
    int newPos = dragPlotYInitialPosition - (int) jsmath::round(ddy * V_POSITION_STEPS / (2.0 * maxy));
    newPos = std::max(-V_POSITION_STEPS, std::min(V_POSITION_STEPS, newPos));
    visiblePlots[selectedPlot]->manVPosition = newPos;
}

void Scope::endDragPlotY() {
    if (draggingPlotYScope != nullptr)
        draggingPlotYScope->draggingPlotY = false;
    draggingPlotYScope = nullptr;
}

CircuitElm *Scope::getSingleElm() const {
    if (plots.empty())
        return nullptr;
    CircuitElm *elm = plots[0]->elm;
    for (size_t i = 1; i < plots.size(); i++)
        if (plots[i]->elm != elm)
            return nullptr;
    return elm;
}

bool Scope::canShowResistance() const {
    CircuitElm *elm = getSingleElm();
    return elm != nullptr && elm->canShowValueInScope(VAL_R);
}

bool Scope::isShowingVceAndIc() const {
    return plot2d.enabled && plots.size() == 2 && plots[0]->value == VAL_VCE && plots[1]->value == VAL_IC;
}

void Scope::dumpXml(XmlElement *root) { serializer->dumpXml(root); }
void Scope::undumpXml(CircuitXMLDeserializer &xml) { serializer->undumpXml(xml); }
void Scope::undump(StringTokenizer &st) { serializer->undump(st); }

void Scope::handleMenu(const std::string &mi, bool state) {
    if (mi == "maxscale") maxScaleToggle();
    if (mi == "showvoltage") showVoltage(state);
    if (mi == "showcurrent") showCurrent(state);
    if (mi == "showscale") showScaleF(state);
    if (mi == "showpeak") showMaxF(state);
    if (mi == "shownegpeak") showMinF(state);
    if (mi == "showp2p") showP2PF(state);
    if (mi == "showfreq") showFreqF(state);
    if (mi == "showfft") fftPlot.show(state);
    if (mi == "logspectrum") fftPlot.logSpectrum = state;
    if (mi == "showrms") showRMS = state;
    if (mi == "showaverage") showAverage = state;
    if (mi == "showduty") showDutyCycle = state;
    if (mi == "showphaseangle") fftPlot.showPhaseAngle = state;
    if (mi == "showelminfo") showElmInfo = state;
    if (mi == "showpower") showPower(state);
    if (mi == "showib") showPlotValue(VAL_IB, state);
    if (mi == "showic") showPlotValue(VAL_IC, state);
    if (mi == "showie") showPlotValue(VAL_IE, state);
    if (mi == "showvbe") showPlotValue(VAL_VBE, state);
    if (mi == "showvbc") showPlotValue(VAL_VBC, state);
    if (mi == "showvce") showPlotValue(VAL_VCE, state);
    if (mi == "showvcevsic") {
        plot2d.enabled = true;
        plot2d.plotXY = false;
        setValues(VAL_VCE, VAL_IC, getElm(), nullptr);
        resetGraph();
    }
    if (mi == "showvvsi") {
        plot2d.enabled = state;
        plot2d.plotXY = false;
        resetGraph();
    }
    if (mi == "manualscale") setManualScale(state, true);
    if (mi == "plotxy") {
        plot2d.plotXY = plot2d.enabled = state;
        if (plot2d.enabled) {
            setPlotsTo(visiblePlots, nullptr);
            plot2d.plotX = 0;
            plot2d.plotY = std::min(1, (int) plots.size() - 1);
            plot2d.plotBrightness = plot2d.plotColorR = plot2d.plotColorG = plot2d.plotColorB = -1;
        }
        if (plot2d.enabled && plots.size() == 1)
            selectY();
        resetGraph();
    }
    if (mi == "showresistance") showPlotValue(VAL_R, state);
    if (mi == "showcharge") showCharge(state);
}

void Scope::selectY() {
    CircuitElm *yElm = (plots.size() == 2) ? plots[1]->elm : nullptr;
    int e = (yElm == nullptr) ? -1 : app->locateElm(yElm);
    int firstE = e;
    for (;;) {
        for (e++; e < (int) app->elmList.size(); e++) {
            CircuitElm *ce = app->getElm(e);
            if ((ce->isOutputElm() || ce->isProbeElm()) && ce != plots[0]->elm) {
                if (plots.size() == 1)
                    plots.push_back(std::make_unique<ScopePlot>(ce, UNITS_V));
                else {
                    plots[1]->elm = ce;
                    plots[1]->units = UNITS_V;
                }
                return;
            }
        }
        if (firstE == -1)
            return;
        e = -1;
    }
}

void Scope::onMouseWheel(double normalizedDelta, double wheelSensitivity) {
    wheelDeltaY += normalizedDelta * wheelSensitivity;
    if (wheelDeltaY > 5) {
        slowDown();
        wheelDeltaY = 0;
    }
    if (wheelDeltaY < -5) {
        speedUp();
        wheelDeltaY = 0;
    }
}

CircuitElm *Scope::getElm() const {
    if (selectedPlot >= 0 && (int) visiblePlots.size() > selectedPlot)
        return visiblePlots[selectedPlot]->elm;
    if (!visiblePlots.empty())
        return visiblePlots[0]->elm;
    return plots.empty() ? nullptr : plots[0]->elm;
}

bool Scope::showingElm(const CircuitElm *e) const {
    for (auto &p : plots)
        if (p->elm == e)
            return true;
    return false;
}

bool Scope::viewingWire() const {
    for (auto &p : plots)
        if (p->elm != nullptr && p->elm->isWireEquivalent())
            return true;
    return false;
}

void Scope::addScopePlotRoles(std::unordered_set<CircuitElm *> &roles) const {
    // TODO: X/Y role labels
    for (ScopePlot *p : visiblePlots)
        if (p->elm != nullptr)
            roles.insert(p->elm);
}

bool Scope::needToRemove() {
    bool ret = true;
    bool removed = false;
    for (size_t i = 0; i < plots.size(); i++) {
        if (app->locateElm(plots[i]->elm) < 0) {
            plots.erase(plots.begin() + i--);
            removed = true;
        } else
            ret = false;
    }
    if (removed)
        calcVisiblePlots();
    return ret;
}

void Scope::elementDeleted(const CircuitElm *ce) {
    // setupScopes() removes these plots (and the scope if it's empty) on the next frame
    for (auto &p : plots)
        if (p->elm == ce)
            p->elm = nullptr;
}

double Scope::getManScaleFromMaxScale(int units, bool roundUp) const {
    // When the user manually switches to manual scale (and we don't already have a setting) then
    // call with "roundUp=true" to get a "sensible" suggestion for the scale. When importing from
    // a legacy file then call with "roundUp=false" to stay as close as possible to the old presentation
    double s = scale[units];
    if (units > UNITS_A)
        s = 0.5 * s;
    if (roundUp)
        return nextHighestScale((2 * s) / manDivisions);
    return (2 * s) / manDivisions;
}

double Scope::nextHighestScale(double d) {
    d = d * 1.001;
    double s = MIN_MAN_SCALE;
    for (int a = 0; s < d; a++)
        s *= multa[a % 3];
    return s;
}
