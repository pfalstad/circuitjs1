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

#include "TransformerElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "Inductor.h"

TransformerElm::TransformerElm(int xx, int yy) : CircuitElm(xx, yy) {
    inductance = 4;
    ratio = polarity = 1;
    width = 32;
    noDiagonal = true;
    couplingCoef = .999;
}

TransformerElm::TransformerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    if (hasFlag(FLAG_VERTICAL))
        width = -std::max(32, std::abs(xb - xa));
    else
        width = std::max(32, std::abs(yb - ya));
    inductance = parseFloatStrict(st.nextToken());
    ratio = parseFloatStrict(st.nextToken());
    currents[0] = parseFloatStrict(st.nextToken());
    currents[1] = parseFloatStrict(st.nextToken());
    couplingCoef = .999;
    try {
        couplingCoef = parseFloatStrict(st.nextToken());
        saturationCurrent = parseFloatStrict(st.nextToken());
    } catch (...) {}
    noDiagonal = true;
    polarity = hasFlag(FLAG_REVERSE) ? -1 : 1;
}

void TransformerElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "in", inductance);
    CircuitXMLSerializer::dumpAttr(elem, "ra", ratio);
    CircuitXMLSerializer::dumpAttr(elem, "co", couplingCoef);
    CircuitXMLSerializer::dumpAttr(elem, "wi", width);
    if (saturationCurrent != 0)
        CircuitXMLSerializer::dumpAttr(elem, "isat", saturationCurrent);
}

void TransformerElm::dumpXmlState(XmlElement *, XmlElement *elem) {
    CircuitXMLSerializer::dumpAttr(elem, "c0", currents[0]);
    CircuitXMLSerializer::dumpAttr(elem, "c1", currents[1]);
}

void TransformerElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);

    if (hasFlag(FLAG_VERTICAL))
        width = -std::max(32, std::abs(x2 - x));
    else
        width = std::max(32, std::abs(y2 - y));

    inductance = xml.parseDoubleAttr("in", inductance);
    ratio = xml.parseDoubleAttr("ra", ratio);
    couplingCoef = xml.parseDoubleAttr("co", couplingCoef);
    width = xml.parseIntAttr("wi", width);
    saturationCurrent = xml.parseDoubleAttr("isat", saturationCurrent);
    currents[0] = xml.parseDoubleAttr("c0", 0);
    currents[1] = xml.parseDoubleAttr("c1", 0);
    polarity = hasFlag(FLAG_REVERSE) ? -1 : 1;
}

bool TransformerElm::isTrapezoidal() const {
    return (flags & Inductor::FLAG_BACK_EULER) == 0;
}

void TransformerElm::draw(Graphics &g) {
    for (int i = 0; i != 4; i++) {
        setVoltageColor(g, nodes[i]->v);
        drawThickLine(g, ptEnds[i], ptCoil[i]);
    }
    for (int i = 0; i != 2; i++) {
        setPowerColor(g, currents[i] * (nodes[i]->v - nodes[i + 2]->v));
        double csign = dsign * (i == 1 ? -6 * polarity : 6) * flip;
        if (hasFlag(FLAG_VERTICAL))
            csign *= -1;
        drawCoil(g, csign, ptCoil[i], ptCoil[i + 2], nodes[i]->v, nodes[i + 2]->v);
    }
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    for (int i = 0; i != 2; i++) {
        drawThickLine(g, ptCore[i], ptCore[i + 2]);
        if (!dots.empty())
            g.fillOval(dots[i].x - 2, dots[i].y - 2, 5, 5);
        curcounts[i] = updateDotCount(currents[i], curcounts[i]);
    }
    for (int i = 0; i != 2; i++) {
        drawDots(g, ptEnds[i], ptCoil[i], curcounts[i]);
        drawDots(g, ptCoil[i], ptCoil[i + 2], curcounts[i]);
        drawDots(g, ptEnds[i + 2], ptCoil[i + 2], -curcounts[i]);
    }
    drawPosts(g);
    setBbox(ptEnds[0], ptEnds[polarity == 1 ? 3 : 1], 0);
}

