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

#include "CrystalElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/StringTokenizer.h"
#include "CapacitorElm.h"
#include "InductorElm.h"
#include "ResistorElm.h"

static const char *modelString = "CapacitorElm 1 2\rCapacitorElm 1 3\rInductorElm 3 4\rResistorElm 4 2";
static const std::vector<int> modelExternalNodes = {1, 2};

CrystalElm::CrystalElm(int xx, int yy) : CompositeElm(xx, yy) {
    loadComposite(nullptr, modelString, modelExternalNodes);
    buildCompNodeList();
    allocNodes();
    flags = FLAG_SHOW_FREQ;
    parallelCapacitance = 28.7e-12;
    seriesCapacitance = 0.1e-12;
    inductance = 2.5e-3;
    resistance = 6.4;
    initCrystal();
}

CrystalElm::CrystalElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CompositeElm(xa, ya, xb, yb, f) {
    loadComposite(&st, modelString, modelExternalNodes);
    buildCompNodeList();
    allocNodes();
    parallelCapacitance = static_cast<CapacitorElm *>(compElmList[0])->getCapacitance();
    seriesCapacitance = static_cast<CapacitorElm *>(compElmList[1])->getCapacitance();
    inductance = static_cast<InductorElm *>(compElmList[2])->getInductance();
    resistance = static_cast<ResistorElm *>(compElmList[3])->getResistance();
    initCrystal();
}

void CrystalElm::initCrystal() {
    static_cast<CapacitorElm *>(compElmList[0])->setCapacitance(parallelCapacitance);
    static_cast<CapacitorElm *>(compElmList[1])->setCapacitance(seriesCapacitance);
    static_cast<InductorElm *>(compElmList[2])->setInductance(inductance);
    static_cast<ResistorElm *>(compElmList[3])->setResistance(resistance);
}

void CrystalElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CompositeElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "pc", parallelCapacitance);
    CircuitXMLSerializer::dumpAttr(elem, "sc", seriesCapacitance);
    CircuitXMLSerializer::dumpAttr(elem, "in", inductance);
    CircuitXMLSerializer::dumpAttr(elem, "r", resistance);
}

void CrystalElm::undumpXml(CircuitXMLDeserializer &xml) {
    CompositeElm::undumpXml(xml);
    resistance = xml.parseDoubleAttr("r", resistance);
    inductance = xml.parseDoubleAttr("in", inductance);
    parallelCapacitance = xml.parseDoubleAttr("pc", parallelCapacitance);
    seriesCapacitance = xml.parseDoubleAttr("sc", seriesCapacitance);
    initCrystal();
}

void CrystalElm::setPoints() {
    CompositeElm::setPoints();
    double f = (dn / 2 - 10) / dn;
    // calc leads
    lead1 = interpPoint(point1, point2, f);
    lead2 = interpPoint(point1, point2, 1 - f);
    // calc plates
    plate1 = newPointArray(2);
    plate2 = newPointArray(2);
    interpPoint2(point1, point2, plate1[0], plate1[1], f, 8);
    interpPoint2(point1, point2, plate2[0], plate2[1], 1 - f, 8);

    sandwichPoints = newPointArray(4);
    double f2 = (dn / 2 - 5) / dn;
    interpPoint2(point1, point2, sandwichPoints[0], sandwichPoints[1], f2, 10);
    interpPoint2(point1, point2, sandwichPoints[3], sandwichPoints[2], 1 - f2, 10);

    // need to do this explicitly for CompositeElms
    setPost(0, point1);
    setPost(1, point2);
}

void CrystalElm::draw(Graphics &g) {
    const int hs = 12;
    setBbox(point1, point2, hs);

    // draw first lead and plate
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1);
    setPowerColor(g, false);
    drawThickLine(g, plate1[0], plate1[1]);
    if (showPower())
        g.setColor(Color::gray);

    // draw second lead and plate
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, point2, lead2);
    setPowerColor(g, false);
    drawThickLine(g, plate2[0], plate2[1]);

    setVoltageColor(g, 0.5 * (nodes[0]->v + nodes[1]->v));
    for (int i = 0; i != 4; i++)
        drawThickLine(g, sandwichPoints[i], sandwichPoints[(i + 1) % 4]);

    updateDotCount();
    if (!isCreating()) {
        drawDots(g, point1, lead1, curcount);
        drawDots(g, point2, lead2, -curcount);
    }
    drawPosts(g);
    if (hasFlag(FLAG_SHOW_FREQ)) {
        double fs = 1 / (std::sqrt(inductance * seriesCapacitance) * pi * 2);
        drawValues(g, getShortUnitText(fs, "Hz"), hs);
    }
}

void CrystalElm::stepFinished() {
    CompositeElm::stepFinished();
    current = getCurrentIntoNode(1);
}

void CrystalElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "crystal";
    getBasicInfo(arr);
    double fs = 1 / (std::sqrt(inductance * seriesCapacitance) * pi * 2);
    double cSer = (parallelCapacitance * seriesCapacitance) / (parallelCapacitance + seriesCapacitance);
    double fp = 1 / (std::sqrt(inductance * cSer) * pi * 2);
    double q = 2 * pi * fs * inductance / resistance;
    arr[3] = "fs = " + getUnitText(fs, "Hz");
    arr[4] = "fp = " + getUnitText(fp, "Hz");
    arr[5] = "Q = " + getUnitText(q, "");
    arr[6] = "P = " + getUnitText(getPower(), "W");
}

std::optional<EditInfo> CrystalElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo(EditInfo::makeLink("crystal.html", "Parallel Capacitance"), parallelCapacitance).setPositive();
    if (n == 1)
        return EditInfo("Series Capacitance (F)", seriesCapacitance).setPositive();
    if (n == 2)
        return EditInfo("Inductance (H)", inductance, 0, 0).setPositive();
    if (n == 3)
        return EditInfo("Resistance (" + Locale::ohmString + ")", resistance, 0, 0).setPositive();
    if (n == 4)
        return EditInfo::createCheckbox("Show Frequency", hasFlag(FLAG_SHOW_FREQ));
    return std::nullopt;
}

void CrystalElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0) parallelCapacitance = ei.value;
    if (n == 1 && ei.value > 0) seriesCapacitance = ei.value;
    if (n == 2 && ei.value > 0) inductance = ei.value;
    if (n == 3 && ei.value > 0) resistance = ei.value;
    if (n == 4)
        flags = ei.changeFlag(flags, FLAG_SHOW_FREQ);
    initCrystal();
}
