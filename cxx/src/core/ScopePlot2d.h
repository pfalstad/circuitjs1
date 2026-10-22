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

    int trailPersistence = DEFAULT_TRAIL_PERSISTENCE;
    double lastTrailSimTime = -1;

    void allocImage();
    void clearView();
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
    void draw(Graphics &g);

private:
    Scope *scope;
    std::unique_ptr<GraphicsImage> image;
    double draw_ox = -1, draw_oy = -1;
    int alphaCounter = 0;
};