void TransformerElm::setPoints() {
    CircuitElm::setPoints();
    if (hasFlag(FLAG_VERTICAL))
        point2.x = point1.x;
    else
        point2.y = point1.y;
    ptEnds = newPointArray(4);
    ptCoil = newPointArray(4);
    ptCore = newPointArray(4);
    ptEnds[0] = point1;
    ptEnds[1] = point2;
    flip = hasFlag(FLAG_FLIP) ? -1 : 1;
    interpPoint(point1, point2, ptEnds[2], 0, -dsign * width * flip);
    interpPoint(point1, point2, ptEnds[3], 1, -dsign * width * flip);
    double ce = .5 - 12 / dn;
    double cd = .5 - 2 / dn;
    for (int i = 0; i != 4; i += 2) {
        interpPoint(ptEnds[i], ptEnds[i + 1], ptCoil[i], ce);
        interpPoint(ptEnds[i], ptEnds[i + 1], ptCoil[i + 1], 1 - ce);
        interpPoint(ptEnds[i], ptEnds[i + 1], ptCore[i], cd);
        interpPoint(ptEnds[i], ptEnds[i + 1], ptCore[i + 1], 1 - cd);
    }
    if (polarity == -1) {
        int vsign = hasFlag(FLAG_VERTICAL) ? -1 : 1;
        dots.assign(2, Point());
        double dotp = std::abs(7. / width);
        dots[0] = interpPoint(ptCoil[0], ptCoil[2], dotp, -7 * dsign * vsign * flip);
        dots[1] = interpPoint(ptCoil[3], ptCoil[1], dotp, -7 * dsign * vsign * flip);
        std::swap(ptEnds[1], ptEnds[3]);
        std::swap(ptCoil[1], ptCoil[3]);
    } else
        dots.clear();
}

void TransformerElm::reset() {
    // need to set current-source values here in case one of the nodes is node 0.  In that case
    // calculateCurrent() may get called (from setNodeVoltage()) when analyzing circuit, before
    // startIteration() gets called
    currents[0] = currents[1] = curcounts[0] = curcounts[1] = curSourceValue1 = curSourceValue2 = 0;
}

double TransformerElm::calcEffectiveInductance(double l0, double i, double isat) {
    if (isat <= 0)
        return l0;
    double r = i / isat;
    return l0 / (1 + r * r);
}

void TransformerElm::computeCoefficients(double l1, double l2, double m) {
    double deti = 1 / (l1 * l2 - m * m);
    double ts = isTrapezoidal() ? sim->timeStep / 2 : sim->timeStep;
    a1 = l2 * deti * ts;
    a2 = -m * deti * ts;
    a3 = -m * deti * ts;
    a4 = l1 * deti * ts;
}

void TransformerElm::stamp() {
    // see TransformerElm.ts for the derivation.  first winding goes from node 0 to 2,
    // second is from 1 to 3
    double l1 = inductance;
    double l2 = inductance * ratio * ratio;
    double m = couplingCoef * std::sqrt(l1 * l2);
    computeCoefficients(l1, l2, m);
    if (saturationCurrent > 0) {
        // nonlinear: conductances will be stamped in doStep()
        sim->stampNonLinear(nodes[0]);
        sim->stampNonLinear(nodes[1]);
        sim->stampNonLinear(nodes[2]);
        sim->stampNonLinear(nodes[3]);
    } else {
        // linear: stamp fixed conductances and VCCSes
        sim->stampConductance(nodes[0], nodes[2], a1);
        sim->stampVCCurrentSource(nodes[0], nodes[2], nodes[1], nodes[3], a2);
        sim->stampVCCurrentSource(nodes[1], nodes[3], nodes[0], nodes[2], a3);
        sim->stampConductance(nodes[1], nodes[3], a4);
    }
    // (the TS version marks the right side as changing here, which is a no-op)
}

void TransformerElm::startIteration() {
    if (saturationCurrent > 0) {
        // recompute coefficients with current-dependent inductances
        double l1 = calcEffectiveInductance(inductance, currents[0], saturationCurrent);
        double l2 = calcEffectiveInductance(inductance * ratio * ratio, currents[1], saturationCurrent * ratio);
        double m = couplingCoef * std::sqrt(l1 * l2);
        computeCoefficients(l1, l2, m);
    }
    double voltdiff1 = nodes[0]->v - nodes[2]->v;
    double voltdiff2 = nodes[1]->v - nodes[3]->v;
    if (isTrapezoidal()) {
        curSourceValue1 = voltdiff1 * a1 + voltdiff2 * a2 + currents[0];
        curSourceValue2 = voltdiff1 * a3 + voltdiff2 * a4 + currents[1];
    } else {
        curSourceValue1 = currents[0];
        curSourceValue2 = currents[1];
    }
}

