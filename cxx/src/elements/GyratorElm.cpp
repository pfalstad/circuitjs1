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

#include "GyratorElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/SimulationManager.h"

GyratorElm::GyratorElm(int xx, int yy) : CircuitElm(xx, yy) {
    gyrResistance = 1000;
    width = 32;
    noDiagonal = true;
    currents[0] = currents[1] = 0;
    curcounts[0] = curcounts[1] = 0;
}

void GyratorElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "r", gyrResistance);
    CircuitXMLSerializer::dumpAttr(elem, "wi", width);
}

void GyratorElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    if (hasFlag(FLAG_VERTICAL))
        width = -std::max(32, std::abs(x2 - x));
    else
        width = std::max(32, std::abs(y2 - y));
    gyrResistance = xml.parseDoubleAttr("r", gyrResistance);
    width = xml.parseIntAttr("wi", width);
}

void GyratorElm::drag(int xx, int yy) {
    xx = snapGrid(xx);
    yy = snapGrid(yy);
    if (std::abs(xx - x) > std::abs(yy - y))
        flags &= ~FLAG_VERTICAL;
    else
        flags |= FLAG_VERTICAL;
    if (hasFlag(FLAG_VERTICAL))
        width = -std::max(32, std::abs(xx - x));
    else
        width = std::max(32, std::abs(yy - y));
    if (xx == x)
        yy = y;
    x2 = xx;
    y2 = yy;
    setPoints();
}

void GyratorElm::draw(Graphics &g) {
    // Stubs from each terminal toward the box
    for (int i = 0; i != 4; i++) {
        setVoltageColor(g, nodes[i]->v);
        drawThickLine(g, ptEnds[i], ptStub[i]);
    }
    // Box outline
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    drawThickLine(g, boxTL, boxTR);
    drawThickLine(g, boxTR, boxBR);
    drawThickLine(g, boxBR, boxBL);
    drawThickLine(g, boxBL, boxTL);

    // Pi character and gyration arrow inside the box
    int cx = (int) std::floor((boxTL.x + boxBR.x) / 2.0);
    int cy = (int) std::floor((boxTL.y + boxBR.y) / 2.0);
    g.setFont(unitsFont);
    g.drawString("π", cx - 4, cy - 1);
    g.drawLine(arrowTail, arrowHead);
    g.fillPolygon(arrowPoly);

    // Current animation along the stubs
    for (int i = 0; i != 2; i++) {
        curcounts[i] = updateDotCount(currents[i], curcounts[i]);
        drawDots(g, ptEnds[i], ptStub[i], curcounts[i]);
        drawDots(g, ptEnds[i + 2], ptStub[i + 2], -curcounts[i]);
    }

    drawPosts(g);
    setBbox(ptEnds[0], ptEnds[3], 0);
}

void GyratorElm::setPoints() {
    CircuitElm::setPoints();
    if (hasFlag(FLAG_VERTICAL))
        point2.x = point1.x;
    else
        point2.y = point1.y;
    ptEnds = newPointArray(4);
    ptStub = newPointArray(4);
    ptEnds[0] = point1;
    ptEnds[1] = point2;
    flip = hasFlag(FLAG_FLIP) ? -1 : 1;
    interpPoint(point1, point2, ptEnds[2], 0, -dsign * width * flip);
    interpPoint(point1, point2, ptEnds[3], 1, -dsign * width * flip);
    // Stubs end 12px in from each terminal toward the center
    double cs = 0.5 - 12 / dn;
    for (int i = 0; i != 4; i += 2) {
        interpPoint(ptEnds[i], ptEnds[i + 1], ptStub[i], cs);
        interpPoint(ptEnds[i + 1], ptEnds[i], ptStub[i + 1], cs);
    }
    // Box corners coincide with the stub endpoints
    boxTL = ptStub[0];
    boxTR = ptStub[1];
    boxBL = ptStub[2];
    boxBR = ptStub[3];
    // Gyration arrow lives inside the box, below the pi character.
    // In horizontal orientation: arrow points from port 1 (left) to port 2 (right).
    int cx = (int) std::floor((boxTL.x + boxBR.x) / 2.0);
    int cy = (int) std::floor((boxTL.y + boxBR.y) / 2.0);
    if (hasFlag(FLAG_VERTICAL)) {
        arrowTail = Point(cx, cy + 6);
        arrowHead = Point(cx, cy + 14);
    } else {
        arrowTail = Point(cx - 8, cy + 8);
        arrowHead = Point(cx + 8, cy + 8);
    }
    arrowPoly = calcArrow(arrowTail, arrowHead, 4, 3);
}

void GyratorElm::reset() {
    currents[0] = currents[1] = 0;
    nodes[0]->v = nodes[1]->v = nodes[2]->v = nodes[3]->v = 0;
    curcounts[0] = curcounts[1] = 0;
}

// Gyrator equations (admittance form):
//   I1 =  G * V2
//   I2 = -G * V1
// where G = 1/R is the gyration conductance.  Linear, memoryless: the
// entire behavior is captured by stamping two voltage-controlled current
// sources -- no doStep().
void GyratorElm::stamp() {
    double g = 1.0 / gyrResistance;
    sim->stampVCCurrentSource(nodes[0], nodes[2], nodes[1], nodes[3], g);
    sim->stampVCCurrentSource(nodes[1], nodes[3], nodes[0], nodes[2], -g);
}

void GyratorElm::calculateCurrent() {
    double g = 1.0 / gyrResistance;
    double v1 = nodes[0]->v - nodes[2]->v;
    double v2 = nodes[1]->v - nodes[3]->v;
    currents[0] = g * v2;
    currents[1] = -g * v1;
}

double GyratorElm::getCurrentIntoNode(int n) {
    if (n < 2)
        return -currents[n];
    return currents[n - 2];
}

bool GyratorElm::getConnection(int n1, int n2) {
    // Port-1 terminals connect to each other; port-2 terminals connect
    // to each other; the two ports are coupled only via the VCCS, not
    // galvanically.
    if (comparePair(n1, n2, 0, 2))
        return true;
    if (comparePair(n1, n2, 1, 3))
        return true;
    return false;
}

void GyratorElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "gyrator";
    arr[1] = "R = " + getUnitText(gyrResistance, "Ω");
    arr[2] = "Vd1 = " + getVoltageText(nodes[0]->v - nodes[2]->v);
    arr[3] = "Vd2 = " + getVoltageText(nodes[1]->v - nodes[3]->v);
    arr[4] = "I1 = " + getCurrentText(currents[0]);
    arr[5] = "I2 = " + getCurrentText(currents[1]);
}

std::optional<EditInfo> GyratorElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Gyration Resistance (Ω)", gyrResistance, 1, 0);
    return std::nullopt;
}

void GyratorElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0)
        gyrResistance = ei.value;
}

void GyratorElm::flipX(int c2, int count) {
    if (hasFlag(FLAG_VERTICAL))
        flags ^= FLAG_FLIP;
    CircuitElm::flipX(c2, count);
}

void GyratorElm::flipY(int c2, int count) {
    if (!hasFlag(FLAG_VERTICAL))
        flags ^= FLAG_FLIP;
    CircuitElm::flipY(c2, count);
}

void GyratorElm::flipXY(int xmy, int count) {
    flags ^= FLAG_VERTICAL;
    width *= -1;
    CircuitElm::flipXY(xmy, count);
}
