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

// CircuitElm's drawing and info-text methods (the rest is in CircuitElm.cpp)

#include <algorithm>
#include <cmath>

#include "CircuitElm.h"
#include "Scope.h"
#include "../elements/ScopeElm.h"
#include "CustomLogicModel.h"
#include "MosfetModel.h"
#include "RelayModel.h"
#include "Graphics.h"
#include "JsMath.h"
#include "JsNumber.h"
#include "Locale.h"
#include "SimApp.h"
#include "SimulationManager.h"
#include "Storage.h"

std::vector<Color> CircuitElm::colorScale;
double CircuitElm::currentMult = 0;
double CircuitElm::powerMult = 0;
Point CircuitElm::ps1, CircuitElm::ps2;
Color CircuitElm::whiteColor = Color::white;
Color CircuitElm::lightGrayColor = Color::lightGray;
Color CircuitElm::selectColor = Color::cyan;
Color CircuitElm::positiveColor = Color::green;
Color CircuitElm::negativeColor = Color::red;
Color CircuitElm::neutralColor = Color::gray;
Color CircuitElm::currentColor = Color::yellow;
Font CircuitElm::unitsFont("SansSerif", 0, 12);
Font CircuitElm::valueFont("SansSerif", 0, 12);
int CircuitElm::valueFontSize = 12;
NumberFormat CircuitElm::showFormat = NumberFormat::getFormat("####.###");
NumberFormat CircuitElm::shortFormat = NumberFormat::getFormat("####.#");
NumberFormat CircuitElm::fixedFormat = NumberFormat::getFormat("####.000");
int CircuitElm::decimalDigits = 3;
int CircuitElm::shortDecimalDigits = 1;

void CircuitElm::initClass(SimApp *app_, SimulationManager *sim_) {
    CustomLogicModel::app = app_;
    MosfetModel::app = app_;
    RelayModel::app = app_;
    sim = sim_;
    app = app_;
    colorScale.assign(colorScaleCount, Color());

    Storage *stor = Storage::localStorage;
    decimalDigits = 3;
    shortDecimalDigits = 1;
    if (stor != nullptr) {
        try {
            std::optional<std::string> s1 = stor->getItem("decimalDigits");
            std::optional<std::string> s2 = stor->getItem("decimalDigitsShort");
            if (s1)
                decimalDigits = parseIntStrict(*s1);
            if (s2)
                shortDecimalDigits = parseIntStrict(*s2);
            std::optional<std::string> sf = stor->getItem("valueFontSize");
            if (sf)
                valueFontSize = parseIntStrict(*sf);
        } catch (std::exception &) {
            // a bad saved setting; keep the defaults
        }
    }
    setDecimalDigits(decimalDigits, false, false);
    setDecimalDigits(shortDecimalDigits, true, false);
    unitsFont = Font("SansSerif", 0, 12);
    valueFont = Font("SansSerif", 0, valueFontSize);
    currentMult = 0;
}

void CircuitElm::setValueFontSize(int size) {
    valueFontSize = size;
    valueFont = Font("SansSerif", 0, valueFontSize);
    if (Storage::localStorage != nullptr)
        Storage::localStorage->setItem("valueFontSize", std::to_string(valueFontSize));
}

void CircuitElm::setDecimalDigits(int num, bool sf, bool save) {
    if (sf)
        shortDecimalDigits = num;
    else
        decimalDigits = num;

    std::string s = "####." + std::string(std::max(num, 0), '#');
    NumberFormat nf = NumberFormat::getFormat(s);
    if (sf)
        shortFormat = nf;
    else
        showFormat = nf;

    if (save && Storage::localStorage != nullptr)
        Storage::localStorage->setItem(sf ? "decimalDigitsShort" : "decimalDigits", std::to_string(num));

    if (!sf)
        fixedFormat = NumberFormat::getFormat("####." + std::string(std::max(num, 0), '0'));
}

void CircuitElm::setColorScale() {
    if ((int) colorScale.size() != colorScaleCount)
        colorScale.assign(colorScaleCount, Color());
    for (int i = 0; i != colorScaleCount; i++) {
        double v = i * 2. / colorScaleCount - 1;
        if (v < 0)
            colorScale[i] = Color(neutralColor, negativeColor, -v);
        else
            colorScale[i] = Color(neutralColor, positiveColor, v);
    }
}

