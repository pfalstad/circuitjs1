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

#include "SipoShiftElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"

void SipoShiftElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr) {
        std::vector<bool> data(bits, false);
        ChipElm::readBits(*st, data);
        for (int i = 0; i < bits; i++)
            pins[DATA_PIN_INDEX + i].value = data[i];
    }
}

void SipoShiftElm::dumpXmlState(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXmlState(doc, elem);
    std::vector<bool> data(bits, false);
    for (int i = 0; i < bits; i++)
        data[i] = pins[DATA_PIN_INDEX + i].value;
    CircuitXMLSerializer::dumpAttr(elem, "dt", ChipElm::writeBitsToString(data));
}

void SipoShiftElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    std::optional<std::string> dt = xml.parseStringAttr("dt", std::nullopt);
    if (dt) {
        std::vector<bool> data(bits, false);
        ChipElm::readBitsFromString(*dt, data);
        for (int i = 0; i < bits; i++)
            pins[DATA_PIN_INDEX + i].value = data[i];
    }
}

void SipoShiftElm::setupPins() {
    sizeX = bits + 1;
    sizeY = 3;
    // (the TS version tries to keep the old output values here, but it has already
    // replaced the pins array, so they always start out low)
    pins.assign(getPostCount(), Pin());
    pins[0] = Pin(this, 1, SIDE_W, "D");
    pins[1] = Pin(this, 2, SIDE_W, "");
    pins[1].clock = true;
    for (int i = 0; i < bits; i++) {
        Pin &pin = pins[DATA_PIN_INDEX + i] = Pin(this, i + 1, SIDE_N, "Q" + std::to_string(i));
        pin.output = true;
    }
    allocNodes();
}

void SipoShiftElm::execute() {
    if (pins[1].value != clockstate) {
        clockstate = pins[1].value;
        if (clockstate && bits > 0) {
            for (int i = bits - 2; i >= 0; i--)
                pins[DATA_PIN_INDEX + i + 1].value = pins[DATA_PIN_INDEX + i].value;
            pins[2].value = pins[0].value;
        }
    }
}

std::optional<EditInfo> SipoShiftElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless().setStructural();
    return std::nullopt;
}

void SipoShiftElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value != bits && ei.value >= 1) {
        bits = (int) std::trunc(ei.value);
        setupPins();
        setPoints();
    }
}
