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

#include "TappedTransformerElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "Inductor.h"

TappedTransformerElm::TappedTransformerElm(int xx, int yy) : CircuitElm(xx, yy) {
    inductance = 4;
    ratio = 1;
    couplingCoef = 0.99;
    noDiagonal = true;
}

TappedTransformerElm::TappedTransformerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    inductance = parseFloatStrict(st.nextToken());
    ratio = parseFloatStrict(st.nextToken());
    currents[0] = parseFloatStrict(st.nextToken());
    currents[1] = parseFloatStrict(st.nextToken());
    try {
        currents[2] = parseFloatStrict(st.nextToken());
    } catch (...) {}
    couplingCoef = 0.99;
    try {
        couplingCoef = parseFloatStrict(st.nextToken());
    } catch (...) {}
    noDiagonal = true;
}

void TappedTransformerElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "in", inductance);
    CircuitXMLSerializer::dumpAttr(elem, "ra", ratio);
    CircuitXMLSerializer::dumpAttr(elem, "co", couplingCoef);
}

void TappedTransformerElm::dumpXmlState(XmlElement *doc, XmlElement *elem) {
    CircuitXMLSerializer::dumpAttr(elem, "c0", currents[0]);
    CircuitXMLSerializer::dumpAttr(elem, "c1", currents[1]);
    CircuitXMLSerializer::dumpAttr(elem, "c2", currents[2]);
}

void TappedTransformerElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    inductance = xml.parseDoubleAttr("in", inductance);
    ratio = xml.parseDoubleAttr("ra", ratio);
    couplingCoef = xml.parseDoubleAttr("co", couplingCoef);
    currents[0] = xml.parseDoubleAttr("c0", 0);
    currents[1] = xml.parseDoubleAttr("c1", 0);
    currents[2] = xml.parseDoubleAttr("c2", 0);
}

void TappedTransformerElm::draw(Graphics &g) {
    for (int i = 0; i != 5; i++) {
        setVoltageColor(g, nodes[i]->v);
        drawThickLine(g, ptEnds[i], ptCoil[i]);
    }
    for (int i = 0; i != 4; i++) {
        if (i == 1)
            continue;
        setPowerColor(g, currents[i] * (nodes[i]->v - nodes[i + 1]->v));
        drawCoil(g, i > 1 ? -6 * flip : 6 * flip,
            ptCoil[i], ptCoil[i + 1], nodes[i]->v, nodes[i + 1]->v);
    }
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    for (int i = 0; i != 4; i += 2) {
        drawThickLine(g, ptCore[i], ptCore[i + 1]);
    }
    for (int i = 0; i != 4; i++)
        curcounts[i] = updateDotCount(currents[i], curcounts[i]);

    // primary dots
    drawDots(g, ptEnds[0], ptCoil[0], curcounts[0]);
    drawDots(g, ptCoil[0], ptCoil[1], curcounts[0]);
    drawDots(g, ptCoil[1], ptEnds[1], curcounts[0]);

    // secondary dots
    drawDots(g, ptEnds[2], ptCoil[2], curcounts[1]);
    drawDots(g, ptCoil[2], ptCoil[3], curcounts[1]);
    drawDots(g, ptCoil[3], ptEnds[3], curcounts[3]);
    drawDots(g, ptCoil[3], ptCoil[4], curcounts[2]);
    drawDots(g, ptCoil[4], ptEnds[4], curcounts[2]);

    drawPosts(g);
    setBbox(ptEnds[0], ptEnds[4], 0);
}

void TappedTransformerElm::setPoints() {
    CircuitElm::setPoints();
    flip = hasFlag(FLAG_FLIP) ? -1 : 1;
    int hs = 32 * flip;
    ptEnds = newPointArray(5);
    ptCoil = newPointArray(5);
    ptCore = newPointArray(4);
    ptEnds[0] = point1;
    ptEnds[2] = point2;
    interpPoint(point1, point2, ptEnds[1], 0, -hs * 2);
    interpPoint(point1, point2, ptEnds[3], 1, -hs);
    interpPoint(point1, point2, ptEnds[4], 1, -hs * 2);
    double ce = 0.5 - 12 / dn;
    double cd = 0.5 - 2 / dn;
    interpPoint(ptEnds[0], ptEnds[2], ptCoil[0], ce);
    interpPoint(ptEnds[0], ptEnds[2], ptCoil[1], ce, -hs * 2);
    interpPoint(ptEnds[0], ptEnds[2], ptCoil[2], 1 - ce);
    interpPoint(ptEnds[0], ptEnds[2], ptCoil[3], 1 - ce, -hs);
    interpPoint(ptEnds[0], ptEnds[2], ptCoil[4], 1 - ce, -hs * 2);
    for (int i = 0; i != 2; i++) {
        int b = -hs * i * 2;
        interpPoint(ptEnds[0], ptEnds[2], ptCore[i], cd, b);
        interpPoint(ptEnds[0], ptEnds[2], ptCore[i + 2], 1 - cd, b);
    }
}