void CircuitElm::draw2Leads(Graphics &g) {
    // draw first lead
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1);

    // draw second lead
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, lead2, point2);
}

void CircuitElm::drawDots(Graphics &g, const Point &pa, const Point &pb, double pos) {
    if (!app->simIsRunning() || pos == 0 || !app->options.dots)
        return;
    double ddx = pb.x - pa.x;
    double ddy = pb.y - pa.y;
    double ddn = std::sqrt(ddx * ddx + ddy * ddy);
    g.setColor(currentColor);
    const int ds = 16;
    if (pos == CURRENT_TOO_FAST || pos == -CURRENT_TOO_FAST) {
        // current is moving too fast, avoid aliasing by drawing dots at
        // random position with transparent yellow line underneath
        g.save();
        g.setLineWidth(4);
        g.setGlobalAlpha(.5);
        g.beginPath();
        g.moveTo(pa.x, pa.y);
        g.lineTo(pb.x, pb.y);
        g.stroke();
        g.restore();
        pos = app->randomDouble() * ds;
    }
    pos = std::fmod(pos, ds);
    if (pos < 0)
        pos += ds;
    for (double di = pos; di < ddn; di += ds) {
        int x0 = (int) std::trunc(pa.x + di * ddx / ddn);
        int y0 = (int) std::trunc(pa.y + di * ddy / ddn);
        g.fillRect(x0 - 2, y0 - 2, 4, 4);
    }
}

double CircuitElm::addCurCount(double c, double a) {
    if (c == CURRENT_TOO_FAST || c == -CURRENT_TOO_FAST)
        return c;
    return c + a;
}

Polygon CircuitElm::calcArrow(const Point &a, const Point &b, double al, double aw) {
    Polygon poly;
    Point p1, p2;
    double adx = b.x - a.x;
    double ady = b.y - a.y;
    double l = std::sqrt(adx * adx + ady * ady);
    poly.addPoint(b.x, b.y);
    interpPoint2(a, b, p1, p2, 1 - al / l, aw);
    poly.addPoint(p1.x, p1.y);
    poly.addPoint(p2.x, p2.y);
    return poly;
}

Polygon CircuitElm::createPolygon(const Point &a, const Point &b, const Point &c) {
    Polygon p;
    p.addPoint(a.x, a.y);
    p.addPoint(b.x, b.y);
    p.addPoint(c.x, c.y);
    return p;
}

Polygon CircuitElm::createPolygon(const Point &a, const Point &b, const Point &c, const Point &d) {
    Polygon p = createPolygon(a, b, c);
    p.addPoint(d.x, d.y);
    return p;
}

Polygon CircuitElm::createPolygon(const std::vector<Point> &a) {
    Polygon p;
    for (const Point &pt : a)
        p.addPoint(pt.x, pt.y);
    return p;
}

void CircuitElm::drawPosts(Graphics &g) {
    // we normally do this in updateCircuit() now because the logic is more complicated.
    // we only handle the case where we have to draw all the posts.  That happens when
    // this element is selected or is being created
    if (!isCreating() && !needsHighlight())
        return;
    if (app->mouseMode == SimApp::MODE_DRAG_ROW || app->mouseMode == SimApp::MODE_DRAG_COLUMN)
        return;
    for (int i = 0; i != getPostCount(); i++)
        drawPost(g, getPost(i));
    drawScopeTerminalLabels(g);
}

void CircuitElm::drawScopeTerminalLabels(Graphics &g) {
    if (getPostCount() != 2)
        return;
    if (!app->scopePlotRoles.count(this))
        return;
    if (dn == 0)
        return;
    if (isWireEquivalent())
        return;
    g.setColor(selectColor);
    g.setFont(unitsFont);
    g.save();
    g.setTextBaseline(Graphics::BASELINE_MIDDLE);
    g.setTextAlign(Graphics::ALIGN_CENTER);
    const double axOff = 10, perpOff = 8;
    bool swap = isVoltageElm();
    Point pp = interpPoint(point1, point2, axOff / dn, perpOff);
    g.drawString(swap ? "−" : "+", pp.x, pp.y);
    Point mp = interpPoint(point1, point2, 1 - axOff / dn, perpOff);
    g.drawString(swap ? "+" : "−", mp.x, mp.y);
    g.restore();
}

