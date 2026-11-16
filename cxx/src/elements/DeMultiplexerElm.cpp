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

#include "DeMultiplexerElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"

void DeMultiplexerElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st == nullptr) {
        setupPins();
    } else {
        try {
            selectBitCount = parseIntStrict(st->nextToken());
        } catch (...) {}
        setupPins();
        allocNodes();
    }
}

void DeMultiplexerElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "se", selectBitCount);
    if (outputMode != 0)
        CircuitXMLSerializer::dumpAttr(elem, "om", outputMode);
    if (dataBusWidth != 4)
        CircuitXMLSerializer::dumpAttr(elem, "dw", dataBusWidth);
}

void DeMultiplexerElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    selectBitCount = xml.parseIntAttr("se", selectBitCount);
    outputMode = xml.parseIntAttr("om", 0);
    dataBusWidth = xml.parseIntAttr("dw", 4);
    setupPins();
    allocNodes();
}

void DeMultiplexerElm::setupPins() {
    if (!selectBitCount)
        selectBitCount = 2;
    outputCount = 1 << selectBitCount;
    int i, n;
    if (outputMode == OUTPUT_MODE_BUS_BUS) {
        int inputPinCount = dataBusWidth;
        int outputPinCount = outputCount * dataBusWidth;
        sizeX = selectBitCount + 1;
        sizeY = outputCount + 1;
        pins.assign(inputPinCount + selectBitCount + outputPinCount, Pin());
        // input bus on west side
        inputPin = 0;
        for (i = 0; i < dataBusWidth; i++) {
            pins[i] = Pin(this, 0, SIDE_W, "Q");
            pins[i].busWidth = dataBusWidth;
            pins[i].busZ = i;
        }
        // select pins on south side
        selectPin = inputPinCount;
        for (i = 0; i < selectBitCount; i++) {
            n = selectPin + i;
            if (busSelect()) {
                pins[n] = Pin(this, 0, SIDE_S, "S");
                pins[n].busWidth = selectBitCount;
                pins[n].busZ = i;
            } else {
                pins[n] = Pin(this, i + 1, SIDE_S, "S" + std::to_string(i));
            }
        }
        // output bus groups on east side
        outputPin = selectPin + selectBitCount;
        for (int g = 0; g < outputCount; g++) {
            for (i = 0; i < dataBusWidth; i++) {
                n = outputPin + g * dataBusWidth + i;
                pins[n] = Pin(this, g, SIDE_E, "Q" + std::to_string(g));
                pins[n].output = true;
                pins[n].busWidth = dataBusWidth;
                pins[n].busZ = i;
            }
        }
    } else if (outputMode == OUTPUT_MODE_BUS_BIT) {
        sizeX = selectBitCount + 1;
        sizeY = 3;
        pins.assign(1 + selectBitCount + outputCount, Pin());
        // single input on west side
        inputPin = 0;
        pins[0] = Pin(this, 0, SIDE_W, "Q");
        // select pins on south side
        selectPin = 1;
        for (i = 0; i < selectBitCount; i++) {
            n = selectPin + i;
            if (busSelect()) {
                pins[n] = Pin(this, 0, SIDE_S, "S");
                pins[n].busWidth = selectBitCount;
                pins[n].busZ = i;
            } else {
                pins[n] = Pin(this, i + 1, SIDE_S, "S" + std::to_string(i));
            }
        }
        // bus output on east side
        outputPin = selectPin + selectBitCount;
        for (i = 0; i < outputCount; i++) {
            n = outputPin + i;
            pins[n] = Pin(this, 1, SIDE_E, "Q");
            pins[n].output = true;
            pins[n].busWidth = outputCount;
            pins[n].busZ = i;
        }
    } else {
        // mode 0: single input, individual outputs
        sizeX = 1 + selectBitCount;
        sizeY = 1 + outputCount;
        pins.assign(1 + selectBitCount + outputCount, Pin());
        // individual output pins on east side
        outputPin = 0;
        for (i = 0; i < outputCount; i++) {
            pins[i] = Pin(this, i, SIDE_E, "Q" + std::to_string(i));
            pins[i].output = true;
        }
        // select pins on south side
        selectPin = outputCount;
        for (i = 0; i < selectBitCount; i++) {
            n = selectPin + i;
            if (busSelect()) {
                pins[n] = Pin(this, 0, SIDE_S, "S");
                pins[n].busWidth = selectBitCount;
                pins[n].busZ = i;
            } else {
                pins[n] = Pin(this, i, SIDE_S, "S" + std::to_string(i));
            }
        }
        // single input on west side
        inputPin = outputCount + selectBitCount;
        pins[inputPin] = Pin(this, 0, SIDE_W, "Q");
    }
    allocNodes();
}

int DeMultiplexerElm::getPostCount() {
    if (!dataBusWidth || !selectBitCount || !outputCount)
        return 0;
    if (outputMode == OUTPUT_MODE_BUS_BUS)
        return dataBusWidth + selectBitCount + outputCount * dataBusWidth;
    return 1 + selectBitCount + outputCount;
}

int DeMultiplexerElm::getVoltageSourceCount() {
    if (outputMode == OUTPUT_MODE_BUS_BUS)
        return outputCount * dataBusWidth;
    return outputCount;
}

int DeMultiplexerElm::readSelectValue() {
    int sel = 0;
    for (int i = 0; i < selectBitCount; i++)
        if (pins[selectPin + i].value)
            sel |= 1 << i;
    return sel;
}

void DeMultiplexerElm::execute() {
    int selectedValue = readSelectValue();
    // set inactive outputs to idle level, then copy input (bus) to selected output (group)
    int width = (outputMode == OUTPUT_MODE_BUS_BUS) ? dataBusWidth : 1;
    bool idle = invertOutputs();
    for (int i = 0; i < outputCount * width; i++)
        pins[outputPin + i].value = idle;
    for (int i = 0; i < width; i++)
        pins[outputPin + selectedValue * width + i].value = pins[inputPin + i].value;
}

std::optional<EditInfo> DeMultiplexerElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Select Bits", selectBitCount).setDimensionless().setStructural();
    if (n == 1) {
        EditInfo ei("Output Mode", 0, -1, -1);
        ei.choice.emplace();
        ei.choice->add("Individual Outputs");
        ei.choice->add("Bus Output (Bit Distribute)");
        ei.choice->add("Bus Input/Output");
        ei.choice->select(outputMode);
        return ei.setStructural();
    }
    if (n == 2)
        return EditInfo::createCheckbox("Bus Select", busSelect()).setStructural();
    if (n == 3)
        return EditInfo::createCheckbox("Keep Inactive Outputs High (74139)", invertOutputs());
    if (n == 4 && outputMode == OUTPUT_MODE_BUS_BUS)
        return EditInfo("Data Bus Width", dataBusWidth, 2, 32).setDimensionless().setStructural();
    return std::nullopt;
}

void DeMultiplexerElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 1 && ei.value <= 6) {
            selectBitCount = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be between 1 and 6");
    }
    if (n == 1) {
        outputMode = ei.choice->getSelectedIndex();
        setupPins();
        setPoints();
    }
    if (n == 2) {
        flags = ei.changeFlag(flags, FLAG_BUS_SELECT);
        setupPins();
        setPoints();
    }
    if (n == 3)
        flags = ei.changeFlag(flags, FLAG_INVERT_OUTPUTS);
    if (n == 4) {
        if (ei.value >= 2) {
            dataBusWidth = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be >= 2");
    }
}
