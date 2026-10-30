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

#include "Counter2Elm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"

void Counter2Elm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st == nullptr)
        return;
    try {
        modulus = parseIntStrict(st->nextToken());
    } catch (...) {}
}

void Counter2Elm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "mo", modulus);
}

void Counter2Elm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    modulus = xml.parseIntAttr("mo", modulus);
}

std::string Counter2Elm::getChipName() {
    if (modulus == 0)
        return "Counter";
    return Locale::LS("Counter") + Locale::LS(" (mod ") + std::to_string(modulus) + ")";
}

void Counter2Elm::setupPins() {
    sizeX = 2;
    int bitsY = useBus() ? 1 : bits;
    sizeY = bitsY + 3;
    pins.assign(getPostCount(), Pin());
    makeBitPins(bits, 1, SIDE_E, 0, "Q", true, true, true);
    makeBitPins(bits, 1, SIDE_W, bits, "I", false, false, true);
    int p = bits * 2;
    clk = p;
    clr = p + 1;
    enp = p + 2;
    rco = p + 3;
    load = p + 4;
    ent = p + 5;
    pins[clk] = Pin(this, 0, SIDE_W, "");
    pins[clk].clock = true;
    pins[clr] = Pin(this, bitsY + 1, SIDE_W, "CLR");
    pins[clr].bubble = true;
    pins[enp] = Pin(this, bitsY + 2, SIDE_W, "EnP");
    pins[rco] = Pin(this, 0, SIDE_E, "RCO");
    pins[rco].output = true;
    pins[load] = Pin(this, bitsY + 1, SIDE_E, "LOAD");
    pins[load].bubble = true;
    pins[ent] = Pin(this, bitsY + 2, SIDE_E, "EnT");
}

std::optional<EditInfo> Counter2Elm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless().setStructural();
    if (n == 1)
        return EditInfo("Modulus", modulus, 1, 1).setDimensionless();
    return std::nullopt;
}

void Counter2Elm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 2) {
            bits = (int) std::floor(ei.value);
            setupPins();
            setPoints();
            allocNodes();
        } else
            ei.setError("must be >= 2");
    }
    if (n == 1)
        modulus = (int) std::floor(ei.value);
}

void Counter2Elm::execute() {
    if (pins[clk].value && !lastClock) {
        if (pins[enp].value && pins[ent].value) {
            int value = 0;
            // get current value
            int lastBit = bits - 1;
            for (int i = 0; i != bits; i++)
                if (pins[lastBit - i].value)
                    value |= 1 << i;
            // update value
            value++;
            int realmod = (modulus == 0) ? (1 << bits) : modulus;
            value %= realmod;
            // convert value to binary
            for (int i = 0; i != bits; i++)
                writeOutput(lastBit - i, (value & (1 << i)) != 0);
            carry = (value == realmod - 1);
        }
        if (!pins[load].value) {
            for (int i = 0; i != bits; i++)
                writeOutput(i, pins[i + bits].value);
            int value = 0;
            // get current value
            int lastBit = bits - 1;
            for (int i = 0; i != bits; i++)
                if (pins[lastBit - i].value)
                    value |= 1 << i;
            int realmod = (modulus == 0) ? (1 << bits) : modulus;
            carry = (value == realmod - 1);
        }
    }
    if (!pins[clr].value) {
        for (int i = 0; i != bits; i++)
            writeOutput(i, false);
        carry = false;
    }
    lastClock = pins[clk].value;
    writeOutput(rco, carry && pins[ent].value);
}