void CircuitElm::drawHandles(Graphics &g, const Color &c) {
    if (getNumHandles() == 0)
        return;
    g.setColor(c);
    if (lastHandleGrabbed == -1)
        g.fillRect(x - 3, y - 3, 7, 7);
    else if (lastHandleGrabbed == 0)
        g.fillRect(x - 4, y - 4, 9, 9);
    if (getNumHandles() > 1) {
        if (lastHandleGrabbed == -1)
            g.fillRect(x2 - 3, y2 - 3, 7, 7);
        else if (lastHandleGrabbed == 1)
            g.fillRect(x2 - 4, y2 - 4, 9, 9);
    }
}

int CircuitElm::getHandleGrabbedClose(int xtest, int ytest, int deltaSq, int minSize) {
    lastHandleGrabbed = -1;
    if (Graphics::distanceSq(x, y, x2, y2) >= minSize) {
        if (Graphics::distanceSq(x, y, xtest, ytest) <= deltaSq)
            lastHandleGrabbed = 0;
        else if (getNumHandles() > 1 && Graphics::distanceSq(x2, y2, xtest, ytest) <= deltaSq)
            lastHandleGrabbed = 1;
    }
    return lastHandleGrabbed;
}

void CircuitElm::drawPost(Graphics &g, const Point &pt) {
    g.setColor(whiteColor);
    g.fillOval(pt.x - 3, pt.y - 3, 7, 7);
}

void CircuitElm::drawCenteredText(Graphics &g, const std::string &s, double xx, double yy, bool cx) {
    double w = std::trunc(g.measureWidth(s));
    double h2 = std::trunc(g.currentFontSize) / 2;
    g.save();
    g.setTextBaseline(Graphics::BASELINE_MIDDLE);
    if (cx) {
        g.setTextAlign(Graphics::ALIGN_CENTER);
        adjustBbox(xx - w / 2, yy - h2, xx + w / 2, yy + h2);
    } else {
        adjustBbox(xx, yy - h2, xx + w, yy + h2);
    }
    g.drawString(s, xx, yy);
    g.restore();
}

void CircuitElm::drawValues(Graphics &g, const std::string &s, double hs) {
    if (s.empty())
        return;
    g.save();
    g.setFont(valueFont);
    double w = std::trunc(g.measureWidth(s));
    g.setColor(whiteColor);
    double ya = std::trunc(g.currentFontSize) / 2;
    double xc, yc;
    if (isRailElm() || isSweepElm()) {
        xc = x2;
        yc = y2;
    } else {
        xc = (x2 + x) / 2.0;
        yc = (y2 + y) / 2.0;
    }
    int dpx = (int) std::trunc(dpx1 * hs);
    int dpy = (int) std::trunc(dpy1 * hs);
    if (dpx == 0) {
        g.drawString(s, xc - w / 2, yc - std::abs(dpy) - 2);
    } else {
        double xx = xc + std::abs(dpx) + 2;
        if (isVoltageElm() || (x < x2 && y > y2))
            xx = xc - (w + std::abs(dpx) + 2);
        g.drawString(s, xx, yc + dpy + ya);
    }
    g.restore();
}

void CircuitElm::drawLabeledNode(Graphics &g, std::string str, const Point &pt1, const Point &pt2) {
    g.save();
    g.setFont(valueFont);
    bool lineOver = false;
    if (!str.empty() && str[0] == '/') {
        lineOver = true;
        str = str.substr(1);
    }
    double w = std::trunc(g.measureWidth(str));
    double h = std::trunc(g.currentFontSize);
    g.setTextBaseline(Graphics::BASELINE_MIDDLE);
    double xx = pt2.x, yy = pt2.y;
    if (pt1.y != pt2.y) {
        xx -= w / 2;
        yy += sign(pt2.y - pt1.y) * h;
    } else {
        if (pt2.x > pt1.x)
            xx += 4;
        else
            xx -= 4 + w;
    }
    g.drawString(str, xx, yy);
    adjustBbox(xx, yy - h / 2, xx + w, yy + h / 2);
    g.restore();
    if (lineOver) {
        double ya = yy - h / 2 - 1;
        g.drawLine(xx, ya, xx + w, ya);
    }
}

