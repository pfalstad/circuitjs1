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

#include "JfetElm.h"

#include "../core/StringTokenizer.h"

#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"

std::string JfetElm::lastJfetModelName = "default-jfet";

JfetElm::JfetElm(int xx, int yy, bool pnpflag) : MosfetElm(xx, yy, pnpflag) {
    noDiagonal = true;
    diode.setupForDefaultModel();
}

JfetElm::JfetElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : MosfetElm(xa, ya, xb, yb, f, st) {
    noDiagonal = true;
    diode.setupForDefaultModel();
}

void JfetElm::reset() {
    MosfetElm::reset();
    diode.reset();
}

void JfetElm::draw(Graphics &g) {
    setBbox(point1, point2, hs);
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, src[0], src[1]);
    drawThickLine(g, src[1], src[2]);
    setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, drn[0], drn[1]);
    drawThickLine(g, drn[1], drn[2]);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, gatePt);
    g.fillPolygon(arrowPoly);
    setPowerColor(g, true);
    g.fillPolygon(gatePoly);
    curcountd = updateDotCount(-ids, curcountd);
    curcountg = updateDotCount(gateCurrent, curcountg);
    curcounts = updateDotCount(-gateCurrent - ids, curcounts);
    if (curcountd != 0 || curcounts != 0) {
        drawDots(g, src[0], src[1], curcounts);
        drawDots(g, src[1], src[2], addCurCount(curcounts, 8));
        drawDots(g, drn[0], drn[1], -curcountd);
        drawDots(g, drn[1], drn[2], -addCurCount(curcountd, 8));
        drawDots(g, point1, gatePt, curcountg);
    }
    // label pins when highlighted (copied from MosfetElm)
    if (needsHighlight()) {
        g.setColor(whiteColor);
        g.setFont(unitsFont);
        // make fiddly adjustments to pin label locations depending on orientation
        int dsx = sign(dx);
        int dsyn = dy == 0 ? 0 : 1;
        if (dy == 0) {
            g.drawString("G", gate[1].x - (dx < 0 ? -2 : 12), gate[1].y + ((dy > 0) ? -5 : 12));
            g.drawString(pnp == -1 ? "D" : "S", src[0].x - 3 + 9 * (dsx - dsyn * pnp), src[0].y + 4);
            g.drawString(pnp == -1 ? "S" : "D", drn[0].x - 3 + 9 * (dsx - dsyn * pnp), drn[0].y + 4);
        } else if (dx == 0) {
            g.drawString("G", gate[1].x - (dx < 0 ? -2 : 12), gate[1].y + ((dy > 0) ? -5 : 12));
            g.drawString(pnp == -1 ? "D" : "S", src[0].x - 4, src[0].y - (dy < 0 ? 7 : -14));
            g.drawString(pnp == -1 ? "S" : "D", drn[0].x - 4, drn[0].y - (dy < 0 ? 7 : -14));
        }
    }
    drawPosts(g);
}

double JfetElm::getCurrentIntoNode(int n) {
    if (n == 0)
        return -gateCurrent;
    if (n == 1)
        return gateCurrent + ids;
    return -ids;
}

void JfetElm::setPoints() {
    MosfetElm::setPoints();

    // find the coordinates of the various points we need to draw
    // the JFET.
    int hs2 = hs * dsign;
    if ((flags & FLAG_FLIP) != 0)
        hs2 = -hs2;
    src = newPointArray(3);
    drn = newPointArray(3);
    interpPoint2(point1, point2, src[0], drn[0], 1, -hs2);
    interpPoint2(point1, point2, src[1], drn[1], 1, -hs2 / 2.0);
    interpPoint2(point1, point2, src[2], drn[2], 1 - 10 / dn, -hs2 / 2.0);
    gatePt = interpPoint(point1, point2, 1 - 14 / dn);
    std::vector<Point> ra = newPointArray(4);
    interpPoint2(point1, point2, ra[0], ra[1], 1 - 13 / dn, hs);
    interpPoint2(point1, point2, ra[2], ra[3], 1 - 10 / dn, hs);
    gatePoly = createPolygon(ra[0], ra[1], ra[3], ra[2]);
    if (pnp == -1) {
        Point x = interpPoint(gatePt, point1, 18 / dn);
        arrowPoly = calcArrow(gatePt, x, 12, 5);
    } else
        arrowPoly = calcArrow(point1, gatePt, 12, 5);
}

void JfetElm::stamp() {
    MosfetElm::stamp();
    if (pnp < 0)
        diode.stamp(nodes[1], nodes[0]);
    else
        diode.stamp(nodes[0], nodes[1]);
}

void JfetElm::doStep() {
    MosfetElm::doStep();
    diode.doStep(pnp * (nodes[0]->v - nodes[1]->v));
}

void JfetElm::calculateCurrent() {
    gateCurrent = pnp * diode.calculateCurrent(pnp * (nodes[0]->v - nodes[1]->v));
}

std::optional<EditInfo> JfetElm::getEditInfo(int n) {
    if (n < 3)
        return MosfetElm::getEditInfo(n);
    return std::nullopt;
}

std::string JfetElm::getScopeText(int) {
    return Locale::LS(std::string(pnp == -1 ? "p-" : "n-") + "JFET");
}
