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

#include "ScopePlot2d.h"

#include <algorithm>
#include <cmath>
#include <vector>

#include "CircuitElm.h"
#include "Graphics.h"
#include "Scope.h"
#include "ScopeOverlays.h"
#include "SimApp.h"
#include "SimulationManager.h"

using namespace ScopeConstants;

ScopePlot2d::ScopePlot2d(Scope *s) : scope(s) {}

ScopePlot2d::~ScopePlot2d() = default;

void ScopePlot2d::allocImage() {
    if (!enabled)
        return;
    if (!image)
        image = GraphicsImage::create();
    if (!image)
        return;
    image->resize((int) scope->rect.width, (int) scope->rect.height);
    clearView();
}

void ScopePlot2d::clearView() {
    if (image) {
        Graphics &ig = image->graphics();
        ig.setColor(scope->app->isPrintable() ? Color(0xee, 0xee, 0xee) : Color(0x11, 0x11, 0x11));
        ig.fillRect(0, 0, scope->rect.width - 1, scope->rect.height - 1);
    }
    draw_ox = draw_oy = -1;
}

double ScopePlot2d::calcGridPx(double width, double height) const {
    double m = std::min(width, height);
    return (m / 2) / (scope->manDivisions / 2.0 + 0.05);
}

void ScopePlot2d::drawSegment(double ox, double oy, double x2, double y2, const Color &color, double alpha) {
    Graphics &ig = image->graphics();
    if (alpha != 1.0)
        ig.setGlobalAlpha(alpha);
    ig.setColor(color);
    ig.drawLine(ox, oy, x2, y2);
    if (alpha != 1.0)
        ig.setGlobalAlpha(1.0);
}

void ScopePlot2d::drawTo(double x2, double y2, const Color &color, double alpha) {
    if (draw_ox == -1) {
        draw_ox = x2;
        draw_oy = y2;
        return;
    }
    drawSegment(draw_ox, draw_oy, x2, y2, color, alpha);
    draw_ox = x2;
    draw_oy = y2;
}

static int modulatorLevel(double v, double &scale) {
    while (v > scale)
        scale *= 2;
    return (int) std::trunc(std::max(0.0, std::min(255.0, (v / scale) * 255)));
}

Color ScopePlot2d::computeColor() {
    if (plotColorR < 0 && plotColorG < 0 && plotColorB < 0)
        return scope->app->isPrintable() ? Color::black : Color::white;
    int n = (int) scope->plots.size();
    int r = 0, g = 0, b = 0;
    if (plotColorR >= 0 && plotColorR < n)
        r = modulatorLevel(scope->plots[plotColorR]->lastValue, scaleR);
    if (plotColorG >= 0 && plotColorG < n)
        g = modulatorLevel(scope->plots[plotColorG]->lastValue, scaleG);
    if (plotColorB >= 0 && plotColorB < n)
        b = modulatorLevel(scope->plots[plotColorB]->lastValue, scaleB);
    return Color(r, g, b);
}

double ScopePlot2d::computeAlpha() {
    if (plotBrightness < 0 || plotBrightness >= (int) scope->plots.size())
        return 1.0;
    double bv = std::abs(scope->plots[plotBrightness]->lastValue);
    while (bv > scaleBrightness)
        scaleBrightness *= 2;
    return scaleBrightness > 0 ? bv / scaleBrightness : 0;
}

int ScopePlot2d::validPlotIndex(int idx, int def) const {
    int n = (int) scope->plots.size();
    if (n == 0)
        return 0;
    if (idx < 0 || idx >= n)
        return std::min(def, n - 1);
    return idx;
}

void ScopePlot2d::timeStep() {
    if (!image || scope->plots.empty())
        return;
    const Rectangle &rect = scope->rect;
    int px = validPlotIndex(plotX, 0);
    int py = validPlotIndex(plotY, std::min(1, (int) scope->plots.size() - 1));
    ScopePlot &spx = *scope->plots[px];
    ScopePlot &spy = *scope->plots[py];
    double v = spx.lastValue;
    double yval = spy.lastValue;
    double x, y;
    if (!scope->isManualScale()) {
        bool newscale = false;
        while (v > scaleX || v < -scaleX) {
            scaleX *= 2;
            newscale = true;
        }
        while (yval > scaleY || yval < -scaleY) {
            scaleY *= 2;
            newscale = true;
        }
        if (newscale)
            clearView();
        x = std::trunc(rect.width * (1 + v / scaleX) * .499);
        y = std::trunc(rect.height * (1 - yval / scaleY) * .499);
    } else {
        double gridPx = calcGridPx(rect.width, rect.height);
        x = std::trunc(rect.width * .499 + (v / spx.manScale) * gridPx +
                       gridPx * scope->manDivisions * spx.manVPosition / V_POSITION_STEPS);
        y = std::trunc(rect.height * .499 - (yval / spy.manScale) * gridPx -
                       gridPx * scope->manDivisions * spy.manVPosition / V_POSITION_STEPS);
    }
    drawTo(x, y, computeColor(), computeAlpha());
}

