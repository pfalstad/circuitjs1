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

#include "NortonAmpElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/Graphics.h"
#include "../core/WireRouter.h"
#include "../core/XmlDoc.h"

// External nodes in model order: in+ (nd=3), in- (nd=1), out (nd=4)
static const std::vector<int> modelExternalNodes = {3, 1, 4};

// Child elements with node assignments ("nn" attribute)
static const char *modelXmlStr =
    "<elms>"
    "<d nn=\"1 0\" f=\"2\" mo=\"default\"/>"
    "<d nn=\"2 0\" f=\"2\" mo=\"default\"/>"
    "<CCCS nn=\"3 2 1 0\" f=\"0\" ic=\"2\" ex=\"-a\"/>"
    "<a nn=\"1 0 4\" f=\"8\" ma=\"12\" mi=\"0\" ga=\"100000\"/>"
    "</elms>";

static const std::vector<const XmlElement *> &modelElements() {
    static std::unique_ptr<XmlElement> doc = parseXml(modelXmlStr);
    static std::vector<const XmlElement *> elms;
    if (elms.empty())
        for (const auto &c : doc->children)
            elms.push_back(c.get());
    return elms;
}

void NortonAmpElm::init() {
    loadCompositeXml(modelElements(), modelExternalNodes);
    buildCompNodeList();
    allocNodes();
    noDiagonal = true;
    setSize(useSmallGrid() ? 1 : 2);
}

void NortonAmpElm::undumpXml(CircuitXMLDeserializer &xml) {
    CompositeElm::undumpXml(xml);
    setSize((flags & FLAG_SMALL) != 0 ? 1 : 2);
}

void NortonAmpElm::draw(Graphics &g) {
    setBbox(point1, point2, opheight * 2);
    setVoltageColor(g, nodes[0]->v);  // post 0 = in+
    drawThickLine(g, in1p[0], in1p[1]);
    setVoltageColor(g, nodes[1]->v);  // post 1 = in-
    drawThickLine(g, in2p[0], in2p[1]);
    setVoltageColor(g, nodes[2]->v);  // post 2 = out
    drawThickLine(g, lead2, point2);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    setPowerColor(g, true);
    drawThickPolygon(g, triangle);
    g.setFont(plusFont);
    drawCenteredText(g, "+", textp[0].x, textp[0].y - 2, true);
    drawCenteredText(g, "-", textp[1].x, textp[1].y, true);
    drawThickCircle(g, nortonCenter.x, nortonCenter.y, nortonRadius);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    g.fillPolygon(nortonTriangle);
    curcount0 = updateDotCount(-getCurrentIntoNode(0), curcount0);
    drawDots(g, in1p[0], in1p[1], curcount0);
    curcount1 = updateDotCount(-getCurrentIntoNode(1), curcount1);
    drawDots(g, in2p[0], in2p[1], curcount1);
    curcount = updateDotCount(-getCurrentIntoNode(2), curcount);
    drawDots(g, point2, lead2, curcount);
    drawPosts(g);
}

void NortonAmpElm::setSize(int s) {
    opsize = s;
    opheight = 8 * s;
    opwidth = 13 * s;
    flags = (flags & ~FLAG_SMALL) | ((s == 1) ? FLAG_SMALL : 0);
}

void NortonAmpElm::setPoints() {
    CompositeElm::setPoints();
    if (dn > 150 && isCreating())
        setSize(2);
    int ww = opwidth;
    if (ww > dn / 2)
        ww = (int) std::trunc(dn / 2);
    calcLeads(ww * 2);
    int hs = opheight * dsign;
    if ((flags & FLAG_SWAP) != 0)
        hs = -hs;
    in1p = newPointArray(2);
    in2p = newPointArray(2);
    textp = newPointArray(2);
    interpPoint2(point1, point2, in1p[0], in2p[0], 0, hs);
    interpPoint2(lead1, lead2, in1p[1], in2p[1], 0, hs);
    interpPoint2(lead1, lead2, textp[0], textp[1], .2, hs);
    std::vector<Point> tris = newPointArray(2);
    interpPoint2(lead1, lead2, tris[0], tris[1], 0, hs * 2);
    triangle = createPolygon(tris[0], tris[1], lead2);
    plusFont = Font("SansSerif", 0, opsize == 2 ? 14 : 10);

    nortonCenter = Point(lead1.x, lead1.y);
    nortonRadius = (int) std::trunc(opheight * .5);

    Point innerTip(0, 0);
    std::vector<Point> innerBase = newPointArray(2);
    interpPoint(in1p[1], in2p[1], innerTip, 1.2 / 3);
    interpPoint2(in1p[1], in2p[1], innerBase[0], innerBase[1], 1.8 / 3, opheight * 0.3);
    nortonTriangle = createPolygon(innerTip, innerBase[0], innerBase[1]);

    setPost(0, in1p[0]);  // in+
    setPost(1, in2p[0]);  // in-
    setPost(2, point2);   // out
}

void NortonAmpElm::reset() {
    CompositeElm::reset();
    curcount0 = curcount1 = 0;
}

void NortonAmpElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "norton amp";
    arr[1] = "V+ = " + getVoltageText(nodes[0]->v);
    arr[2] = "V- = " + getVoltageText(nodes[1]->v);
    arr[3] = "Vout = " + getVoltageText(nodes[2]->v);
    arr[4] = "Iout = " + getCurrentText(-getCurrentIntoNode(2));
}

void NortonAmpElm::flipX(int c2, int count) {
    if (dx == 0)
        flags ^= FLAG_SWAP;
    CompositeElm::flipX(c2, count);
}

void NortonAmpElm::flipY(int c2, int count) {
    if (dy == 0)
        flags ^= FLAG_SWAP;
    CompositeElm::flipY(c2, count);
}

void NortonAmpElm::flipXY(int xmy, int count) {
    flags ^= FLAG_SWAP;
    CompositeElm::flipXY(xmy, count);
}
