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

#include "QtGraphics.h"

#include <QFontMetricsF>
#include <QLinearGradient>
#include <cmath>

static constexpr double TWO_PI = 2 * 3.14159265358979323846;

QtGraphics::QtGraphics(QPainter &painter) : p(painter) {
    p.setRenderHint(QPainter::Antialiasing, true);
    p.setRenderHint(QPainter::TextAntialiasing, true);
    applyFont(Font("SansSerif", 0, 10));
}

QColor QtGraphics::toQColor(const Color &c) {
    if (c.hasText()) {
        QColor q(QString::fromStdString(*c.text()));
        if (q.isValid())
            return q;
        if (c.text()->empty())
            return QColor(0, 0, 0, 0);
    }
    return QColor(c.getRed(), c.getGreen(), c.getBlue());
}

void QtGraphics::setColor(const Color &c) {
    st.strokeColor = st.fillColor = toQColor(c);
    st.strokeGradient.reset();
}

void QtGraphics::clipRect(double x, double y, double w, double h) {
    p.setClipRect(QRectF(x, y, w, h), Qt::IntersectClip);
}

void QtGraphics::fillRect(double x, double y, double w, double h) {
    p.fillRect(QRectF(x, y, w, h), st.fillColor);
}

void QtGraphics::applyFont(const Font &f) {
    QFont qf;
    if (f.family == "monospace") {
        qf.setFamily("Menlo");
        qf.setStyleHint(QFont::Monospace);
    } else if (f.family == "serif") {
        qf.setFamily("Times");
        qf.setStyleHint(QFont::Serif);
    } else {
        qf.setStyleHint(QFont::SansSerif);
    }
    qf.setPixelSize(f.size > 0 ? f.size : 1);
    qf.setBold(f.bold());
    qf.setItalic(f.italic());
    p.setFont(qf);
}

double QtGraphics::measureWidth(const std::string &s) {
    return QFontMetricsF(p.font()).horizontalAdvance(QString::fromStdString(s));
}

void QtGraphics::drawString(const std::string &s, double x, double y) {
    QString qs = QString::fromStdString(s);
    QFontMetricsF fm(p.font());
    if (st.align == ALIGN_CENTER)
        x -= fm.horizontalAdvance(qs) / 2;
    else if (st.align == ALIGN_RIGHT)
        x -= fm.horizontalAdvance(qs);
    if (st.baseline == BASELINE_MIDDLE)
        y += (fm.ascent() - fm.descent()) / 2;
    else if (st.baseline == BASELINE_TOP)
        y += fm.ascent();
    else if (st.baseline == BASELINE_BOTTOM)
        y -= fm.descent();
    p.setPen(st.fillColor);
    p.drawText(QPointF(x, y), qs);
}

void QtGraphics::setLineDash(double a, double b) {
    st.dashOn = a;
    st.dashOff = (a == 0) ? 0 : b;
}

void QtGraphics::saveState() {
    p.save();
    stack.push_back(st);
}

void QtGraphics::restoreState() {
    if (stack.empty())
        return;
    p.restore();
    st = stack.back();
    stack.pop_back();
}

void QtGraphics::transform(double a, double b, double c, double d, double e, double f) {
    p.setTransform(QTransform(a, b, c, d, e, f), true);
}

void QtGraphics::setTransform(double a, double b, double c, double d, double e, double f) {
    p.setTransform(QTransform(a, b, c, d, e, f), false);
}

void QtGraphics::rotate(double angle) {
    p.rotate(angle * 360 / TWO_PI);
}

void QtGraphics::lineTo(double x, double y) {
    // canvas: lineTo on an empty path acts like moveTo
    if (path.elementCount() == 0)
        path.moveTo(x, y);
    else
        path.lineTo(x, y);
}

void QtGraphics::arc(double cx, double cy, double r, double a0, double a1, bool ccw) {
    // canvas angles run clockwise on screen (y down); Qt's run counterclockwise
    double sweep;
    if (!ccw) {
        double d = a1 - a0;
        if (d >= TWO_PI)
            sweep = TWO_PI;
        else {
            sweep = std::fmod(d, TWO_PI);
            if (sweep < 0)
                sweep += TWO_PI;
        }
    } else {
        double d = a0 - a1;
        if (d >= TWO_PI)
            sweep = -TWO_PI;
        else {
            double s = std::fmod(d, TWO_PI);
            if (s < 0)
                s += TWO_PI;
            sweep = -s;
        }
    }
    QPointF start(cx + r * std::cos(a0), cy + r * std::sin(a0));
    if (path.elementCount() == 0)
        path.moveTo(start);
    else
        path.lineTo(start);
    QRectF box(cx - r, cy - r, 2 * r, 2 * r);
    path.arcTo(box, -a0 * 360 / TWO_PI, -sweep * 360 / TWO_PI);
}

void QtGraphics::quadraticCurveTo(double cpx, double cpy, double x, double y) {
    if (path.elementCount() == 0)
        path.moveTo(cpx, cpy);
    path.quadTo(cpx, cpy, x, y);
}

void QtGraphics::bezierCurveTo(double c1x, double c1y, double c2x, double c2y, double x, double y) {
    if (path.elementCount() == 0)
        path.moveTo(c1x, c1y);
    path.cubicTo(c1x, c1y, c2x, c2y, x, y);
}

void QtGraphics::rect(double x, double y, double w, double h) {
    path.addRect(QRectF(x, y, w, h));
}

QPen QtGraphics::makePen() const {
    QPen pen;
    if (st.strokeGradient)
        pen.setBrush(QBrush(*st.strokeGradient));
    else
        pen.setColor(st.strokeColor);
    pen.setWidthF(st.lineWidth);
    pen.setJoinStyle(Qt::MiterJoin);
    pen.setCapStyle(st.cap == CAP_ROUND ? Qt::RoundCap : st.cap == CAP_SQUARE ? Qt::SquareCap : Qt::FlatCap);
    if (st.dashOn > 0 && st.lineWidth > 0) {
        // Qt dash lengths are in units of the pen width
        pen.setDashPattern({st.dashOn / st.lineWidth, st.dashOff / st.lineWidth});
    }
    return pen;
}

void QtGraphics::stroke() {
    p.strokePath(path, makePen());
}

void QtGraphics::fill() {
    p.fillPath(path, st.fillColor);
}

void QtGraphics::strokeRect(double x, double y, double w, double h) {
    QPainterPath r;
    r.addRect(QRectF(x, y, w, h));
    p.strokePath(r, makePen());
}

void QtGraphics::setStrokeGradient(double x0, double y0, double x1, double y1, const Color &c0, const Color &c1) {
    QLinearGradient grad(x0, y0, x1, y1);
    grad.setColorAt(0, toQColor(c0));
    grad.setColorAt(1, toQColor(c1));
    st.strokeGradient = grad;
}
