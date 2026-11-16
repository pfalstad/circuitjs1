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

#include "RelayCoilElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "RelayContactElm.h"

RelayCoilElm::RelayCoilElm(int xx, int yy) : CircuitElm(xx, yy), ind(sim) {
    inductance = 0.2;
    ind.setup(inductance, 0, Inductor::FLAG_BACK_EULER);
    noDiagonal = true;
    onCurrent = 0.02;
    offCurrent = 0.015;
    state = 0;
    label = "label";
    coilR = 20;
    switchingTime = 5e-3;
    outline = newPointArray(4);
}

RelayCoilElm::RelayCoilElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f), ind(sim) {
    label = CustomLogicModel::unescape(st.nextToken());
    inductance = parseFloatStrict(st.nextToken());
    coilCurrent = parseFloatStrict(st.nextToken());
    onCurrent = parseFloatStrict(st.nextToken());
    coilR = parseFloatStrict(st.nextToken());
    offCurrent = parseFloatStrict(st.nextToken());
    switchingTime = parseFloatStrict(st.nextToken());
    type = parseIntStrict(st.nextToken());
    state = parseIntStrict(st.nextToken());
    switchPosition = parseIntStrict(st.nextToken());
    noDiagonal = true;
    ind.setup(inductance, coilCurrent, Inductor::FLAG_BACK_EULER);
    outline = newPointArray(4);
}

void RelayCoilElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "lb", label);
    CircuitXMLSerializer::dumpAttr(elem, "in", inductance);
    CircuitXMLSerializer::dumpAttr(elem, "oc", onCurrent);
    CircuitXMLSerializer::dumpAttr(elem, "cr", coilR);
    CircuitXMLSerializer::dumpAttr(elem, "ofc", offCurrent);
    CircuitXMLSerializer::dumpAttr(elem, "swt", switchingTime);
    CircuitXMLSerializer::dumpAttr(elem, "tp", type);
}

void RelayCoilElm::dumpXmlState(XmlElement *, XmlElement *elem) {
    CircuitXMLSerializer::dumpAttr(elem, "ci", coilCurrent);
    CircuitXMLSerializer::dumpAttr(elem, "st", state);
    CircuitXMLSerializer::dumpAttr(elem, "sp", switchPosition);
}

void RelayCoilElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    label = xml.parseStringAttr("lb", label).value_or(label);
    inductance = xml.parseDoubleAttr("in", inductance);
    onCurrent = xml.parseDoubleAttr("oc", onCurrent);
    coilR = xml.parseDoubleAttr("cr", coilR);
    offCurrent = xml.parseDoubleAttr("ofc", offCurrent);
    switchingTime = xml.parseDoubleAttr("swt", switchingTime);
    type = xml.parseIntAttr("tp", type);
    coilCurrent = xml.parseDoubleAttr("ci", coilCurrent);
    state = xml.parseIntAttr("st", state);
    switchPosition = xml.parseIntAttr("sp", switchPosition);
    noDiagonal = true;
    ind = Inductor(sim);
    ind.setup(inductance, coilCurrent, Inductor::FLAG_BACK_EULER);
    allocNodes();
}

void RelayCoilElm::draw(Graphics &g) {
    for (int i = 0; i != 2; i++) {
        setVoltageColor(g, nodes[nCoil1 + i]->v);
        drawThickLine(g, coilLeads[i], coilPosts[i]);
    }
    setPowerColor(g, coilCurrent * (nodes[nCoil1]->v - nodes[nCoil2]->v));
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    drawThickLine(g, outline[0], outline[1]);
    drawThickLine(g, outline[1], outline[2]);
    drawThickLine(g, outline[2], outline[3]);
    drawThickLine(g, outline[3], outline[0]);

    if (isLatchingType(type)) {
        for (int i = 0; i != 3; i++)
            drawThickLine(g, extraPoints[i], extraPoints[i + 1]);
        if (type == TYPE_LATCHING_ON || type == TYPE_LATCHING_OFF) {
            g.setColor(needsHighlight() ? selectColor : whiteColor);
            g.drawString(type == TYPE_LATCHING_ON ? "S" : "R", extraPoints[0].x + 3, extraPoints[0].y + 9);
        }
    } else if (type == TYPE_ON_DELAY) {
        drawThickLine(g, extraPoints[1], extraPoints[2]);
        drawThickLine(g, extraPoints[0], extraPoints[2]);
        drawThickLine(g, extraPoints[1], extraPoints[3]);
    } else if (type == TYPE_OFF_DELAY) {
        g.fillRect(extraPoints[0].x, extraPoints[0].y, extraPoints[2].x - extraPoints[0].x,
                   extraPoints[2].y - extraPoints[0].y);
    }

    g.setColor(needsHighlight() ? selectColor : whiteColor);
    if (x == x2)
        g.drawString(label, outline[2].x + 10, std::trunc((y + y2) / 2.) + 4);
    else {
        g.save();
        g.setTextAlign(Graphics::ALIGN_CENTER);
        g.drawString(label, std::trunc((x + x2) / 2.), outline[1].y + 15);
        g.restore();
    }

    coilCurCount = updateDotCount(coilCurrent, coilCurCount);
    if (coilCurCount != 0) {
        drawDots(g, coilPosts[0], coilLeads[0], coilCurCount);
        drawDots(g, coilLeads[1], coilPosts[1], addCurCount(coilCurCount, currentOffset2));
    }

    drawPosts(g);
    setBbox(outline[0], outline[2], 0);
    adjustBbox(coilPosts[0], coilPosts[1]);
}

