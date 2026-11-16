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

#include "GangedMultiplexerElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"

void GangedMultiplexerElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr) {
        try {
            count = parseIntStrict(st->nextToken());
        } catch (...) {}
    }
    setupPins();
}

void GangedMultiplexerElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ct", count);
}

void GangedMultiplexerElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    count = xml.parseIntAttr("ct", count);
    setupPins();
}

void GangedMultiplexerElm::setupPins() {
    if (!count)
        count = 1;
    int strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;
    int invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? count : 0;

    sizeX = 2;
    sizeY = count * 2 + 1;
    pins.assign(count * 2 + 1 + count + invertedCount + strobeCount, Pin());

    // A/B input pairs on west side
    for (int i = 0; i < count; i++) {
        pins[i * 2] = Pin(this, i * 2, SIDE_W, "A" + std::to_string(i + 1));
        pins[i * 2 + 1] = Pin(this, i * 2 + 1, SIDE_W, "B" + std::to_string(i + 1));
    }

    // single shared select pin on south side
    selectPin = count * 2;
    pins[selectPin] = Pin(this, 0, SIDE_S, "S");

    // Y outputs on east side
    outputPin = selectPin + 1;
    for (int i = 0; i < count; i++) {
        int n = outputPin + i;
        pins[n] = Pin(this, i * 2, SIDE_E, "Y" + std::to_string(i + 1));
        pins[n].output = true;
    }

    if (hasFlag(FLAG_INVERTED_OUTPUT)) {
        for (int i = 0; i < count; i++) {
            int n = outputPin + count + i;
            pins[n] = Pin(this, i * 2 + 1, SIDE_E, "Y" + std::to_string(i + 1));
            pins[n].lineOver = true;
            pins[n].output = true;
            pins[n].bubble = true;
        }
    }

    if (hasFlag(FLAG_STROBE)) {
        int n = outputPin + count + invertedCount;
        pins[n] = Pin(this, 1, SIDE_S, "STR");
        strobe = n;
    } else
        strobe = -1;

    allocNodes();
}

int GangedMultiplexerElm::getPostCount() {
    int invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? count : 0;
    int strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;
    return count * 2 + 1 + count + invertedCount + strobeCount;
}

int GangedMultiplexerElm::getVoltageSourceCount() {
    int c = count;
    if (hasFlag(FLAG_INVERTED_OUTPUT))
        c += count;
    return c;
}

void GangedMultiplexerElm::execute() {
    int sel = pins[selectPin].value ? 1 : 0;
    bool strobed = (strobe != -1 && pins[strobe].value);
    for (int r = 0; r < count; r++) {
        bool val = strobed ? false : pins[r * 2 + sel].value;
        pins[outputPin + r].value = val;
        if (hasFlag(FLAG_INVERTED_OUTPUT))
            pins[outputPin + count + r].value = !val;
    }
}

std::optional<EditInfo> GangedMultiplexerElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("Output Count", count, 1, 16).setDimensionless();
    if (n == 1)
        return EditInfo::createCheckbox("Inverted Output", hasFlag(FLAG_INVERTED_OUTPUT));
    if (n == 2)
        return EditInfo::createCheckbox("Strobe Pin", hasFlag(FLAG_STROBE));
    return std::nullopt;
}

void GangedMultiplexerElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 1 && ei.value <= 16) {
            count = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be between 1 and 16");
        return;
    }
    if (n == 1) {
        flags = ei.changeFlag(flags, FLAG_INVERTED_OUTPUT);
        setupPins();
        setPoints();
        return;
    }
    if (n == 2) {
        flags = ei.changeFlag(flags, FLAG_STROBE);
        setupPins();
        setPoints();
    }
}
