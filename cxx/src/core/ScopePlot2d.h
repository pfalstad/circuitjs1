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

#include "Color.h"

class Graphics;
class GraphicsImage;
class Scope;

// X/Y and V-vs-I plots
class ScopePlot2d {
public:
    static constexpr int DEFAULT_TRAIL_PERSISTENCE = 0;

    explicit ScopePlot2d(Scope *s);
    ~ScopePlot2d();

    bool enabled = false;
    bool plotXY = false;
    double scaleX = 5, scaleY = 0.1;

    // X/Y axis plot indices (into scope.plots)
    int plotX = 0, plotY = 1;
    // Modulator plot indices (-1 = none)
    int plotBrightness = -1, plotColorR = -1, plotColorG = -1, plotColorB = -1;
    // Auto-scales for modulator plots
    double scaleBrightness = 5, scaleR = 5, scaleG = 5, scaleB = 5;

    bool keepOnResize = false;  // set by Scope::setRect(): scale the trail to the new size, don't clear it
    int trailPersistence = DEFAULT_TRAIL_PERSISTENCE;
    double lastTrailSimTime = -1;
    // measured sim time per drawn frame, to express the frame-based default fade in sim time
    double simPerFrame = 0;

    // ---- Auto-fit (Auto / Auto Max Scale modes) ----
    // Each axis is fitted to the data seen over the last one to two "fit windows" (the scope's
    // horizontal time span), so the plot fills the scope, follows the trace and shrinks again
    // after a transient.  Index [0] is X, [1] is Y.
    bool includeOrigin = true;  // keep (0,0) in the fitted range so the axes stay visible
    bool alignX = false;        // share the X range with other scopes that also have alignX set
    static constexpr double FIT_MARGIN = .1;    // fraction of width/height left empty on each edge
    static constexpr double SHRINK_RATIO = .5;  // shrink when the data uses less than this much of the range
    static constexpr double EXPAND_TOL = .05;   // a point may overshoot the range by this much (fraction of
                                                // the range, drawn into the edge margin) before we refit

    void allocImage();
    void clearView();
    // The trail fades toward this same color, so the background stays uniform.  (If they differed,
    // a rescaled trail's faded background would show up as rectangles against fresh background.)
    Color backgroundColor() const;
    void fillBackground();
    double calcGridPx(double width, double height) const;
    // Draw a segment from (ox,oy) to (x2,y2) with the given color and alpha.
    void drawSegment(double ox, double oy, double x2, double y2, const Color &color, double alpha);
    void drawTo(double x2, double y2, const Color &color, double alpha);
    // Compute the draw color from R/G/B modulator plots.
    Color computeColor();
    // Compute draw alpha from the brightness modulator plot (0 = off, 1 = full).
    double computeAlpha();
    // Clamp plotX/plotY to valid range.
    int validPlotIndex(int idx, int def) const;
    void timeStep();
    void maxScale();
    void resetFit();
    // sim time covered by one fit window: the scope's horizontal span (width * speed timesteps)
    double fitWindow() const;
    // Record a new X/Y point.  Refit if it leaves the displayed range by more than EXPAND_TOL
    // (without a tolerance, every tiny new extreme -- sampling jitter, a Q-point still settling --
    // forced a refit), or, checked once per window, if the data has become much smaller than the
    // range, so a transient rolls off after a few windows.
    void fitPoint(double xv, double yv);
    bool outside(int a, double v) const;
    // range this scope wants on each axis: data from the last two windows (+ origin if asked)
    void calcWant();
    void refit();
    // Change the displayed range.  The trail already drawn is rescaled to the new range rather
    // than cleared, so a refit doesn't wipe the screen.
    void setDisp(double xlo, double xhi, double ylo, double yhi);
    // Redraw the trail from the old range (oLo/oHi) into the current one.  Each axis is a linear
    // map, so this is one scaled drawImage.  A huge zoom would just smear old pixels, so in that
    // case start clean instead.
    void remapImage(const double oLo[2], const double oHi[2]);
    // what kind of value is on the X axis, for Align X
    std::string xKey() const;
    bool canShareX() const;
    // other aligned auto-fit X/Y scopes (docked or floating) with the same kind of X value
    std::vector<ScopePlot2d *> getXGroup();
    void addToGroup(std::vector<ScopePlot2d *> &group, Scope *s, const std::string &key);
    // value -> pixel within the scope for a given range, leaving FIT_MARGIN empty on each edge
    double pixelOf(int a, double v, double lo, double hi) const;
    double toPixelD(int a, double v) const { return pixelOf(a, v, dispLo[a], dispHi[a]); }
    double toPixel(int a, double v) const;
    double fromPixel(int a, double px) const;
    // Trail time constant (sim seconds) of the default fade: alpha .01 every 3 frames, so
    // 3/-ln(.99) ~= 298 frames.  0 if the sim hasn't run yet.
    double defaultTrailTime() const;
    // trail time constant actually in use (sim seconds)
    double trailTime() const;
    void draw(Graphics &g);

private:
    Scope *scope;
    std::unique_ptr<GraphicsImage> image;
    std::unique_ptr<GraphicsImage> tmpImage;  // scratch copy of the trail, for rescaling it
    double draw_ox = -1, draw_oy = -1;
    int alphaCounter = 0;
    double lastFrameSimTime = -1;

    double curLo[2] = {0, 0}, curHi[2] = {0, 0};    // data range, current window
    double prevLo[2] = {0, 0}, prevHi[2] = {0, 0};  // data range, previous window
    bool haveCur = false;
    bool havePrev = false;
    double windowStart = -1;
    double wantLo[2] = {0, 0}, wantHi[2] = {0, 0};  // range this scope wants
    bool haveWant = false;
    double dispLo[2] = {0, 0}, dispHi[2] = {0, 0};  // range being displayed
    bool haveDisp = false;
    int shrinkVotes = 0;  // consecutive window checks that found the range too big
};