void RelayCoilElm::setPoints() {
    CircuitElm::setPoints();
    allocNodes();
    openhs = -dsign * 16;
    coilPosts = newPointArray(2);
    coilLeads = newPointArray(2);
    coilPosts[0] = point1;
    coilPosts[1] = point2;
    const int boxSize = 32;
    double boxWScale = std::min(0.4, 12.0 / dn);
    interpPoint(point1, point2, coilLeads[0], 0.5 - boxWScale);
    interpPoint(point1, point2, coilLeads[1], 0.5 + boxWScale);
    interpPoint(point1, point2, outline[0], 0.5 - boxWScale, -boxSize * dsign);
    interpPoint(point1, point2, outline[1], 0.5 + boxWScale, -boxSize * dsign);
    interpPoint(point1, point2, outline[3], 0.5 - boxWScale, +boxSize * dsign);
    interpPoint(point1, point2, outline[2], 0.5 + boxWScale, +boxSize * dsign);
    currentOffset1 = distance(coilPosts[0], coilLeads[0]);
    currentOffset2 = currentOffset1 + distance(coilLeads[0], coilLeads[1]);
    extraPoints = newPointArray(4);
    if (isLatchingType(type)) {
        interpPoint(coilLeads[0], coilLeads[1], extraPoints[0], 0.3, 8);
        interpPoint(coilLeads[0], coilLeads[1], extraPoints[1], 0.3, 0);
        interpPoint(coilLeads[0], coilLeads[1], extraPoints[2], 0.7, 0);
        interpPoint(coilLeads[0], coilLeads[1], extraPoints[3], 0.7, -8);
    } else {
        extraPoints[0] = outline[0];
        extraPoints[3] = outline[1];
        interpPoint(coilLeads[0], coilLeads[1], extraPoints[1], 0, -boxSize + 12);
        interpPoint(coilLeads[0], coilLeads[1], extraPoints[2], 1, -boxSize + 12);
    }
}

void RelayCoilElm::reset() {
    CircuitElm::reset();
    ind.reset();
    coilCurrent = coilCurCount = 0;
    d_position = i_position = 0;
    avgCurrent = 0;
}

void RelayCoilElm::stamp() {
    ind.stamp(nodes[nCoil1], nodes[nCoil3]);
    sim->stampResistor(nodes[nCoil3], nodes[nCoil2], coilR);
    if (type == TYPE_ON_DELAY) {
        switchingTimeOn = switchingTime;
        switchingTimeOff = 0;
    } else if (type == TYPE_OFF_DELAY) {
        switchingTimeOff = switchingTime;
        switchingTimeOn = 0;
    } else {
        switchingTimeOff = switchingTimeOn = switchingTime;
    }
    // set/reset coils only drive the contact when they actually fire (see
    // startIteration); pushing their own switchPosition here on every
    // re-stamp would let the reset coil's stale value fight the set coil's
    if (type != TYPE_LATCHING_ON && type != TYPE_LATCHING_OFF)
        toggleSwitchPositions();
}

