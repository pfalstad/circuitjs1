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

#include "InductorElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/FindPathInfo.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/JsMath.h"

InductorElm::InductorElm(int xx, int yy) : CircuitElm(xx, yy), ind(sim) {
    inductance = 1;
    initialCurrent = 0;
    saturationCurrent = 0;
    seriesResistance = 1;
    ind.setup(inductance, current, flags, saturationCurrent);
}

InductorElm::InductorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f), ind(sim) {
    inductance = parseFloatStrict(st.nextToken());
    current = parseFloatStrict(st.nextToken());
    initialCurrent = 0;
    saturationCurrent = 0;
    seriesResistance = 0;
    try {
        initialCurrent = parseFloatStrict(st.nextToken());
        saturationCurrent = parseFloatStrict(st.nextToken());
    } catch (...) {}
    ind.setup(inductance, current, flags, saturationCurrent);
    allocNodes();
}

void InductorElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "l", inductance);
    CircuitXMLSerializer::dumpAttr(elem, "ic", initialCurrent);
    if (saturationCurrent != 0)
        CircuitXMLSerializer::dumpAttr(elem, "isat", saturationCurrent);
    if (seriesResistance != 0)
        CircuitXMLSerializer::dumpAttr(elem, "sr", seriesResistance);
}

void InductorElm::dumpXmlState(XmlElement *doc, XmlElement *elem) {
    CircuitXMLSerializer::dumpAttr(elem, "i", current);
}

void InductorElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    inductance = xml.parseDoubleAttr("l", inductance);
    initialCurrent = xml.parseDoubleAttr("ic", initialCurrent);
    current = xml.parseDoubleAttr("i", current);
    saturationCurrent = xml.parseDoubleAttr("isat", saturationCurrent);
    // sr is only saved when nonzero, so a missing sr means 0 (not the new-element default of 1).
    // But keep it on state-restore calls ("ix", from CompositeElm), which have no settings.
    bool stateRestore = xml.parseStringAttr("ix", std::nullopt).has_value();
    seriesResistance = xml.parseDoubleAttr("sr", stateRestore ? seriesResistance : 0);
    ind.setup(inductance, current, flags, saturationCurrent);
    allocNodes();
}

void InductorElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(32);
}

void InductorElm::reset() {
    curcount = 0;
    current = initialCurrent;
    ind.resetTo(initialCurrent);
}

void InductorElm::stamp() {
    ind.stamp(nodes[0], nodes[getIndNode2()]);
    if (seriesResistance > 0)
        sim->stampResistor(nodes[1], nodes[2], seriesResistance);
}

void InductorElm::startIteration() {
    ind.startIteration(nodes[0]->v - nodes[getIndNode2()]->v);
}

void InductorElm::calculateCurrent() {
    double voltdiff = nodes[0]->v - nodes[getIndNode2()]->v;
    current = ind.calculateCurrent(voltdiff);
}

void InductorElm::doStep() {
    double voltdiff = nodes[0]->v - nodes[getIndNode2()]->v;
    ind.doStep(voltdiff);
}

void InductorElm::setInductance(double l) {
    inductance = l;
    ind.setup(inductance, current, flags, saturationCurrent);
}

void InductorElm::setSaturationCurrent(double isat) {
    saturationCurrent = isat;
    ind.setup(inductance, current, flags, saturationCurrent);
}

void InductorElm::setSeriesResistance(double r) {
    seriesResistance = r;
    allocNodes();
}

bool InductorElm::validate() {
    FindPathInfo fpi(FindPathInfo::INDUCT, this, getNode(1), sim);
    if (!fpi.findPath(getNode(0)))
        reset();
    return true;
}

void InductorElm::draw(Graphics &g) {
    double v1 = nodes[0]->v;
    double v2 = nodes[1]->v;
    int hs = 8;
    setBbox(point1, point2, hs);
    draw2Leads(g);
    setPowerColor(g, false);
    drawCoil(g, 8, lead1, lead2, v1, v2);
    if (showValues()) {
        std::string s = getShortUnitText(inductance, "H");
        drawValues(g, s, hs);
    }
    doDots(g);
    drawPosts(g);
}

void InductorElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = (saturationCurrent > 0) ? "inductor (sat)" : "inductor";
    getBasicInfo(arr);
    arr[3] = "L = " + getUnitText(inductance, "H");
    arr[4] = "P = " + getUnitText(getPower(), "W");
    if (saturationCurrent > 0) {
        double lEff = ind.calcEffectiveInductance(current);
        arr[5] = "Leff = " + getUnitText(lEff, "H");
        arr[6] = "Isat = " + getUnitText(saturationCurrent, "A");
    }
}

std::string InductorElm::getScopeText(int) {
    return Locale::LS("inductor") + ", " + getUnitText(inductance, "H");
}

std::optional<EditInfo> InductorElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Inductance (H)", inductance, 1e-2, 10).setPositive();
    if (n == 1) {
        EditInfo ei("", 0, -1, -1);
        ei.checkbox = Checkbox("Trapezoidal Approximation", ind.isTrapezoidal());
        return ei;
    }
    if (n == 2)
        return EditInfo("Initial Current (on Reset) (A)", initialCurrent);
    if (n == 3)
        return EditInfo("Saturation Current (A) (0=none)", saturationCurrent);
    if (n == 4)
        return EditInfo("Series Resistance", seriesResistance);
    return std::nullopt;
}

void InductorElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        inductance = ei.value;
    if (n == 1) {
        if (ei.checkbox->getState())
            flags &= ~Inductor::FLAG_BACK_EULER;
        else
            flags |= Inductor::FLAG_BACK_EULER;
    }
    if (n == 2)
        initialCurrent = ei.value;
    if (n == 3) {
        if (ei.value >= 0)
            saturationCurrent = ei.value;
        else
            ei.setError("must be >= 0");
    }
    if (n == 4) {
        if (ei.value >= 0) {
            seriesResistance = ei.value;
            allocNodes();
        } else
            ei.setError("must be >= 0");
    }
    ind.setup(inductance, current, flags, saturationCurrent);
}