void ScopePlot2d::maxScale() {
    double x = 1e-8;
    scope->scale[UNITS_V] *= x;
    scope->scale[UNITS_A] *= x;
    scope->scale[UNITS_OHMS] *= x;
    scope->scale[UNITS_W] *= x;
    scope->scale[UNITS_C] *= x;
    scaleX *= x;
    scaleY *= x;
    scaleBrightness *= x;
    scaleR *= x;
    scaleG *= x;
    scaleB *= x;
}

void ScopePlot2d::draw(Graphics &g) {
    if (!image)
        return;
    const Rectangle &rect = scope->rect;
    SimApp *app = scope->app;
    SimulationManager *sim = scope->sim;
    g.saveState();
    g.translate(rect.x, rect.y);
    g.clipRect(0, 0, rect.width, rect.height);

    alphaCounter++;
    if (alphaCounter > 2) {
        alphaCounter = 0;
        double fadeAlpha;
        if (trailPersistence <= 0) {
            fadeAlpha = 0.01;
        } else {
            // Sim-time exponential fade; time constant = trailPersistence * maxTimeStep (seconds).
            // Don't advance lastTrailSimTime until fadeAlpha is large enough; otherwise sub-pixel
            // alphas have no effect on an 8-bit canvas and the trail never fades at low speed.
            if (lastTrailSimTime < 0 || sim->t < lastTrailSimTime)
                lastTrailSimTime = sim->t;
            double elapsed = sim->t - lastTrailSimTime;
            double timeConst = trailPersistence * sim->maxTimeStep;
            fadeAlpha = 1.0 - std::exp(-elapsed / timeConst);
            if (fadeAlpha >= 3.0 / 255)
                lastTrailSimTime = sim->t;
            else
                fadeAlpha = 0;
        }
        if (fadeAlpha > 0) {
            Graphics &ig = image->graphics();
            ig.setGlobalAlpha(fadeAlpha);
            ig.setColor(app->isPrintable() ? Color::white : Color::black);
            ig.fillRect(0, 0, rect.width, rect.height);
            ig.setGlobalAlpha(1.0);
        }
    }

    g.drawImage(*image, 0, 0);
    g.setColor(CircuitElm::whiteColor);
    g.fillOval(draw_ox - 2, draw_oy - 2, 5, 5);
    g.setColor(CircuitElm::positiveColor);
    g.drawLine(0, rect.height / 2, rect.width - 1, rect.height / 2);
    if (!plotXY)
        g.setColor(Color::yellow);
    g.drawLine(rect.width / 2, 0, rect.width / 2, rect.height - 1);
    if (scope->isManualScale()) {
        double gridPx = calcGridPx(rect.width, rect.height);
        g.setColor(Color(0x40, 0x40, 0x40));
        for (int i = -scope->manDivisions; i <= scope->manDivisions; i++) {
            if (i != 0)
                g.drawLine(std::trunc(gridPx * i) + rect.width / 2, 0,
                           std::trunc(gridPx * i) + rect.width / 2, rect.height);
            g.drawLine(0, std::trunc(gridPx * i) + rect.height / 2,
                       rect.width, std::trunc(gridPx * i) + rect.height / 2);
        }
    }
    scope->overlays->textY = 10;
    g.setColor(CircuitElm::whiteColor);
    if (scope->text)
        scope->drawInfoText(g, *scope->text);
    int n = (int) scope->plots.size();
    int px = validPlotIndex(plotX, 0);
    int py = validPlotIndex(plotY, std::min(1, n - 1));
    if (scope->showScale && n >= 1 && scope->isManualScale() && px < n && py < n) {
        ScopePlot &spx = *scope->plots[px];
        ScopePlot &spy = *scope->plots[py];
        scope->drawInfoText(g, "X=" + spx.getUnitText(spx.manScale) + "/div, Y=" + spy.getUnitText(spy.manScale) + "/div");
    }
    g.restoreState();
    scope->drawSettingsWheel(g);
    if (!app->modalDialogIsShowing() && rect.contains(app->mouseCursorX, app->mouseCursorY) &&
            n >= 1 && px < n && py < n) {
        double gridPx = calcGridPx(rect.width, rect.height);
        ScopePlot &spx = *scope->plots[px];
        ScopePlot &spy = *scope->plots[py];
        double xValue, yValue;
        if (scope->isManualScale()) {
            xValue = spx.manScale * ((app->mouseCursorX - rect.x - rect.width / 2) / gridPx -
                                     scope->manDivisions * spx.manVPosition / (double) V_POSITION_STEPS);
            yValue = spy.manScale * ((-app->mouseCursorY + rect.y + rect.height / 2) / gridPx -
                                     scope->manDivisions * spy.manVPosition / (double) V_POSITION_STEPS);
        } else {
            xValue = ((app->mouseCursorX - rect.x) / (0.499 * rect.width) - 1.0) * scaleX;
            yValue = -((app->mouseCursorY - rect.y) / (0.499 * rect.height) - 1.0) * scaleY;
        }
        std::vector<std::string> info = { spx.getUnitText(xValue), spy.getUnitText(yValue) };
        scope->drawCursorInfo(g, &info, 2, app->mouseCursorX, true);
    }
}
