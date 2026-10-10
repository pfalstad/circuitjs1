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

#include "AnalogMuxElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"

void AnalogMuxElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr) {
        try {
            selectBitCount = parseIntStrict(st->nextToken());
            r_on = parseFloatStrict(st->nextToken());
            r_off = parseFloatStrict(st->nextToken());
            threshold = parseFloatStrict(st->nextToken());
        } catch (...) {}
    } else {
        flags |= FLAG_PULLDOWN;
    }
    setupPins();
}

std::string AnalogMuxElm::dump() {
    return ChipElm::dump() + " " + std::to_string(selectBitCount) + " " + jsNumberToString(r_on) + " " +
        jsNumberToString(r_off) + " " + jsNumberToString(threshold);
}

void AnalogMuxElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "sb", selectBitCount);
    CircuitXMLSerializer::dumpAttr(elem, "ron", r_on);
    CircuitXMLSerializer::dumpAttr(elem, "rof", r_off);
    CircuitXMLSerializer::dumpAttr(elem, "thr", threshold);
}

void AnalogMuxElm::undumpXml(CircuitXMLDeserializer &xml) {
    // read selectBitCount before ChipElm::undumpXml() since ChipElm calls setupPins() there
    selectBitCount = xml.parseIntAttr("sb", selectBitCount);
    ChipElm::undumpXml(xml);
    r_on = xml.parseDoubleAttr("ron", r_on);
    r_off = xml.parseDoubleAttr("rof", r_off);
    threshold = xml.parseDoubleAttr("thr", threshold);
}

void AnalogMuxElm::setupPins() {
    if (!selectBitCount) return;
    inputCount = 1 << selectBitCount;
    sizeX = selectBitCount + 1;
    sizeY = inputCount + 1;
    pins.assign(getPostCount(), Pin());
    for (int i = 0; i != inputCount; i++)
        pins[i] = Pin(this, i, SIDE_W, "I" + std::to_string(i));
    for (int i = 0; i != selectBitCount; i++)
        pins[inputCount + i] = Pin(this, i + 1, SIDE_S, "S" + std::to_string(i));
    outputPin = inputCount + selectBitCount;
    pins[outputPin] = Pin(this, 0, SIDE_E, "Z");
    allocNodes();
}

void AnalogMuxElm::stamp() {
    for (int i = 0; i != inputCount; i++)
        sim->stampNonLinear(nodes[i]);
    sim->stampNonLinear(nodes[outputPin]);
}

int AnalogMuxElm::selectedInput() {
    int sel = 0;
    for (int i = 0; i != selectBitCount; i++)
        if (nodes[inputCount + i]->v > threshold)
            sel |= 1 << i;
    return sel;
}

// stamp r_on between output and selected input.  For the others, if
// the pulldown flag is set, pull them to ground with r_off instead of
// connecting them to the output with r_off (better conditioned, and
// avoids leaving unselected inputs floating).
void AnalogMuxElm::doStep() {
    int sel = selectedInput();
    for (int i = 0; i != inputCount; i++) {
        if (i == sel)
            sim->stampResistor(nodes[i], nodes[outputPin], r_on);
        else if (needsPulldown())
            sim->stampResistor(nodes[i], CircuitNode::ground, r_off);
        else
            sim->stampResistor(nodes[i], nodes[outputPin], r_off);
    }
}

void AnalogMuxElm::calculateCurrent() {
    int sel = selectedInput();
    double outputCurrent = 0;
    for (int i = 0; i != inputCount; i++) {
        if (i == sel) {
            double c = (nodes[i]->v - nodes[outputPin]->v) / r_on;
            pins[i].current = -c;
            outputCurrent += c;
        } else if (needsPulldown()) {
            pins[i].current = -nodes[i]->v / r_off;
        } else {
            double c = (nodes[i]->v - nodes[outputPin]->v) / r_off;
            pins[i].current = -c;
            outputCurrent += c;
        }
    }
    pins[outputPin].current = outputCurrent;
    for (int i = 0; i != selectBitCount; i++)
        pins[inputCount + i].current = 0;
}

bool AnalogMuxElm::getConnection(int n1, int n2) {
    if (n1 >= inputCount && n1 < outputPin) return false;
    if (n2 >= inputCount && n2 < outputPin) return false;
    return true;
}

void AnalogMuxElm::getInfo(std::vector<std::string> &arr) {
    arr.resize(3);
    arr[0] = "analog multiplexer";
    arr[1] = "selected: I" + std::to_string(selectedInput());
    arr[2] = "Vout = " + getVoltageText(nodes[outputPin]->v);
}

std::optional<EditInfo> AnalogMuxElm::getChipEditInfo(int n) {
    if (n == 0) return EditInfo("# of Select Bits", selectBitCount, 1, 8).setDimensionless();
    if (n == 1) return EditInfo("On Resistance (ohms)", r_on, 0, 0).setPositive();
    if (n == 2) return EditInfo("Off Resistance (ohms)", r_off, 0, 0).setPositive();
    if (n == 3) return EditInfo("Threshold Voltage", threshold, 0, 0);
    if (n == 4) return EditInfo::createCheckbox("Pulldown Resistor", needsPulldown());
    return ChipElm::getChipEditInfo(n);
}

void AnalogMuxElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 1 && ei.value <= 6) {
            selectBitCount = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
        } else ei.setError("must be between 1 and 6");
        return;
    }
    if (n == 1 && ei.value > 0) r_on = ei.value;
    if (n == 2 && ei.value > 0) r_off = ei.value;
    if (n == 3) threshold = ei.value;
    if (n == 4) flags = ei.changeFlag(flags, FLAG_PULLDOWN);
    ChipElm::setChipEditValue(n, ei);
}