void TappedTransformerElm::reset() {
    currents[0] = currents[1] = currents[2] = currents[3] = 0;
    nodes[0]->v = nodes[1]->v = nodes[2]->v = nodes[3]->v = nodes[4]->v = 0;
    curcounts[0] = curcounts[1] = curcounts[2] = 0;
    // need to set current-source values here in case one of the nodes is node 0.  In that case
    // calculateCurrent() may get called (from setNodeVoltage()) when analyzing circuit, before
    // startIteration() gets called
    curSourceValue[0] = curSourceValue[1] = curSourceValue[2] = 0;
}

void TappedTransformerElm::stamp() {
    // equations for transformer:
    //   v1 = L1 di1/dt + M1 di2/dt + M1 di3/dt
    //   v2 = M1 di1/dt + L2 di2/dt + M2 di3/dt
    //   v3 = M1 di1/dt + M2 di2/dt + L2 di3/dt
    // we invert that to get:
    //   di1/dt = a1 v1 + a2 v2 + a3 v3
    //   di2/dt = a4 v1 + a5 v2 + a6 v3
    //   di3/dt = a7 v1 + a8 v2 + a9 v3
    // integrate di1/dt using trapezoidal approx and we get:
    //   i1(t2) = i1(t1) + dt/2 (i1(t1) + i1(t2))
    //          = i1(t1) + a1 dt/2 v1(t1)+a2 dt/2 v2(t1)+a3 dt/2 v3(t1) +
    //                     a1 dt/2 v1(t2)+a2 dt/2 v2(t2)+a3 dt/2 v3(t2)
    // the norton equivalent of this for i1 is:
    //  a. current source, I = i1(t1) + a1 dt/2 v1(t1) + a2 dt/2 v2(t1)
    //                                + a3 dt/2 v3(t1)
    //  b. resistor, G = a1 dt/2
    //  c. current source controlled by voltage v2, G = a2 dt/2
    //  d. current source controlled by voltage v3, G = a3 dt/2
    // and similarly for i2, i3
    //
    // first winding goes from node 0 to 1, second is from 2 to 3 to 4
    double l1 = inductance;
    // second winding is split in half, so each part has half the turns;
    // we square the 1/2 to divide by 4
    double l2 = inductance * ratio * ratio / 4;
    double m1 = couplingCoef * std::sqrt(l1 * l2);
    // mutual inductance between two halves of the second winding
    // is equal to self-inductance of either half (slightly less
    // because the coupling is not perfect)
    double m2 = couplingCoef * l2;
    // load pre-inverted matrix
    a[0] = l2 + m2;
    a[1] = a[2] = a[3] = a[6] = -m1;
    a[4] = a[8] = (l1 * l2 - m1 * m1) / (l2 - m2);
    a[5] = a[7] = (m1 * m1 - l1 * m2) / (l2 - m2);
    double det = l1 * (l2 + m2) - 2 * m1 * m1;
    double ts = isTrapezoidal() ? sim->timeStep / 2 : sim->timeStep;
    for (int i = 0; i != 9; i++)
        a[i] *= ts / det;
    sim->stampConductance(nodes[0], nodes[1], a[0]);
    sim->stampVCCurrentSource(nodes[0], nodes[1], nodes[2], nodes[3], a[1]);
    sim->stampVCCurrentSource(nodes[0], nodes[1], nodes[3], nodes[4], a[2]);

    sim->stampVCCurrentSource(nodes[2], nodes[3], nodes[0], nodes[1], a[3]);
    sim->stampConductance(nodes[2], nodes[3], a[4]);
    sim->stampVCCurrentSource(nodes[2], nodes[3], nodes[3], nodes[4], a[5]);

    sim->stampVCCurrentSource(nodes[3], nodes[4], nodes[0], nodes[1], a[6]);
    sim->stampVCCurrentSource(nodes[3], nodes[4], nodes[2], nodes[3], a[7]);
    sim->stampConductance(nodes[3], nodes[4], a[8]);

    // (the TS version marks the right side of each node as changing here; that's a no-op)
}

