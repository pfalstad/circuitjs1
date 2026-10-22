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

#include "PisoShiftElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"

void PisoShiftElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr) {
        data.assign(bits, false);
        ChipElm::readBits(*st, data);
    } else {
        data.assign(bits, false);
        flags |= FLAG_NEW_BEHAVIOR;
    }
    setupPins();
}

void PisoShiftElm::dumpXmlState(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXmlState(doc, elem);
    std::vector<bool> newData(data.size(), false);
    for (size_t i = 0; i < data.size(); i++)
        newData[i] = data[(i + dataIndex) % data.size()];
    CircuitXMLSerializer::dumpAttr(elem, "dt", ChipElm::writeBitsToString(newData));
}

void PisoShiftElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    data.assign(bits, false);
    dataIndex = 0;
    std::optional<std::string> dt = xml.parseStringAttr("dt", std::nullopt);
    if (dt)
        ChipElm::readBitsFromString(*dt, data);
}

void PisoShiftElm::reset() {
    ChipElm::reset();
    data.assign(bits, false);
}

void PisoShiftElm::setupPins() {
    sizeX = bits + 2;
    sizeY = 3;
    pins.assign(getPostCount(), Pin());
    pins[0] = Pin(this, 1, SIDE_W, "LD");
    pins[1] = Pin(this, 2, SIDE_W, "");
    pins[1].clock = true;
    pins[2] = Pin(this, 1, SIDE_E, "Q" + std::to_string(hasNewBhvr() ? bits - 1 : bits));
    pins[2].output = true;
    if (hasNewBhvr()) {
        pins[3] = Pin(this, 0, SIDE_W, "SER");
        if (!data.empty())
            pins[2].value = data[0];
        dataPinIndex = 4;
    } else {
        dataPinIndex = 3;
    }
    for (int i = 0; i < bits; i++)
        pins[dataPinIndex + i] = Pin(this, bits - i, SIDE_N, "D" + std::to_string(bits - (i + 1)));
    allocNodes();
}

void PisoShiftElm::execute() {
    // LOAD raised
    if (pins[0].value != loadState) {
        loadState = pins[0].value;
        if (loadState && !data.empty()) {
            if (hasNewBhvr()) {
                pins[2].value = pins[dataPinIndex].value;
                dataIndex = 0;
            } else {
                dataIndex = -1;
            }
            for (size_t i = 0; i < data.size(); i++)
                data[i] = pins[dataPinIndex + i].value;
        }
    }
    // CLK raised
    if (pins[1].value != clockState) {
        clockState = pins[1].value;
        if (clockState) {
            if (dataIndex >= 0)
                data[dataIndex] = hasNewBhvr() && pins[3].value;
            dataIndex++;
            if (dataIndex >= (int) data.size())
                dataIndex = 0;
            pins[2].value = data[dataIndex];
        }
    }
}

std::optional<EditInfo> PisoShiftElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless();
    return std::nullopt;
}

void PisoShiftElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value != bits && ei.value >= 1) {
        bits = (int) std::trunc(ei.value);
        data.assign(bits, false);
        setupPins();
        setPoints();
    }
}
