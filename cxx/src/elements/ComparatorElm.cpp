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

#include "ComparatorElm.h"

#include <cmath>

#include "../core/Graphics.h"
#include "../core/StringTokenizer.h"

static const char *modelString = "OpAmpElm 1 2 3\rAnalogSwitchElm 4 5 3\rGroundElm 5";
static const std::vector<int> modelExternalNodes = {2, 1, 4};

ComparatorElm::ComparatorElm(int xx, int yy) : CompositeElm(xx, yy) {
    loadComposite(nullptr, modelString, modelExternalNodes);
    noDiagonal = true;
    setSize(useSmallGrid() ? 1 : 2);
}

ComparatorElm::ComparatorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CompositeElm(xa, ya, xb, yb, f) {
    loadComposite(&st, modelString, modelExternalNodes);
    noDiagonal = true;
    setSize((f & FLAG_SMALL) != 0 ? 1 : 2);
}

void ComparatorElm::setSize(int s) {
    opsize = s;
    opheight = 8 * s;
    opwidth = 13 * s;
    flags = (flags & ~FLAG_SMALL) | (s == 1 ? FLAG_SMALL : 0);
}

void ComparatorElm::draw(Graphics &g) {
    setBbox(point1, point2, opheight * 2);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, in1p[0], in1p[1]);
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, in2p[0], in2p[1]);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    setPowerColor(g, true);
    drawThickPolygon(g, triangle);
    g.setFont(plusFont);
    drawCenteredText(g, "-", textp[0].x, textp[0].y - 2, true);
    drawCenteredText(g, "+", textp[1].x, textp[1].y, true);
    drawCenteredText(g, "\u2265?", textp[2].x, textp[2].y, true);
    setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, lead2, point2);
    curcount = updateDotCount(-getCurrentIntoNode(2), curcount);
    drawDots(g, point2, lead2, curcount);
    drawPosts(g);
}

void ComparatorElm::setPoints() {
    CompositeElm::setPoints();
    if (dn > 150 && isCreating())
        setSize(2);
    int ww = opwidth;
    if (ww > dn / 2)
        ww = (int) std::trunc(dn / 2);
    calcLeads(ww * 2);
    int hs = opheight * dsign;
    in1p = newPointArray(2);
    in2p = newPointArray(2);
    textp = newPointArray(3);
    int sgn = hasFlag(FLAG_SWAP) ? -1 : 1;
    interpPoint2(point1, point2, in1p[0], in2p[0], 0, hs * sgn);
    interpPoint2(lead1, lead2, in1p[1], in2p[1], 0, hs * sgn);
    interpPoint2(lead1, lead2, textp[0], textp[1], 0.2, hs * sgn);
    interpPoint(lead1, lead2, textp[2], 0.5, 0);
    std::vector<Point> tris = newPointArray(2);
    interpPoint2(lead1, lead2, tris[0], tris[1], 0, hs * 2);
    triangle = createPolygon(tris[0], tris[1], lead2);
    plusFont = Font("SansSerif", 0, opsize == 2 ? 14 : 10);
    setPost(0, in1p[0]);
    setPost(1, in2p[0]);
    setPost(2, point2);
}

void ComparatorElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "Comparator";
    arr[1] = "V+ = " + getVoltageText(nodes[1]->v);
    arr[2] = "V- = " + getVoltageText(nodes[0]->v);
}

void ComparatorElm::flipX(int c2, int count) {
    if (dx == 0)
        flags ^= FLAG_SWAP;
    CompositeElm::flipX(c2, count);
}

void ComparatorElm::flipY(int c2, int count) {
    if (dy == 0)
        flags ^= FLAG_SWAP;
    CompositeElm::flipY(c2, count);
}

void ComparatorElm::flipXY(int xmy, int count) {
    flags ^= FLAG_SWAP;
    CompositeElm::flipXY(xmy, count);
}
