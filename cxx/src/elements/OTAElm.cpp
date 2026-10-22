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

#include "OTAElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/StringTokenizer.h"
#include "RailElm.h"

static const char *modelString =
    "RailElm 4\rRailElm 10\rNTransistorElm 1 2 3\rNTransistorElm 3 1 4\rNTransistorElm 3 3 4\rNTransistorElm 5 6 2\r"
    "NTransistorElm 7 8 2\rPTransistorElm 9 6 10\rPTransistorElm 9 9 10\rPTransistorElm 6 12 9\rPTransistorElm 11 8 10\r"
    "PTransistorElm 11 11 10\rPTransistorElm 8 13 11\rNTransistorElm 14 14 4\rNTransistorElm 14 12 4\r"
    "NTransistorElm 12 13 14\rNTransistorElm 15 15 5\rNTransistorElm 15 15 7";
static const std::vector<int> modelExternalNodes = {7, 5, 15, 1, 13};

OTAElm::OTAElm(int xx, int yy) : CompositeElm(xx, yy) {
    noDiagonal = true;
    loadComposite(nullptr, modelString, modelExternalNodes);
    initOTA();
}

OTAElm::OTAElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CompositeElm(xa, ya, xb, yb, f) {
    noDiagonal = true;
    loadComposite(&st, modelString, modelExternalNodes);
    negVolt = static_cast<RailElm *>(compElmList[0])->maxVoltage;
    posVolt = static_cast<RailElm *>(compElmList[1])->maxVoltage;
}

void OTAElm::initOTA() {
    static_cast<RailElm *>(compElmList[0])->maxVoltage = negVolt;
    static_cast<RailElm *>(compElmList[1])->maxVoltage = posVolt;
}

void OTAElm::reset() {
    CompositeElm::reset();
    curCount0 = curCount1 = curCount2 = curCount3 = 0;
}

void OTAElm::draw(Graphics &g) {
    setBbox(point1, point2, 3 * opheight / 2);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, in1p[0], in1p[1]);
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, in2p[0], in2p[1]);
    setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, in3p[0], in3p[1]);
    setVoltageColor(g, nodes[3]->v);
    drawThickLine(g, in4p[0], in4p[1]);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    setPowerColor(g, true);
    drawThickPolygon(g, triangle);
    g.fillPolygon(arrowPoly1);
    g.fillPolygon(arrowPoly2);
    drawThickLine(g, bar1[0], bar1[1]);
    drawThickLine(g, bar2[0], bar2[1]);
    drawThickCircle(g, circCent[0].x, circCent[0].y, circDiam / 2.);
    drawThickCircle(g, circCent[1].x, circCent[1].y, circDiam / 2.);
    g.setFont(plusFont);
    drawCenteredText(g, "+", textp[0].x, textp[0].y - 2, true);
    drawCenteredText(g, "-", textp[1].x, textp[1].y, true);
    curCount0 = updateDotCount(-getCurrentIntoNode(0), curCount0);
    drawDots(g, in1p[0], in1p[1], curCount0);
    curCount1 = updateDotCount(-getCurrentIntoNode(1), curCount1);
    drawDots(g, in2p[0], in2p[1], curCount0);
    curCount2 = updateDotCount(-getCurrentIntoNode(2), curCount2);
    drawDots(g, in3p[0], in3p[1], curCount2);
    curCount3 = updateDotCount(-getCurrentIntoNode(3), curCount3);
    drawDots(g, in4p[0], in4p[1], curCount3);
    drawPosts(g);
}

void OTAElm::setPoints() {
    CompositeElm::setPoints();
    const int ww = opwidth;
    const int wtot = ww * 2 + 2 * circDiam - circOverlap;

    if (dn > wtot) {
        lead1 = interpPoint(point1, point2, 1.0 - wtot / dn, 0);
        lead2 = point2;
        point2bis = point2;
    } else {
        lead1 = point1;
        lead2 = interpPoint(point1, point2, wtot / dn, 0);
        point2bis = lead2;
    }
    int hs = opheight * dsign;
    in1p = newPointArray(2);
    in2p = newPointArray(2);
    in3p = newPointArray(2);
    in4p = newPointArray(2);
    textp = newPointArray(2);
    bar1 = newPointArray(2);
    bar2 = newPointArray(2);
    circCent = newPointArray(2);
    interpPoint2(point1, point2bis, in1p[0], in2p[0], 0, hs);
    interpPoint2(lead1, lead2, in1p[1], in2p[1], 0, hs);
    interpPoint2(lead1, lead2, textp[0], textp[1], .1, hs);
    in3p[0] = point1;
    in3p[1] = lead1;
    in4p[0] = interpPoint(lead1, lead2, 1.0 - (16.0 / wtot), 32);
    in4p[1] = interpPoint(lead1, lead2, 1.0 - (16.0 / wtot), 8);
    std::vector<Point> tris = newPointArray(3);
    interpPoint2(lead1, lead2, tris[0], tris[1], 0, 3 * hs / 2.);
    tris[2] = interpPoint(lead1, lead2, (2.0 * ww) / wtot);
    triangle = createPolygon(tris[0], tris[1], tris[2]);
    circCent[0] = interpPoint(lead1, lead2, 1.0 - (circDiam / (2.0 * wtot)), 0);
    circCent[1] = interpPoint(lead1, lead2, 1.0 - (3 * circDiam / 2.0 - circOverlap) / wtot, 0);
    Point d1 = interpPoint(in3p[1], in1p[1], 0.3333);
    Point d2 = interpPoint(in3p[1], in1p[1], 0.6666);
    arrowPoly1 = calcArrow(d1, d2, 8, 4);
    interpPoint2(d1, d2, bar1[0], bar1[1], 1.0, 4);
    d1 = interpPoint(in3p[1], in2p[1], 0.3333);
    d2 = interpPoint(in3p[1], in2p[1], 0.6666);
    arrowPoly2 = calcArrow(d1, d2, 8, 4);
    interpPoint2(d1, d2, bar2[0], bar2[1], 1.0, 4);
    plusFont = Font("SansSerif", 0, 14);
    setPost(0, in1p[0]);
    setPost(1, in2p[0]);
    setPost(2, in3p[0]);
    setPost(3, in4p[0]);
    setPost(4, point2bis);
}

void OTAElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CompositeElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "pv", posVolt);
    CircuitXMLSerializer::dumpAttr(elem, "nv", negVolt);
}

void OTAElm::undumpXml(CircuitXMLDeserializer &xml) {
    CompositeElm::undumpXml(xml);
    posVolt = xml.parseDoubleAttr("pv", posVolt);
    negVolt = xml.parseDoubleAttr("nv", negVolt);
    initOTA();
}

void OTAElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "OTA (LM13700 style)";
    arr[1] = "Iabc = " + getCurrentText(-getCurrentIntoNode(3));
    arr[2] = "V+ - V- = " + getVoltageText(nodes[0]->v - nodes[1]->v);
}

std::optional<EditInfo> OTAElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Positive Supply Voltage (5-20V)", posVolt, 5, 20).setUnitStep();
    if (n == 1)
        return EditInfo("Negative Supply Voltage (V)", negVolt, -20, -5).setUnitStep();
    return std::nullopt;
}

void OTAElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        posVolt = ei.value;
    if (n == 1)
        negVolt = ei.value;
    initOTA();
}
