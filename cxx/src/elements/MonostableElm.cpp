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

#include "MonostableElm.h"

#include "../core/StringTokenizer.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"

void MonostableElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr) {
        retriggerable = st->nextToken() == "true";
        delay = parseFloatStrict(st->nextToken());
    }
    reset();
}

void MonostableElm::setupPins() {
    sizeX = 2;
    sizeY = 2;
    pins.assign(getPostCount(), Pin());
    pins[0] = Pin(this, 0, SIDE_W, "");
    pins[0].clock = true;
    pins[0].bubble = invertTrigger();
    pins[1] = Pin(this, 0, SIDE_E, "Q");
    pins[1].output = true;
    pins[2] = Pin(this, 1, SIDE_E, "Q");
    pins[2].output = true;
    pins[2].lineOver = true;
}

void MonostableElm::reset() {
    ChipElm::reset();
    pins[2].value = true;
    triggered = prevInputValue = false;
}

void MonostableElm::execute() {
    bool trigValue = pins[0].value != invertTrigger();
    if (trigValue && prevInputValue != trigValue && (retriggerable || !triggered)) {
        lastRisingEdge = sim->t;
        pins[1].value = true;
        pins[2].value = false;
        triggered = true;
    }
    if (triggered && sim->t > lastRisingEdge + delay) {
        pins[1].value = false;
        pins[2].value = true;
        triggered = false;
    }
    prevInputValue = trigValue;
}

void MonostableElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "rt", retriggerable);
    CircuitXMLSerializer::dumpAttr(elem, "dl", delay);
}

void MonostableElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    retriggerable = xml.parseBooleanAttr("rt", retriggerable);
    delay = xml.parseDoubleAttr("dl", delay);
    reset();
}

std::optional<EditInfo> MonostableElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Retriggerable", retriggerable);
    if (n == 1)
        return EditInfo("Period (s)", delay, 0.001, 0.1);
    if (n == 2)
        return EditInfo::createCheckbox("Invert Trigger", invertTrigger());
    return ChipElm::getChipEditInfo(n);
}

void MonostableElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0)
        retriggerable = ei.checkbox->getState();
    if (n == 1)
        delay = ei.value;
    if (n == 2) {
        flags = ei.changeFlag(flags, FLAG_INVERT_TRIGGER);
        setupPins();
        setPoints();
    }
    ChipElm::setChipEditValue(n, ei);
}