void TransformerElm::doStep() {
    if (saturationCurrent > 0) {
        // stamp conductances and VCCSes (matrix was restored to origMatrix)
        sim->stampConductance(nodes[0], nodes[2], a1);
        sim->stampVCCurrentSource(nodes[0], nodes[2], nodes[1], nodes[3], a2);
        sim->stampVCCurrentSource(nodes[1], nodes[3], nodes[0], nodes[2], a3);
        sim->stampConductance(nodes[1], nodes[3], a4);
    }
    sim->stampCurrentSource(nodes[0], nodes[2], curSourceValue1);
    sim->stampCurrentSource(nodes[1], nodes[3], curSourceValue2);
}

void TransformerElm::calculateCurrent() {
    double voltdiff1 = nodes[0]->v - nodes[2]->v;
    double voltdiff2 = nodes[1]->v - nodes[3]->v;
    currents[0] = voltdiff1 * a1 + voltdiff2 * a2 + curSourceValue1;
    currents[1] = voltdiff1 * a3 + voltdiff2 * a4 + curSourceValue2;
}

double TransformerElm::getCurrentIntoNode(int n) {
    if (n < 2)
        return -currents[n];
    return currents[n - 2];
}

void TransformerElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = (saturationCurrent > 0) ? "transformer (sat)" : "transformer";
    arr[1] = "L = " + getUnitText(inductance, "H");
    arr[2] = "Ratio = 1:" + jsNumberToString(ratio);
    arr[3] = "Vd1 = " + getVoltageText(nodes[0]->v - nodes[2]->v);
    arr[4] = "Vd2 = " + getVoltageText(nodes[1]->v - nodes[3]->v);
    arr[5] = "I1 = " + getCurrentText(currents[0]);
    arr[6] = "I2 = " + getCurrentText(currents[1]);
    if (saturationCurrent > 0) {
        double l1Eff = calcEffectiveInductance(inductance, currents[0], saturationCurrent);
        arr[7] = "L1eff = " + getUnitText(l1Eff, "H");
    }
}

bool TransformerElm::getConnection(int n1, int n2) {
    if (comparePair(n1, n2, 0, 2))
        return true;
    if (comparePair(n1, n2, 1, 3))
        return true;
    return false;
}

std::optional<EditInfo> TransformerElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Primary Inductance (H)", inductance, .01, 5).setPositive();
    if (n == 1)
        return EditInfo("Ratio (N1/N2)", 1 / ratio, 1, 10).setDimensionless().setPositive();
    if (n == 2)
        return EditInfo("Coupling Coefficient", couplingCoef, 0, 1).setDimensionless().setPositive();
    if (n == 3)
        return EditInfo::createCheckbox("Trapezoidal Approximation", isTrapezoidal());
    if (n == 4)
        return EditInfo::createCheckbox("Swap Secondary Polarity", polarity == -1);
    if (n == 5)
        return EditInfo("Saturation Current (A) (0=none)", saturationCurrent);
    return std::nullopt;
}

void TransformerElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0)
        inductance = ei.value;
    if (n == 1 && ei.value > 0)
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
    if (n == 4) {
        polarity = ei.checkbox->getState() ? -1 : 1;
        if (ei.checkbox->getState())
            flags |= FLAG_REVERSE;
        else
            flags &= ~FLAG_REVERSE;
        setPoints();
    }
    if (n == 5) {
        if (ei.value >= 0)
            saturationCurrent = ei.value;
        else
            ei.setError("must be >= 0");
    }
}

void TransformerElm::drag(int xx, int yy) {
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

void TransformerElm::flipX(int c2, int count) {
    if (hasFlag(FLAG_VERTICAL))
        flags ^= FLAG_FLIP;
    CircuitElm::flipX(c2, count);
}

void TransformerElm::flipY(int c2, int count) {
    if (!hasFlag(FLAG_VERTICAL))
        flags ^= FLAG_FLIP;
    CircuitElm::flipY(c2, count);
}

void TransformerElm::flipXY(int xmy, int count) {
    flags ^= FLAG_VERTICAL;
    width *= -1;
    CircuitElm::flipXY(xmy, count);
}
