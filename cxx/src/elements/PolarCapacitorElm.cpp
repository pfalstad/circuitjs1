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

#include "PolarCapacitorElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

PolarCapacitorElm::PolarCapacitorElm(int xx, int yy) : CapacitorElm(xx, yy) {
    maxNegativeVoltage = 1;
}

PolarCapacitorElm::PolarCapacitorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CapacitorElm(xa, ya, xb, yb, f, st) {
    maxNegativeVoltage = parseFloatStrict(st.nextToken());
}

void PolarCapacitorElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CapacitorElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "mv", maxNegativeVoltage);
}

void PolarCapacitorElm::undumpXml(CircuitXMLDeserializer &xml) {
    CapacitorElm::undumpXml(xml);
    maxNegativeVoltage = xml.parseDoubleAttr("mv", maxNegativeVoltage);
}

void PolarCapacitorElm::setPoints() {
    CapacitorElm::setPoints();
    double f = (dn / 2 - 4) / dn;
    platePoints = newPointArray(14);
    int maxI = (int) platePoints.size() - 1;
    double midI = maxI / 2.0;
    for (int i = 0; i <= maxI; i++) {
        double q = (i - midI) * 0.9 / midI;
        platePoints[i] = interpPoint(plate2[0], plate2[1], (double) i / maxI, 5 * (1 - std::sqrt(1 - q * q)));
    }
    plusPoint = interpPoint(point1, point2, f - 8 / dn, -10 * dsign);
    if (y2 > y)
        plusPoint.y += 4;
    if (y > y2)
        plusPoint.y += 3;
}

void PolarCapacitorElm::draw(Graphics &g) {
    CapacitorElm::draw(g);
    g.setColor(whiteColor);
    g.setFont(unitsFont);
    int w = (int) std::floor(g.measureWidth("+"));
    g.drawString("+", plusPoint.x - (int) std::floor(w / 2.0), plusPoint.y);
}

void PolarCapacitorElm::getInfo(std::vector<std::string> &arr) {
    CapacitorElm::getInfo(arr);
    arr[0] = "capacitor (polarized)";
}

std::optional<EditInfo> PolarCapacitorElm::getEditInfo(int n) {
    if (n == 4)
        return EditInfo("Max Reverse Voltage", maxNegativeVoltage, 0, 0);
    return CapacitorElm::getEditInfo(n);
}

void PolarCapacitorElm::setEditValue(int n, EditInfo &ei) {
    if (n == 4) {
        if (ei.value >= 0)
            maxNegativeVoltage = ei.value;
        else
            ei.setError("must be >= 0");
    }
    CapacitorElm::setEditValue(n, ei);
}

void PolarCapacitorElm::stepFinished() {
    if (getVoltageDiff() < 0 && getVoltageDiff() < -maxNegativeVoltage)
        sim->stop("capacitor exceeded max reverse voltage", this);
    CapacitorElm::stepFinished();
}
