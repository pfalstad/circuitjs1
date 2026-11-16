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

#include "CC2Elm.h"

#include "../core/StringTokenizer.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"

void CC2Elm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr)
        gain = parseFloatStrict(st->nextToken());
}

void CC2Elm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ga", gain);
}

void CC2Elm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    gain = xml.parseDoubleAttr("ga", gain);
}

void CC2Elm::setupPins() {
    sizeX = 2;
    sizeY = 3;
    pins.assign(3, Pin());
    pins[0] = Pin(this, 0, SIDE_W, "X");
    pins[0].output = true;
    pins[1] = Pin(this, 2, SIDE_W, "Y");
    pins[2] = Pin(this, 1, SIDE_E, "Z");
}

void CC2Elm::getInfo(std::vector<std::string> &arr) {
    arr.resize(4);
    arr[0] = (gain == 1) ? "CCII+~" : "CCII-~";  // ~ is for localization
    arr[1] = "X,Y = " + getVoltageText(nodes[0]->v);
    arr[2] = "Z = " + getVoltageText(nodes[2]->v);
    arr[3] = "I = " + getCurrentText(pins[0].current);
}

void CC2Elm::stamp() {
    // X voltage = Y voltage
    sim->stampVoltageSource(CircuitNode::ground, nodes[0], pins[0].voltSource);
    sim->stampVCVS(CircuitNode::ground, nodes[1], 1, pins[0].voltSource);
    // Z current = gain * X current
    sim->stampCCCS(CircuitNode::ground, nodes[2], pins[0].voltSource, gain);
}

void CC2Elm::calculateCurrent() {
    ChipElm::calculateCurrent();
    pins[2].current = pins[0].current * gain;
}
