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

#include "DarlingtonElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/StringTokenizer.h"
#include "TransistorElm.h"

static const char *modelString = "NTransistorElm 1 2 4\rNTransistorElm 4 2 3";
static const std::vector<int> modelExternalNodes = {1, 2, 3};

DarlingtonElm::DarlingtonElm(int xx, int yy, bool pnpflag) : CompositeElm(xx, yy) {
    loadComposite(nullptr, modelString, modelExternalNodes);
    pnp = pnpflag ? -1 : 1;
    noDiagonal = true;
    setChildPnp();
}

DarlingtonElm::DarlingtonElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CompositeElm(xa, ya, xb, yb, f) {
    loadComposite(&st, modelString, modelExternalNodes);
    pnp = parseIntStrict(st.nextToken());
    noDiagonal = true;
    setChildPnp();
}

void DarlingtonElm::setChildPnp() {
    static_cast<TransistorElm *>(compElmList[0])->pnp = pnp;
    static_cast<TransistorElm *>(compElmList[1])->pnp = pnp;
}

void DarlingtonElm::reset() {
    CompositeElm::reset();
    curcount_c = curcount_e = curcount_b = 0;
}

void DarlingtonElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CompositeElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "pnp", pnp);
}

void DarlingtonElm::undumpXml(CircuitXMLDeserializer &xml) {
    CompositeElm::undumpXml(xml);
    pnp = xml.parseIntAttr("pnp", pnp);
    setChildPnp();
}

void DarlingtonElm::draw(Graphics &g) {
    setBbox(point1, point2, 16);
    setPowerColor(g, true);
    // draw collector
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, coll[0], coll[1]);
    drawThickLine(g, coll2[0], coll2[1]);
    drawThickLine(g, coll[0], coll2[0]);
    // draw emitter
    setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, emit[0], emit[1]);
    // draw arrow
    g.setColor(lightGrayColor);
    g.fillPolygon(arrowPoly);
    // draw base
    setVoltageColor(g, nodes[0]->v);
    if (showPower())
        g.setColor(lightGrayColor);
    drawThickLine(g, point1, base);
    // draw dots
    curcount_b = updateDotCount(getCurrentIntoNode(0), curcount_b);
    drawDots(g, base, point1, curcount_b);
    curcount_c = updateDotCount(getCurrentIntoNode(1), curcount_c);
    drawDots(g, coll[1], coll[0], curcount_c);
    curcount_e = updateDotCount(getCurrentIntoNode(2), curcount_e);
    drawDots(g, emit[1], emit[0], curcount_e);
    // draw base rectangle
    setVoltageColor(g, nodes[0]->v);
    setPowerColor(g, true);
    g.fillPolygon(rectPoly);

    if ((needsHighlight() || isCreating()) && dy == 0) {
        g.setColor(whiteColor);
        int ds = sign(dx);
        g.drawString("B", base.x - 10 * ds, base.y - 5);
        g.drawString("C", coll[0].x - 3 + 9 * ds, coll[0].y + 4);
        g.drawString("E", emit[0].x - 3 + 9 * ds, emit[0].y + 4);
    }
    drawPosts(g);
}

void DarlingtonElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = Locale::LS("darlington pair") + " (" + (pnp == -1 ? "PNP)" : "NPN)");
    double vbc = nodes[0]->v - nodes[1]->v;
    double vbe = nodes[0]->v - nodes[2]->v;
    double vce = nodes[1]->v - nodes[2]->v;
    arr[1] = "Ic = " + getCurrentText(-getCurrentIntoNode(1));
    arr[2] = "Ib = " + getCurrentText(-getCurrentIntoNode(0));
    arr[3] = "Vbe = " + getVoltageText(vbe);
    arr[4] = "Vbc = " + getVoltageText(vbc);
    arr[5] = "Vce = " + getVoltageText(vce);
}

void DarlingtonElm::setPoints() {
    CompositeElm::setPoints();
    const int hs = 16;
    int hs2 = hs * dsign * pnp;
    coll = newPointArray(2);
    coll2 = newPointArray(2);
    emit = newPointArray(2);
    interpPoint2(point1, point2, coll[0], emit[0], 1, hs2);
    coll2[0] = interpPoint(point1, point2, 1, hs2 - 5 * dsign * pnp);
    rect = newPointArray(4);
    interpPoint2(point1, point2, rect[0], rect[1], 1 - 16 / dn, hs);
    interpPoint2(point1, point2, rect[2], rect[3], 1 - 13 / dn, hs);
    interpPoint2(point1, point2, coll[1], emit[1], 1 - 13 / dn, 6 * dsign * pnp);
    coll2[1] = interpPoint(point1, point2, 1 - 13 / dn, dsign * pnp);
    base = Point();
    interpPoint(point1, point2, base, 1 - 16 / dn);
    rectPoly = createPolygon(rect[0], rect[2], rect[3], rect[1]);
    if (pnp == 1)
        arrowPoly = calcArrow(emit[1], emit[0], 8, 4);
    else {
        Point pt = interpPoint(point1, point2, 1 - 11 / dn, -5 * dsign * pnp);
        arrowPoly = calcArrow(emit[0], pt, 8, 4);
    }
    setPost(0, point1);
    setPost(1, coll[0]);
    setPost(2, emit[0]);
}
