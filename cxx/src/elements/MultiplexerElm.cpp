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

#include "MultiplexerElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"

void MultiplexerElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    selectBitCount = 2;
    if (st != nullptr) {
        try {
            selectBitCount = parseIntStrict(st->nextToken());
        } catch (...) {}
    }
    setupPins();
}

void MultiplexerElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "se", selectBitCount);
    if (inputMode != 0)
        CircuitXMLSerializer::dumpAttr(elem, "im", inputMode);
    if (dataBusWidth != 4)
        CircuitXMLSerializer::dumpAttr(elem, "dw", dataBusWidth);
}

void MultiplexerElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    selectBitCount = xml.parseIntAttr("se", selectBitCount);
    inputMode = xml.parseIntAttr("im", 0);
    dataBusWidth = xml.parseIntAttr("dw", 4);
    setupPins();
}

void MultiplexerElm::setupPins() {
    if (!selectBitCount)
        selectBitCount = 2;
    outputCount = 1 << selectBitCount;
    int i, n;
    if (inputMode == INPUT_MODE_BUS_BUS) {
        int inputPinCount = outputCount * dataBusWidth;
        int outputPinCount = dataBusWidth;
        int invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? dataBusWidth : 0;
        int strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;
        sizeX = selectBitCount + 1;
        sizeY = outputCount + 1;
        pins.assign(inputPinCount + selectBitCount + outputPinCount + invertedCount + strobeCount, Pin());
        // input bus groups on west side
        for (int g = 0; g < outputCount; g++) {
            for (i = 0; i < dataBusWidth; i++) {
                n = g * dataBusWidth + i;
                pins[n] = Pin(this, g, SIDE_W, "I" + std::to_string(g));
                pins[n].busWidth = dataBusWidth;
                pins[n].busZ = i;
            }
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
        // output bus on east side
        outputPin = selectPin + selectBitCount;
        for (i = 0; i < dataBusWidth; i++) {
            n = outputPin + i;
            pins[n] = Pin(this, 0, SIDE_E, "Q");
            pins[n].output = true;
            pins[n].busWidth = dataBusWidth;
            pins[n].busZ = i;
        }
        // inverted output bus
        if (hasFlag(FLAG_INVERTED_OUTPUT)) {
            for (i = 0; i < dataBusWidth; i++) {
                n = outputPin + dataBusWidth + i;
                pins[n] = Pin(this, 1, SIDE_E, "Q");
                pins[n].lineOver = true;
                pins[n].output = true;
                pins[n].bubble = (i == 0);
                pins[n].busWidth = dataBusWidth;
                pins[n].busZ = i;
            }
        }
        // strobe
        if (hasFlag(FLAG_STROBE)) {
            n = outputPin + dataBusWidth + invertedCount;
            pins[n] = Pin(this, 0, SIDE_S, "STR");
            strobe = n;
        } else
            strobe = -1;
    } else if (inputMode == INPUT_MODE_BUS_BIT) {
        sizeX = selectBitCount + 1;
        sizeY = 3;
        int strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;
        int invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? 1 : 0;
        pins.assign(outputCount + selectBitCount + 1 + invertedCount + strobeCount, Pin());
        // bus input pins: all at same position
        for (i = 0; i < outputCount; i++) {
            pins[i] = Pin(this, 0, SIDE_W, "I");
            pins[i].busWidth = outputCount;
            pins[i].busZ = i;
        }
        // select pins
        selectPin = outputCount;
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
        // output
        n = selectPin + selectBitCount;
        pins[n] = Pin(this, 0, SIDE_E, "Q");
        pins[n].output = true;
        outputPin = n;
        if (hasFlag(FLAG_INVERTED_OUTPUT)) {
            n++;
            pins[n] = Pin(this, 1, SIDE_E, "Q");
            pins[n].lineOver = true;
            pins[n].output = true;
            pins[n].bubble = true;
        }
        if (hasFlag(FLAG_STROBE)) {
            n++;
            pins[n] = Pin(this, 0, SIDE_S, "STR");
            strobe = n;
        } else
            strobe = -1;
    } else {
        // mode 0: individual inputs / single output
        sizeX = selectBitCount + 1;
        sizeY = outputCount + 1;
        int strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;
        int invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? 1 : 0;
        pins.assign(outputCount + selectBitCount + 1 + invertedCount + strobeCount, Pin());
        for (i = 0; i < outputCount; i++)
            pins[i] = Pin(this, i, SIDE_W, "I" + std::to_string(i));
        selectPin = outputCount;
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
        n = selectPin + selectBitCount;
        pins[n] = Pin(this, 0, SIDE_E, "Q");
        pins[n].output = true;
        outputPin = n;
        if (hasFlag(FLAG_INVERTED_OUTPUT)) {
            n++;
            pins[n] = Pin(this, 1, SIDE_E, "Q");
            pins[n].lineOver = true;
            pins[n].output = true;
            pins[n].bubble = true;
        }
        if (hasFlag(FLAG_STROBE)) {
            n++;
            pins[n] = Pin(this, 0, SIDE_S, "STR");
            strobe = n;
        } else
            strobe = -1;
    }
    allocNodes();
}

int MultiplexerElm::getPostCount() {
    if (inputMode == INPUT_MODE_BUS_BUS) {
        int invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? dataBusWidth : 0;
        int strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;
        return outputCount * dataBusWidth + selectBitCount + dataBusWidth + invertedCount + strobeCount;
    }
    int invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? 1 : 0;
    int strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;
    return outputCount + selectBitCount + 1 + invertedCount + strobeCount;
}

int MultiplexerElm::getVoltageSourceCount() {
    if (inputMode == INPUT_MODE_BUS_BUS) {
        int count = dataBusWidth;
        if (hasFlag(FLAG_INVERTED_OUTPUT))
            count += dataBusWidth;
        return count;
    }
    return hasFlag(FLAG_INVERTED_OUTPUT) ? 2 : 1;
}

int MultiplexerElm::readSelectValue() {
    int sel = 0;
    for (int i = 0; i < selectBitCount; i++)
        if (pins[selectPin + i].value)
            sel |= 1 << i;
    return sel;
}

void MultiplexerElm::execute() {
    int selectedValue = readSelectValue();
    if (inputMode == INPUT_MODE_BUS_BUS) {
        bool strobed = (strobe != -1 && pins[strobe].value);
        for (int i = 0; i < dataBusWidth; i++) {
            bool val = strobed ? false : pins[selectedValue * dataBusWidth + i].value;
            pins[outputPin + i].value = val;
        }
        if (hasFlag(FLAG_INVERTED_OUTPUT)) {
            for (int i = 0; i < dataBusWidth; i++)
                pins[outputPin + dataBusWidth + i].value = !pins[outputPin + i].value;
        }
    } else {
        bool val = pins[selectedValue].value;
        if (strobe != -1 && pins[strobe].value)
            val = false;
        pins[outputPin].value = val;
        if (hasFlag(FLAG_INVERTED_OUTPUT))
            pins[outputPin + 1].value = !val;
    }
}

std::optional<EditInfo> MultiplexerElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Select Bits", selectBitCount, 1, 8).setDimensionless();
    if (n == 1)
        return EditInfo::createCheckbox("Inverted Output", hasFlag(FLAG_INVERTED_OUTPUT));
    if (n == 2)
        return EditInfo::createCheckbox("Strobe Pin", hasFlag(FLAG_STROBE));
    if (n == 3) {
        EditInfo ei("Input Mode", 0, -1, -1);
        ei.choice.emplace();
        ei.choice->add("Individual Inputs");
        ei.choice->add("Bus Input (Bit Select)");
        ei.choice->add("Bus Input/Output");
        ei.choice->select(inputMode);
        return ei;
    }
    if (n == 4)
        return EditInfo::createCheckbox("Bus Select", busSelect());
    if (n == 5 && inputMode == INPUT_MODE_BUS_BUS)
        return EditInfo("Data Bus Width", dataBusWidth, 2, 32).setDimensionless();
    return std::nullopt;
}

void MultiplexerElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 1 && ei.value <= 6) {
            selectBitCount = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be between 1 and 6");
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
        return;
    }
    if (n == 3) {
        inputMode = ei.choice->getSelectedIndex();
        setupPins();
        setPoints();
        return;
    }
    if (n == 4) {
        flags = ei.changeFlag(flags, FLAG_BUS_SELECT);
        setupPins();
        setPoints();
        return;
    }
    if (n == 5) {
        if (ei.value >= 2) {
            dataBusWidth = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be >= 2");
        return;
    }
}