void CircuitElm::drawCoil(Graphics &g, double hs, const Point &p1, const Point &p2, double v1, double v2) {
    double len = distance(p1, p2);

    g.save();
    g.setLineWidth(3.0);
    g.transform((p2.x - p1.x) / len, (p2.y - p1.y) / len,
                -(p2.y - p1.y) / len, (p2.x - p1.x) / len, p1.x, p1.y);
    if (app->options.volts)
        g.setStrokeGradient(0, 0, len, 0, getVoltageColor(g, v1), getVoltageColor(g, v2));
    g.setLineCap(Graphics::CAP_ROUND);
    g.scale(1, hs > 0 ? 1 : -1);

    // draw more loops for a longer coil
    int loopCt = (int) std::ceil(len / 11);
    for (int loop = 0; loop != loopCt; loop++) {
        g.beginPath();
        double start = len * loop / loopCt;
        g.moveTo(start, 0);
        g.arc(len * (loop + .5) / loopCt, 0, len / (2 * loopCt), pi, pi * 2);
        g.lineTo(len * (loop + 1) / loopCt, 0);
        g.stroke();
    }

    g.restore();
}

void CircuitElm::drawThickLine(Graphics &g, double xa, double ya, double xb, double yb) {
    g.setLineWidth(3.0);
    g.drawLine(xa, ya, xb, yb);
    g.setLineWidth(1.0);
}

void CircuitElm::drawThickLine(Graphics &g, const Point &pa, const Point &pb, double width) {
    g.setLineWidth(width);
    g.drawLine(pa, pb);
    g.setLineWidth(1.0);
}

void CircuitElm::drawThickPolygon(Graphics &g, const std::vector<int> &xs, const std::vector<int> &ys, int c) {
    g.setLineWidth(3.0);
    g.drawPolyline(xs, ys, c);
    g.setLineWidth(1.0);
}

void CircuitElm::drawThickPolygon(Graphics &g, const Polygon &p) {
    drawThickPolygon(g, p.xpoints, p.ypoints, p.npoints);
}

void CircuitElm::drawPolygon(Graphics &g, const Polygon &p) {
    g.drawPolyline(p.xpoints, p.ypoints, p.npoints);
}

void CircuitElm::drawThickCircle(Graphics &g, double cx, double cy, double ri) {
    g.setLineWidth(3.0);
    g.beginPath();
    g.arc(cx, cy, ri * .98, 0, 2 * pi);
    g.stroke();
    g.setLineWidth(1.0);
}

Polygon CircuitElm::getSchmittPolygon(double gsize, double ctr) {
    std::vector<Point> pts = newPointArray(6);
    double hs = 3 * gsize;
    double h1 = 3 * gsize;
    double h2 = h1 * 2;
    double len = distance(lead1, lead2);
    pts[0] = interpPoint(lead1, lead2, ctr - h2 / len, hs);
    pts[1] = interpPoint(lead1, lead2, ctr + h1 / len, hs);
    pts[2] = interpPoint(lead1, lead2, ctr + h1 / len, -hs);
    pts[3] = interpPoint(lead1, lead2, ctr + h2 / len, -hs);
    pts[4] = interpPoint(lead1, lead2, ctr - h1 / len, -hs);
    pts[5] = interpPoint(lead1, lead2, ctr - h1 / len, hs);
    return createPolygon(pts);
}

double CircuitElm::updateDotCount(double cur, double cc) {
    if (!app->simIsRunning())
        return cc;
    double cadd = cur * currentMult;
    if (cadd > 6 || cadd < -6)
        return CURRENT_TOO_FAST;
    if (cc == CURRENT_TOO_FAST)
        cc = 0;
    return cc + std::fmod(cadd, 8);
}

void CircuitElm::doDots(Graphics &g) {
    updateDotCount();
    if (!isCreating())
        drawDots(g, point1, point2, curcount);
}

Color CircuitElm::getVoltageColor(Graphics &, double volts) {
    if (needsHighlight())
        return selectColor;
    if (!app->options.volts)
        return whiteColor;
    if (std::isnan(volts))
        volts = 0;
    int c = (int) std::trunc((volts + voltageRange) * (colorScaleCount - 1) / (voltageRange * 2));
    if (c < 0)
        c = 0;
    if (c >= colorScaleCount)
        c = colorScaleCount - 1;
    return colorScale[c];
}

void CircuitElm::setVoltageColor(Graphics &g, double volts) {
    g.setColor(getVoltageColor(g, volts));
}

void CircuitElm::setPowerColor(Graphics &g, bool) {
    if (!showPower())
        return;
    setPowerColor(g, getPower());
}