void RelayCoilElm::startIteration() {
    ind.startIteration(nodes[nCoil1]->v - nodes[nCoil3]->v);
    double absCurrent = std::abs(coilCurrent);
    double a = jsmath::exp(-sim->timeStep * 1e3);
    avgCurrent = a * avgCurrent + (1 - a) * absCurrent;
    int oldSwitchPosition = switchPosition;
    if (state == 0) {
        if (avgCurrent > onCurrent) {
            lastTransition = sim->t;
            state = 1;
        }
    } else if (state == 1) {
        if (avgCurrent < offCurrent)
            state = 0;
        else if (sim->t - lastTransition > switchingTimeOn) {
            state = 2;
            if (type == TYPE_LATCHING) {
                switchPosition = 1 - switchPosition;
            } else if (type == TYPE_LATCHING_ON) {
                // set coil: always drive the contact to the "on" position
                switchPosition = 1;
                setSwitchPositions(0);
            } else if (type == TYPE_LATCHING_OFF) {
                // reset coil: always drive the contact to the "off" position
                switchPosition = 0;
                setSwitchPositions(1);
            } else {
                switchPosition = 1;
            }
        }
    } else if (state == 2) {
        if (avgCurrent < offCurrent) {
            lastTransition = sim->t;
            state = 3;
        }
    } else if (state == 3) {
        if (avgCurrent > onCurrent)
            state = 2;
        else if (sim->t - lastTransition > switchingTimeOff) {
            state = 0;
            if (!isLatchingType(type))
                switchPosition = 0;
        }
    }
    if (type != TYPE_LATCHING_ON && type != TYPE_LATCHING_OFF && oldSwitchPosition != switchPosition)
        toggleSwitchPositions();
}

void RelayCoilElm::toggleSwitchPositions() {
    if (elmList == nullptr)
        return;
    for (CircuitElm *ce : *elmList)
        if (RelayContactElm *rc = dynamic_cast<RelayContactElm *>(ce))
            if (rc->label == label)
                rc->setContactPosition(1 - switchPosition, type);
}

void RelayCoilElm::setSwitchPositions(int position) {
    if (elmList == nullptr)
        return;
    for (CircuitElm *ce : *elmList)
        if (RelayContactElm *rc = dynamic_cast<RelayContactElm *>(ce))
            if (rc->label == label)
                rc->setContactPosition(position, type);
}

void RelayCoilElm::doStep() {
    ind.doStep(nodes[nCoil1]->v - nodes[nCoil3]->v);
}

void RelayCoilElm::calculateCurrent() {
    coilCurrent = ind.calculateCurrent(nodes[nCoil1]->v - nodes[nCoil3]->v);
}

void RelayCoilElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = Locale::LS("relay");
    if (i_position == 0)
        arr[0] += " (" + Locale::LS("off") + ")";
    else if (i_position == 1)
        arr[0] += " (" + Locale::LS("on") + ")";
    arr[1] = Locale::LS("coil I") + " = " + getCurrentDText(coilCurrent);
    arr[2] = Locale::LS("coil Vd") + " = " + getVoltageDText(nodes[nCoil1]->v - nodes[nCoil2]->v);
}

std::optional<EditInfo> RelayCoilElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Type", 0);
        ei.choice = Choice();
        ei.choice->add("Normal");
        ei.choice->add("On Delay");
        ei.choice->add("Off Delay");
        ei.choice->add("Latching");
        ei.choice->add("Latching (Set Coil)");
        ei.choice->add("Latching (Reset Coil)");
        ei.choice->select(type);
        return ei;
    }
    if (n == 1)
        return EditInfo("Inductance (H)", inductance, 0, 0).setPositive();
    if (n == 2)
        return EditInfo("On Current (A)", onCurrent, 0, 0).setPositive();
    if (n == 3)
        return EditInfo("Off Current (A)", offCurrent, 0, 0).setPositive();
    if (n == 4)
        return EditInfo("Coil Resistance (ohms)", coilR, 0, 0).setPositive();
    if (n == 5)
        return EditInfo("Switching Time (s)", switchingTime, 0, 0).setPositive();
    if (n == 6)
        return EditInfo("Label (for linking)", label);
    return std::nullopt;
}

void RelayCoilElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        type = ei.choice->getSelectedIndex();
        setPoints();
    }
    if (n == 1 && ei.value > 0) {
        inductance = ei.value;
        ind.setup(inductance, coilCurrent, Inductor::FLAG_BACK_EULER);
    }
    if (n == 2 && ei.value > 0) onCurrent = ei.value;
    if (n == 3 && ei.value > 0) offCurrent = ei.value;
    if (n == 4 && ei.value > 0) coilR = ei.value;
    if (n == 5 && ei.value > 0) switchingTime = ei.value;
    if (n == 6) label = ei.textf->value;
}
