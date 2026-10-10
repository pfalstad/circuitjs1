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

#include <QColor>
#include <QFont>
#include <QPainter>
#include <QPainterPath>
#include <optional>
#include <vector>

#include "core/Graphics.h"

// Graphics on top of QPainter, following CanvasRenderingContext2D semantics
// (separate stroke and fill styles, a current path, canvas-style arcs and text alignment)
class QtGraphics : public Graphics {
public:
    explicit QtGraphics(QPainter &p);

    void setColor(const Color &c) override;
    void clipRect(double x, double y, double w, double h) override;
    void fillRect(double x, double y, double w, double h) override;
    void drawRect(double x, double y, double w, double h) override { strokeRect(x, y, w, h); }
    void drawString(const std::string &s, double x, double y) override;
    double measureWidth(const std::string &s) override;
    void setLineWidth(double w) override { st.lineWidth = w; }
    void setLineDash(double a, double b) override;

    void saveState() override;
    void restoreState() override;
    void transform(double a, double b, double c, double d, double e, double f) override;
    void setTransform(double a, double b, double c, double d, double e, double f) override;
    void translate(double x, double y) override { p.translate(x, y); }
    void scale(double sx, double sy) override { p.scale(sx, sy); }
    void rotate(double angle) override;
    void beginPath() override { path = QPainterPath(); }
    void moveTo(double x, double y) override { path.moveTo(x, y); }
    void lineTo(double x, double y) override;
    void arc(double cx, double cy, double r, double a0, double a1, bool ccw = false) override;
    void quadraticCurveTo(double cpx, double cpy, double x, double y) override;
    void bezierCurveTo(double c1x, double c1y, double c2x, double c2y, double x, double y) override;
    void rect(double x, double y, double w, double h) override;
    void closePath() override { path.closeSubpath(); }
    void stroke() override;
    void fill() override;
    void strokeRect(double x, double y, double w, double h) override;
    void setStrokeGradient(double x0, double y0, double x1, double y1, const Color &c0, const Color &c1) override;
    void setTextAlign(TextAlign a) override { st.align = a; }
    void setTextBaseline(TextBaseline b) override { st.baseline = b; }
    void setGlobalAlpha(double a) override { p.setOpacity(a); }
    void setLineCap(LineCap c) override { st.cap = c; }
    double getLineWidth() override { return st.lineWidth; }

    static QColor toQColor(const Color &c);

protected:
    void applyFont(const Font &f) override;

private:
    struct State {
        QColor strokeColor = Qt::black;
        QColor fillColor = Qt::black;
        std::optional<QLinearGradient> strokeGradient;
        double lineWidth = 1;
        double dashOn = 0, dashOff = 0;
        LineCap cap = CAP_BUTT;
        TextAlign align = ALIGN_LEFT;
        TextBaseline baseline = BASELINE_ALPHABETIC;
    };

    QPen makePen() const;

    QPainter &p;
    QPainterPath path;
    State st;
    std::vector<State> stack;
};
