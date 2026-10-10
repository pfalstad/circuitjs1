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

#include "OpAmpElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/JsMath.h"

OpAmpElm::OpAmpElm(int xx, int yy) : CircuitElm(xx, yy) {
    noDiagonal = true;
    maxOut = 15;
    minOut = -15;
    gbw = 1e6;
    flags = FLAG_GAIN;  // need to do this before setSize()
    gain = 100000;
    setSize(useSmallGrid() ? 1 : 2);
}

OpAmpElm::OpAmpElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    maxOut = 15;
    minOut = -15;
    // GBW has no effect in this version of the simulator, but we
    // retain it to keep the file format the same
    gbw = 1e6;
    try {
        maxOut = parseFloatStrict(st.nextToken());
        minOut = parseFloatStrict(st.nextToken());
        gbw = parseFloatStrict(st.nextToken());
        double v0 = parseFloatStrict(st.nextToken());
        double v1 = parseFloatStrict(st.nextToken());
        savedVd = v1 - v0;
        justLoaded = true;
        gain = parseFloatStrict(st.nextToken());
    } catch (...) {}
    noDiagonal = true;
    setSize((f & FLAG_SMALL) != 0 ? 1 : 2);
    setGain();
}

void OpAmpElm::setGain() {
    if ((flags & FLAG_GAIN) != 0)
        return;
    // gain of 100000 breaks e-amp-dfdx.txt
    // gain was 1000, but it broke amp-schmitt.txt
    gain = ((flags & FLAG_LOWGAIN) != 0) ? 1000 : 100000;
}

void OpAmpElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ma", maxOut);
    CircuitXMLSerializer::dumpAttr(elem, "mi", minOut);
    CircuitXMLSerializer::dumpAttr(elem, "ga", gain);
}

void OpAmpElm::undumpXml(CircuitXMLDeserializer &xml) {
    flags = 0;  // size might have changed
    CircuitElm::undumpXml(xml);
    maxOut = xml.parseDoubleAttr("ma", maxOut);
    minOut = xml.parseDoubleAttr("mi", minOut);
    gain = xml.parseDoubleAttr("ga", gain);
    setSize((flags & FLAG_SMALL) != 0 ? 1 : 2);
}

void OpAmpElm::setSize(int s) {
    opsize = s;
    opheight = 8 * s;
    opwidth = 13 * s;
    flags = (flags & ~FLAG_SMALL) | ((s == 1) ? FLAG_SMALL : 0);
}

void OpAmpElm::setPoints() {
    CircuitElm::setPoints();
    if (dn > 150 && isCreating())
        setSize(2);
    int ww = opwidth;
    if (ww > dn / 2)
        ww = (int) std::floor(dn / 2);
    calcLeads(ww * 2);
    int hs = opheight * dsign;
    int hsSwapped = ((flags & FLAG_SWAP) != 0) ? -hs : hs;
    in1p = newPointArray(2);
    in2p = newPointArray(2);
    textp = newPointArray(2);
    interpPoint2(point1, point2, in1p[0], in2p[0], 0, hsSwapped);
    interpPoint2(lead1, lead2, in1p[1], in2p[1], 0, hsSwapped);
    interpPoint2(lead1, lead2, textp[0], textp[1], .2, hsSwapped);
    std::vector<Point> tris = newPointArray(2);
    interpPoint2(lead1, lead2, tris[0], tris[1], 0, hsSwapped * 2);
    triangle = createPolygon(tris[0], tris[1], lead2);
    plusFont = Font("SansSerif", 0, opsize == 2 ? 14 : 10);
}

Point OpAmpElm::getPost(int n) {
    if (in1p.empty())  // before setPoints()
        return point1;
    return (n == 0) ? in1p[0] : (n == 1) ? in2p[0] : point2;
}

void OpAmpElm::stamp() {
    sim->stampNonLinearVS(voltSource);
    sim->stampMatrixVN(nodes[2], voltSource, 1);
}

void OpAmpElm::doStep() {
    double vd = justLoaded ? savedVd : nodes[1]->v - nodes[0]->v;
    justLoaded = false;
    double midpoint = (maxOut + minOut) * .5;
    if (std::abs(lastvd - vd) > .1)
        sim->converged = false;
    else if (nodes[2]->v > maxOut + .1 || nodes[2]->v < minOut - .1)
        sim->converged = false;
    double x = 0;
    double ddx = 0;
    double maxAdj = maxOut - midpoint;
    double minAdj = minOut - midpoint;
    if (vd >= maxAdj / gain && (lastvd >= 0 || app->getrand(4) == 1)) {
        ddx = 1e-4;
        x = maxOut - ddx * maxAdj / gain;
    } else if (vd <= minAdj / gain && (lastvd <= 0 || app->getrand(4) == 1)) {
        ddx = 1e-4;
        x = minOut - ddx * minAdj / gain;
    } else {
        ddx = gain;
        x = midpoint;
    }
    // newton-raphson
    sim->stampMatrixNV(voltSource, nodes[0], ddx);
    sim->stampMatrixNV(voltSource, nodes[1], -ddx);
    sim->stampMatrixNV(voltSource, nodes[2], 1);
    sim->stampRightSideVS(voltSource, x);
    lastvd = vd;
}

void OpAmpElm::flipX(int c2, int count) {
    if (dx == 0)
        flags ^= FLAG_SWAP;
    CircuitElm::flipX(c2, count);
}

void OpAmpElm::flipY(int c2, int count) {
    if (dy == 0)
        flags ^= FLAG_SWAP;
    CircuitElm::flipY(c2, count);
}

void OpAmpElm::flipXY(int xmy, int count) {
    flags ^= FLAG_SWAP;
    CircuitElm::flipXY(xmy, count);
}

void OpAmpElm::draw(Graphics &g) {
    setBbox(point1, point2, opheight * 2);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, in1p[0], in1p[1]);
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, in2p[0], in2p[1]);
    setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, lead2, point2);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    setPowerColor(g, true);
    drawThickPolygon(g, triangle);
    g.setFont(plusFont);
    drawCenteredText(g, "-", textp[0].x, textp[0].y - 2, true);
    drawCenteredText(g, "+", textp[1].x, textp[1].y, true);
    curcount = updateDotCount(current, curcount);
    drawDots(g, point2, lead2, curcount);
    drawPosts(g);
}

void OpAmpElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "op-amp";
    arr[1] = "V+ = " + getVoltageText(nodes[1]->v);
    arr[2] = "V- = " + getVoltageText(nodes[0]->v);
    // sometimes the voltage goes slightly outside range, to make
    // convergence easier.  so we hide that here.
    double vo = std::max(std::min(nodes[2]->v, maxOut), minOut);
    arr[3] = "Vout = " + getVoltageText(vo);
    arr[4] = "Iout = " + getCurrentText(-current);
    arr[5] = "range = " + getVoltageText(minOut) + " to " + getVoltageText(maxOut);
}

std::optional<EditInfo> OpAmpElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Max Output (V)", maxOut, 1, 20);
    if (n == 1)
        return EditInfo("Min Output (V)", minOut, -20, 0);
    if (n == 2)
        return EditInfo("Gain", gain, 10, 1000000).setPositive();
    return std::nullopt;
}

void OpAmpElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        maxOut = ei.value;
    if (n == 1)
        minOut = ei.value;
    if (n == 2)
        gain = ei.value;
}