void CircuitElm::setPowerColor(Graphics &g, double w0) {
    if (!showPower())
        return;
    if (needsHighlight()) {
        g.setColor(selectColor);
        return;
    }
    w0 *= powerMult;
    int i = (int) std::trunc((colorScaleCount / 2) + (colorScaleCount / 2) * -w0);
    if (i < 0)
        i = 0;
    if (i >= colorScaleCount)
        i = colorScaleCount - 1;
    g.setColor(colorScale[i]);
}

void CircuitElm::setConductanceColor(Graphics &g, double w0) {
    w0 *= powerMult;
    double w = (w0 < 0) ? -w0 : w0;
    double wClamped = w > 1 ? 1 : w;
    int rg = (int) std::trunc(wClamped * 255);
    g.setColor(Color(rg, rg, rg));
}

bool CircuitElm::needsHighlight() {
    if (mouseElmRef == this || selected || app->scopePlotRoles.count(this))
        return true;
    // Test if the current mouseElm is a ScopeElm and, if so, does it belong to this elm
    if (mouseElmRef != nullptr && mouseElmRef->isScopeElm()) {
        ScopeElm *se = static_cast<ScopeElm *>(mouseElmRef);
        if (se->elmScope != nullptr && se->elmScope->getElm() == this)
            return true;
    }
    return isOnHighlightedNet();
}

bool CircuitElm::isOnHighlightedNet() {
    if (app->highlightedNode == nullptr)
        return false;
    for (int i = 0; i != getPostCount(); i++)
        if (nodes[i].get() == app->highlightedNode)
            return true;
    return false;
}

bool CircuitElm::isCreating() { return app->dragElm == this; }

std::string CircuitElm::getTimeText(double v) {
    if (v >= 60) {
        double h = std::floor(v / 3600);
        v -= 3600 * h;
        double m = std::floor(v / 60);
        v -= 60 * m;
        if (h == 0)
            return jsNumberToString(m) + ":" + ((v >= 10) ? "" : "0") + showFormat.format(v);
        return jsNumberToString(h) + ":" + ((m >= 10) ? "" : "0") + jsNumberToString(m) + ":" +
            ((v >= 10) ? "" : "0") + showFormat.format(v);
    }
    return getUnitText(v, "s");
}

std::string CircuitElm::format(double v, bool sf) {
    return (sf ? shortFormat : showFormat).format(v);
}

std::string CircuitElm::getUnitTextImpl(double v, const std::string &u, bool sf) {
    std::string sp = sf ? "" : " ";
    double va = std::abs(v);
    if (va < 1e-14)
        // this used to return null, but then wires would display "null" with 0V
        return "0" + sp + u;
    if (va < 1e-9)
        return format(v * 1e12, sf) + sp + "p" + u;
    if (va < 1e-6)
        return format(v * 1e9, sf) + sp + "n" + u;
    if (va < 1e-3)
        return format(v * 1e6, sf) + sp + Locale::muString + u;
    if (va < 1)
        return format(v * 1e3, sf) + sp + "m" + u;
    if (va < 1e3)
        return format(v, sf) + sp + u;
    if (va < 1e6)
        return format(v * 1e-3, sf) + sp + "k" + u;
    if (va < 1e9)
        return format(v * 1e-6, sf) + sp + "M" + u;
    if (va < 1e12)
        return format(v * 1e-9, sf) + sp + "G" + u;
    return NumberFormat::getFormat("#.##E000").format(v) + sp + u;
}

std::string CircuitElm::getUnitTextWithScale(double val, const std::string &utext, int scale, bool fixed) {
    if (std::abs(val) > 1e12)
        return getUnitText(val, utext);
    const NumberFormat &nf = fixed ? fixedFormat : showFormat;
    if (scale == SCALE_1)
        return nf.format(val) + " " + utext;
    if (scale == SCALE_M)
        return nf.format(1e3 * val) + " m" + utext;
    if (scale == SCALE_MU)
        return nf.format(1e6 * val) + " " + Locale::muString + utext;
    return getUnitText(val, utext);
}

std::string CircuitElm::getElmType() {
    std::vector<std::string> info(10);
    getInfo(info);
    return info[0];
}

int CircuitElm::getBasicInfo(std::vector<std::string> &arr) {
    arr[1] = "I = " + getCurrentDText(getCurrent());
    arr[2] = "Vd = " + getVoltageDText(getVoltageDiff());
    return 3;
}

std::string CircuitElm::getScopeText(int) {
    std::vector<std::string> info(10);
    getInfo(info);
    return info[0];
}
