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

#include "UnijunctionElm.h"

#include "../core/Graphics.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

static const char *ujtModelString =
    "DiodeElm 1 4\rVoltageElm 4 5\rCCVSElm 4 5 6 0\rResistorElm 0 6\rVCCSElm 5 7 5 7 6 7 5\rCapacitorElm 5 7\rResistorElm 7 2\rResistorElm 3 5";
static const std::vector<int> ujtExternalNodes = {1, 2, 3};
static const char *ujtModelDump =
    "2 x2n2646-emitter/0 0 0 0 0 0 0/2 2 1000*a/0 1000000/0 5 0.00028*(a-b)\\p0.00575*(c-d)*e/2 3.5e-11 0 0/0 38.15/0 2518";

void UnijunctionElm::setup() {
    noDiagonal = true;
    flags |= FLAG_ESCAPE;
    StringTokenizer st(ujtModelDump, "/");
    loadComposite(&st, ujtModelString, ujtExternalNodes);
    sim->adjustTimeStep = true;
}

void UnijunctionElm::reset() {
    CompositeElm::reset();
    curcountb1 = curcountb2 = curcounte = 0;
}

void UnijunctionElm::draw(Graphics &g) {
    setBbox(point1, b1[0], 0);
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, b1[0], b1[1]);
    drawThickLine(g, b1[1], b1[2]);
    setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, b2[0], b2[1]);
    drawThickLine(g, b2[1], b2[2]);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, emitter[0], emitter[1]);
    drawThickLine(g, emitter[1], emitter[2]);
    g.fillPolygon(arrowPoly);
    setPowerColor(g, true);
    g.fillPolygon(emitterPoly);
    double ib2 = -getCurrentIntoNode(2);
    double ib1 = -getCurrentIntoNode(1);
    curcountb2 = updateDotCount(ib2, curcountb2);
    curcountb1 = updateDotCount(ib1, curcountb1);
    curcounte = updateDotCount(-ib1 - ib2, curcounte);
    if (curcountb1 != 0 || curcountb2 != 0) {
        drawDots(g, b1[0], b1[1], curcountb1);
        drawDots(g, b1[1], b1[2], addCurCount(curcountb1, 8));
        drawDots(g, b2[0], b2[1], curcountb2);
        drawDots(g, b2[1], b2[2], addCurCount(curcountb2, 8));
        drawDots(g, emitter[0], emitter[1], curcounte);
        drawDots(g, emitter[1], emitter[2], curcounte);
    }
    drawPosts(g);
}

void UnijunctionElm::setPoints() {
    CompositeElm::setPoints();
    int flip = hasFlag(FLAG_FLIP) ? -1 : 1;
    int hs2 = hs * dsign * flip;
    b1 = newPointArray(3);
    b2 = newPointArray(3);
    emitter = newPointArray(3);
    Point p1 = interpPoint(point1, point2, 0, -hs2);
    Point p2 = interpPoint(point1, point2, 1, -hs2);
    interpPoint2(p1, p2, b1[0], b2[0], 1, -hs2);
    interpPoint2(p1, p2, b1[1], b2[1], 1, -hs2 / 2.);
    interpPoint2(p1, p2, b1[2], b2[2], 1 - 10 / dn, -hs2 / 2.);

    emitter[0] = interpPoint(p1, p2, 0, hs2);
    emitter[1] = interpPoint(p1, p2, 1 - 28 / dn, hs2);
    emitter[2] = interpPoint(p1, p2, 1 - 14 / dn);

    std::vector<Point> ra = newPointArray(4);
    interpPoint2(p1, p2, ra[0], ra[1], 1 - 13 / dn, hs);
    interpPoint2(p1, p2, ra[2], ra[3], 1 - 10 / dn, hs);
    emitterPoly = createPolygon(ra[0], ra[1], ra[3], ra[2]);
    arrowPoly = calcArrow(emitter[1], emitter[2], 8, 3);
}

void UnijunctionElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "unijunction transistor";
    arr[1] = "Ie = " + getCurrentText(-getCurrentIntoNode(0));
    arr[2] = "Ib2 = " + getCurrentText(-getCurrentIntoNode(2));
    arr[3] = "Veb1 = " + getVoltageText(nodes[0]->v - nodes[1]->v);
    arr[4] = "Vb2b1 = " + getVoltageText(nodes[2]->v - nodes[1]->v);
    arr[5] = "P = " + getUnitText(getPower(), "W");
}

void UnijunctionElm::flipX(int c2, int count) {
    if (dx == 0)
        flags ^= FLAG_FLIP;
    CompositeElm::flipX(c2, count);
}

void UnijunctionElm::flipY(int c2, int count) {
    if (dy == 0)
        flags ^= FLAG_FLIP;
    CompositeElm::flipY(c2, count);
}

void UnijunctionElm::flipXY(int xmy, int count) {
    flags ^= FLAG_FLIP;
    CompositeElm::flipXY(xmy, count);
}