bool TappedTransformerElm::isTrapezoidal() { return (flags & Inductor::FLAG_BACK_EULER) == 0; }

void TappedTransformerElm::startIteration() {
    voltdiff[0] = nodes[0]->v - nodes[1]->v;
    voltdiff[1] = nodes[2]->v - nodes[3]->v;
    voltdiff[2] = nodes[3]->v - nodes[4]->v;
    for (int i = 0; i != 3; i++) {
        curSourceValue[i] = currents[i];
        if (isTrapezoidal())
            for (int j = 0; j != 3; j++)
                curSourceValue[i] += a[i * 3 + j] * voltdiff[j];
    }
}

void TappedTransformerElm::doStep() {
    sim->stampCurrentSource(nodes[0], nodes[1], curSourceValue[0]);
    sim->stampCurrentSource(nodes[2], nodes[3], curSourceValue[1]);
    sim->stampCurrentSource(nodes[3], nodes[4], curSourceValue[2]);
}

void TappedTransformerElm::calculateCurrent() {
    voltdiff[0] = nodes[0]->v - nodes[1]->v;
    voltdiff[1] = nodes[2]->v - nodes[3]->v;
    voltdiff[2] = nodes[3]->v - nodes[4]->v;
    for (int i = 0; i != 3; i++) {
        currents[i] = curSourceValue[i];
        for (int j = 0; j != 3; j++)
            currents[i] += a[i * 3 + j] * voltdiff[j];
    }
    // calc current of tap wire
    currents[3] = currents[1] - currents[2];
}

void TappedTransformerElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "transformer";
    arr[1] = "L = " + getUnitText(inductance, "H");
    arr[2] = "Ratio = 1:" + jsNumberToString(ratio);
    arr[3] = "Vd1 = " + getVoltageText(nodes[0]->v - nodes[2]->v);
    arr[4] = "Vd2 = " + getVoltageText(nodes[1]->v - nodes[3]->v);
}

double TappedTransformerElm::getCurrentIntoNode(int n) {
    if (n == 0)
        return -currents[0];
    if (n == 1)
        return currents[0];
    if (n == 2)
        return -currents[1];
    if (n == 3)
        return currents[3];
    return currents[2];
}

bool TappedTransformerElm::getConnection(int n1, int n2) {
    if (comparePair(n1, n2, 0, 1))
        return true;
    if (comparePair(n1, n2, 2, 3))
        return true;
    if (comparePair(n1, n2, 3, 4))
        return true;
    if (comparePair(n1, n2, 2, 4))
        return true;
    return false;
}

std::optional<EditInfo> TappedTransformerElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Primary Inductance (H)", inductance, 0.01, 5).setPositive();
    if (n == 1)
        return EditInfo("Ratio (N1/N2)", 1 / ratio, 1, 10).setDimensionless().setPositive();
    if (n == 2)
        return EditInfo("Coupling Coefficient", couplingCoef, 0, 1).setDimensionless().setPositive();
    if (n == 3) {
        EditInfo ei("", 0, -1, -1);
        ei.checkbox = Checkbox("Trapezoidal Approximation", isTrapezoidal());
        return ei;
    }
    return std::nullopt;
}

void TappedTransformerElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0)
        inductance = ei.value;
    if (n == 1 && ratio > 0)
        ratio = 1 / ei.value;
    if (n == 2) {
        if (ei.value > 0 && ei.value < 1)
            couplingCoef = ei.value;
        else
            ei.setError("must be > 0 and < 1");
    }
    if (n == 3) {
        if (ei.checkbox->getState())
            flags &= ~Inductor::FLAG_BACK_EULER;
        else
            flags |= Inductor::FLAG_BACK_EULER;
    }
}

void TappedTransformerElm::flipX(int c2, int count) {
    flags ^= FLAG_FLIP;
    CircuitElm::flipX(c2, count);
}

void TappedTransformerElm::flipY(int c2, int count) {
    flags ^= FLAG_FLIP;
    CircuitElm::flipY(c2, count);
}

void TappedTransformerElm::flipXY(int c2, int count) {
    flags ^= FLAG_FLIP;
    CircuitElm::flipXY(c2, count);
}
