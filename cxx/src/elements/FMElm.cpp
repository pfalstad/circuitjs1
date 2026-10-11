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

// contributed by Edward Calver

#include "FMElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

FMElm::FMElm(int xx, int yy) : CircuitElm(xx, yy) {
    deviation = 200;
    maxVoltage = 5;
    carrierfreq = 800;
    signalfreq = 40;
    reset();
}

FMElm::FMElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CircuitElm(xa, ya, xb, yb, f) {
    carrierfreq = parseFloatStrict(st.nextToken());
    signalfreq = parseFloatStrict(st.nextToken());
    maxVoltage = parseFloatStrict(st.nextToken());
    deviation = parseFloatStrict(st.nextToken());
    if ((flags & FLAG_COS) != 0)
        flags &= ~FLAG_COS;
    reset();
}

void FMElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "cf", carrierfreq);
    CircuitXMLSerializer::dumpAttr(elem, "sf", signalfreq);
    CircuitXMLSerializer::dumpAttr(elem, "mv", maxVoltage);
    CircuitXMLSerializer::dumpAttr(elem, "dv", deviation);
}

void FMElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    carrierfreq = xml.parseDoubleAttr("cf", carrierfreq);
    signalfreq = xml.parseDoubleAttr("sf", signalfreq);
    maxVoltage = xml.parseDoubleAttr("mv", maxVoltage);
    deviation = xml.parseDoubleAttr("dv", deviation);
    reset();
}

void FMElm::reset() {
    freqTimeZero = 0;
    curcount = 0;
}

void FMElm::stamp() {
    sim->stampVoltageSource(CircuitNode::ground, nodes[0], voltSource);
}

void FMElm::doStep() {
    sim->updateVoltageSource(CircuitNode::ground, nodes[0], voltSource, getVoltage());
}

double FMElm::getVoltage() {
    double deltaT = sim->t - lasttime;
    lasttime = sim->t;
    double signalamplitude = jsmath::sin((2 * pi * (sim->t - freqTimeZero)) * signalfreq);
    funcx += deltaT * (carrierfreq + signalamplitude * deviation);
    return jsmath::sin(2 * pi * funcx) * maxVoltage;
}

void FMElm::draw(Graphics &g) {
    setBbox(point1, point2, circleSize);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1);
    g.setFont(Font("SansSerif", 0, 12));
    g.setColor(needsHighlight() ? selectColor : whiteColor);
    setPowerColor(g, false);
    drawCenteredText(g, "FM", x2, y2, true);
    drawWaveform(g, point2);
    drawPosts(g);
    curcount = updateDotCount(-current, curcount);
    if (!isCreating())
        drawDots(g, point1, lead1, curcount);
}

void FMElm::drawWaveform(Graphics &g, const Point &center) {
    g.setColor(needsHighlight() ? selectColor : Color::gray);
    setPowerColor(g, false);
    drawThickCircle(g, center.x, center.y, circleSize);
    adjustBbox(center.x - circleSize, center.y - circleSize,
        center.x + circleSize, center.y + circleSize);
}

void FMElm::setPoints() {
    CircuitElm::setPoints();
    lead1 = interpPoint(point1, point2, 1 - circleSize / dn);
}

void FMElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "FM Source";
    arr[1] = "I = " + getCurrentText(getCurrent());
    arr[2] = "V = " + getVoltageText(getVoltageDiff());
    arr[3] = "cf = " + getUnitText(carrierfreq, "Hz");
    arr[4] = "sf = " + getUnitText(signalfreq, "Hz");
    arr[5] = "dev = " + getUnitText(deviation, "Hz");
    arr[6] = "Vmax = " + getVoltageText(maxVoltage);
}

std::optional<EditInfo> FMElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Max Voltage", maxVoltage, -20, 20).setUnitStep();
    if (n == 1)
        return EditInfo("Carrier Frequency (Hz)", carrierfreq, 4, 500);
    if (n == 2)
        return EditInfo("Signal Frequency (Hz)", signalfreq, 4, 500);
    if (n == 3)
        return EditInfo("Deviation (Hz)", deviation, 4, 500);
    return std::nullopt;
}

void FMElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        maxVoltage = ei.value;
    if (n == 1)
        carrierfreq = ei.value;
    if (n == 2)
        signalfreq = ei.value;
    if (n == 3)
        deviation = ei.value;
}
