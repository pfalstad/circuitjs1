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

#include "Color.h"
#include "Font.h"
#include "Point.h"
#include "Polygon.h"

// Drawing interface for elements.  It has the TS Graphics methods plus the
// CanvasRenderingContext2D calls that elements make directly through g.context, so
// draw() code ports line for line (g.context.arc(...) becomes g.arc(...)).  The Qt app
// implements it with QPainter.
class Graphics {
public:
    enum TextAlign { ALIGN_LEFT, ALIGN_CENTER, ALIGN_RIGHT };
    enum TextBaseline { BASELINE_ALPHABETIC, BASELINE_MIDDLE, BASELINE_TOP, BASELINE_BOTTOM };
    enum LineCap { CAP_BUTT, CAP_ROUND, CAP_SQUARE };

    virtual ~Graphics() = default;

    double currentFontSize = 12;
    double savedFontSize = 12;

    // ---- TS Graphics methods ----
    virtual void setColor(const Color &c) = 0;
    void setColor(const std::string &css) { setColor(Color(css)); }
    virtual void clipRect(double x, double y, double w, double h) = 0;
    void save() { saveState(); savedFontSize = currentFontSize; }
    void restore() { restoreState(); currentFontSize = savedFontSize; }
    virtual void fillRect(double x, double y, double w, double h) = 0;
    virtual void drawRect(double x, double y, double w, double h) = 0;
    void fillOval(double x, double y, double w, double h) {
        beginPath();
        arc(x + w / 2, y + w / 2, w / 2, 0, 2.0 * 3.14159);
        closePath();
        fill();
    }
    virtual void drawString(const std::string &s, double x, double y) = 0;
    virtual double measureWidth(const std::string &s) = 0;
    virtual void setLineWidth(double w) = 0;
    void drawLine(double x1, double y1, double x2, double y2) {
        beginPath();
        moveTo(x1, y1);
        lineTo(x2, y2);
        stroke();
    }
    void drawLine(const Point &a, const Point &b) { drawLine(a.x, a.y, b.x, b.y); }
    void drawPolyline(const std::vector<int> &xs, const std::vector<int> &ys, int n) {
        beginPath();
        for (int i = 0; i < n; i++) {
            if (i == 0)
                moveTo(xs[i], ys[i]);
            else
                lineTo(xs[i], ys[i]);
        }
        closePath();
        stroke();
    }
    void fillPolygon(const Polygon &p) {
        beginPath();
        for (int i = 0; i < p.npoints; i++) {
            if (i == 0)
                moveTo(p.xpoints[i], p.ypoints[i]);
            else
                lineTo(p.xpoints[i], p.ypoints[i]);
        }
        closePath();
        fill();
    }
    void setFont(const Font &f) { applyFont(f); currentFontSize = f.size; }
    // 0 turns dashing off
    virtual void setLineDash(double a, double b) = 0;

    static double distanceSq(double x1, double y1, double x2, double y2) {
        x2 -= x1;
        y2 -= y1;
        return x2 * x2 + y2 * y2;
    }

    // ---- canvas context methods ----
    virtual void saveState() = 0;
    virtual void restoreState() = 0;
    virtual void transform(double a, double b, double c, double d, double e, double f) = 0;
    virtual void setTransform(double a, double b, double c, double d, double e, double f) = 0;
    virtual void translate(double x, double y) = 0;
    virtual void scale(double sx, double sy) = 0;
    virtual void rotate(double angle) = 0;
    virtual void beginPath() = 0;
    virtual void moveTo(double x, double y) = 0;
    virtual void lineTo(double x, double y) = 0;
    virtual void arc(double cx, double cy, double r, double a0, double a1, bool ccw = false) = 0;
    virtual void quadraticCurveTo(double cpx, double cpy, double x, double y) = 0;
    virtual void bezierCurveTo(double c1x, double c1y, double c2x, double c2y, double x, double y) = 0;
    virtual void rect(double x, double y, double w, double h) = 0;
    virtual void closePath() = 0;
    virtual void stroke() = 0;
    virtual void fill() = 0;
    virtual void strokeRect(double x, double y, double w, double h) = 0;
    // strokeStyle = createLinearGradient(x0,y0,x1,y1) with stops c0 at 0 and c1 at 1
    virtual void setStrokeGradient(double x0, double y0, double x1, double y1, const Color &c0, const Color &c1) = 0;
    virtual void setTextAlign(TextAlign a) = 0;
    virtual void setTextBaseline(TextBaseline b) = 0;
    virtual void setGlobalAlpha(double a) = 0;
    virtual void setLineCap(LineCap c) = 0;
    virtual double getLineWidth() = 0;

protected:
    virtual void applyFont(const Font &f) = 0;
};
