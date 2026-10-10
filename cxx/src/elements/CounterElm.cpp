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

#include "CounterElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"

void CounterElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st == nullptr)
        return;
    invertreset = true;
    try {
        invertreset = st->nextToken() == "true";
        modulus = parseIntStrict(st->nextToken());
    } catch (...) {}
    pins[1].bubble = invertreset;
}

std::string CounterElm::dump() {
    return ChipElm::dump() + " " + (invertreset ? "true" : "false") + " " + std::to_string(modulus);
}

void CounterElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "in", invertreset);
    CircuitXMLSerializer::dumpAttr(elem, "mo", modulus);
}

void CounterElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    invertreset = xml.parseBooleanAttr("in", invertreset);
    modulus = xml.parseIntAttr("mo", modulus);
    pins[1].bubble = invertreset;
}

std::string CounterElm::getChipName() {
    if (modulus == 0)
        return "Counter";
    return Locale::LS("Counter") + Locale::LS(" (mod ") + std::to_string(modulus) + ")";
}

void CounterElm::setupPins() {
    if (!bits) return;
    sizeX = 2;
    sizeY = useBus() ? 3 : bits;
    pins.assign(getPostCount(), Pin());
    pins[0] = Pin(this, 0, SIDE_W, "");
    pins[0].clock = true;
    pins[0].bubble = negativeEdgeTriggered();
    pins[1] = Pin(this, sizeY - 1, SIDE_W, "R");
    pins[1].bubble = invertreset;
    makeBitPins(bits, 0, SIDE_E, 2, "Q", true, true, true);
    if (hasUpDown())
        pins[bits + 2] = Pin(this, sizeY - 2, SIDE_W, "U/D");
    allocNodes();
}

void CounterElm::execute() {
    bool neg = negativeEdgeTriggered();
    if (pins[0].value != neg && lastClock == neg) {
        int value = 0;
        // get direction
        int dir = 1;
        if (hasUpDown() && pins[bits + 2].value)
            dir = -1;
        // get current value
        int lastBit = 2 + bits - 1;
        for (int i = 0; i != bits; i++)
            if (pins[lastBit - i].value)
                value |= 1 << i;
        // update value
        value += dir;
        if (modulus != 0)
            value = ((value % modulus) + modulus) % modulus;
        // convert value to binary
        for (int i = 0; i != bits; i++)
            pins[lastBit - i].value = (value & (1 << i)) != 0;
    }
    if (!pins[1].value == invertreset) {
        for (int i = 0; i != bits; i++)
            pins[i + 2].value = false;
    }
    lastClock = pins[0].value;
}

std::optional<EditInfo> CounterElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Invert reset pin", invertreset);
    if (n == 1)
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless();
    if (n == 2)
        return EditInfo("Modulus", modulus, 1, 1).setDimensionless();
    if (n == 3)
        return EditInfo::createCheckbox("Up/Down Pin", hasUpDown());
    if (n == 4)
        return EditInfo::createCheckbox("Negative Edge Triggered", negativeEdgeTriggered());
    return std::nullopt;
}

void CounterElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        invertreset = ei.checkbox->getState();
        setupPins();
        setPoints();
    }
    if (n == 1) {
        if (ei.value >= 3) {
            bits = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be >= 3");
    }
    if (n == 2)
        modulus = (int) std::trunc(ei.value);
    if (n == 3) {
        flags = ei.changeFlag(flags, FLAG_UP_DOWN);
        setupPins();
        setPoints();
    }
    if (n == 4) {
        flags = ei.changeFlag(flags, FLAG_NEGATIVE_EDGE);
        setupPins();
        setPoints();
    }
}
