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

#include "TimeDelayRelayElm.h"

#include "../core/StringTokenizer.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"

void TimeDelayRelayElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr) {
        onDelay = parseFloatStrict(st->nextToken());
        offDelay = parseFloatStrict(st->nextToken());
        onResistance = parseFloatStrict(st->nextToken());
        offResistance = resistance = parseFloatStrict(st->nextToken());
    } else {
        onDelay = 1;
        offDelay = 0;
        onResistance = 1;
        offResistance = resistance = 10e6;
    }
}

void TimeDelayRelayElm::reset() {
    lastTransition = 0;
    poweredState = onState = false;
}

void TimeDelayRelayElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ond", onDelay);
    CircuitXMLSerializer::dumpAttr(elem, "ofd", offDelay);
    CircuitXMLSerializer::dumpAttr(elem, "onr", onResistance);
    CircuitXMLSerializer::dumpAttr(elem, "ofr", offResistance);
}

void TimeDelayRelayElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    onDelay = xml.parseDoubleAttr("ond", onDelay);
    offDelay = xml.parseDoubleAttr("ofd", offDelay);
    onResistance = xml.parseDoubleAttr("onr", onResistance);
    offResistance = xml.parseDoubleAttr("ofr", offResistance);
    resistance = offResistance;
}

void TimeDelayRelayElm::setupPins() {
    sizeX = 2;
    sizeY = 2;
    pins.assign(4, Pin());
    pins[0] = Pin(this, 1, SIDE_W, "Vin");
    pins[1] = Pin(this, 1, SIDE_E, "gnd");
    pins[2] = Pin(this, 0, SIDE_W, "in");
    pins[3] = Pin(this, 0, SIDE_E, "out");
}

void TimeDelayRelayElm::stamp() {
    resistance = onState ? onResistance : offResistance;
    sim->stampResistor(nodes[0], nodes[1], vinResistance);
    sim->stampNonLinear(nodes[2]);
    sim->stampNonLinear(nodes[3]);
}

void TimeDelayRelayElm::doStep() {
    resistance = onState ? onResistance : offResistance;
    sim->stampResistor(nodes[2], nodes[3], resistance);
}

void TimeDelayRelayElm::stepFinished() {
    // power applied, then delay, then in and out are connected
    bool oldState = poweredState;
    poweredState = (nodes[0]->v - nodes[1]->v > 2.5);
    if (oldState != poweredState)
        lastTransition = sim->t;
    if (sim->t > lastTransition + (poweredState ? onDelay : offDelay))
        onState = poweredState;
}

void TimeDelayRelayElm::draw(Graphics &g) {
    pins[0].current = -(nodes[0]->v - nodes[1]->v) / vinResistance;
    pins[2].current = -(nodes[2]->v - nodes[3]->v) / resistance;
    pins[1].current = -pins[0].current;
    pins[3].current = -pins[2].current;
    drawChip(g);
}

std::optional<EditInfo> TimeDelayRelayElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("On Delay (s)", onDelay, 0, 0);
    if (n == 1)
        return EditInfo("Off Delay (s)", offDelay, 0, 0);
    if (n == 2)
        return EditInfo("On Resistance (ohms)", onResistance, 0, 0).setPositive();
    if (n == 3)
        return EditInfo("Off Resistance (ohms)", offResistance, 0, 0).setPositive();
    return std::nullopt;
}

void TimeDelayRelayElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0)
        onDelay = ei.value;
    if (n == 1)
        offDelay = ei.value;
    if (n == 2)
        onResistance = ei.value;
    if (n == 3)
        offResistance = ei.value;
}
