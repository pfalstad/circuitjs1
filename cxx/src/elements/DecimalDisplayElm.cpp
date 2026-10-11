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

#include "DecimalDisplayElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>
#include <cstdio>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"

void DecimalDisplayElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    bitCount = 4;
    if (st != nullptr) {
        try {
            bitCount = parseIntStrict(st->nextToken());
            displayMode = parseIntStrict(st->nextToken());
        } catch (...) {}
    }
    setupPins();
}

std::string DecimalDisplayElm::getChipName() {
    switch (displayMode) {
    case 1: return "hex display";
    case 2: return "octal display";
    default: return "decimal display";
    }
}

void DecimalDisplayElm::draw(Graphics &g) {
    drawChip(g);
    int xl = x + cspc + flippedSizeX * cspc;
    int yl = y - cspc + flippedSizeY * cspc;
    if (isFlippedXY())
        yl += ((flags & FLAG_FLIP_Y) != 0) ? -cspc / 2 : cspc / 2;
    g.save();
    g.setFont(Font("SansSerif", 0, 15 * csize));
    g.setColor(whiteColor);
    g.setTextBaseline(Graphics::BASELINE_MIDDLE);
    int value = 0;
    for (int i = 0; i != bitCount; i++)
        if (pins[i].value)
            value |= 1 << i;
    char buf[40];
    switch (displayMode) {
    case 1: std::snprintf(buf, sizeof buf, "%X", value); break;
    case 2: std::snprintf(buf, sizeof buf, "%o", value); break;
    default: std::snprintf(buf, sizeof buf, "%d", value); break;
    }
    std::string str = buf;
    double w = g.measureWidth(str);
    g.drawString(str, xl + 5 * csize - w / 2, yl);
    g.restore();
}

void DecimalDisplayElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "bc", bitCount);
    CircuitXMLSerializer::dumpAttr(elem, "dm", displayMode);
}

void DecimalDisplayElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    bitCount = xml.parseIntAttr("bc", bitCount);
    displayMode = xml.parseIntAttr("dm", displayMode);
    setupPins();
}

void DecimalDisplayElm::setupPins() {
    if (!bitCount)
        return;
    sizeX = 3;
    sizeY = useBus() ? 2 : bitCount;
    pins.assign(bitCount, Pin());
    makeBitPins(bitCount, 0, SIDE_W, 0, "I", false, false, false);
    allocNodes();
}

std::optional<EditInfo> DecimalDisplayElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Bits", bitCount, 1, 8).setDimensionless();
    if (n == 1) {
        EditInfo ei("Display Mode", 0, -1, -1);
        ei.choice.emplace();
        ei.choice->add("Decimal");
        ei.choice->add("Hexadecimal");
        ei.choice->add("Octal");
        ei.choice->select(displayMode);
        return ei;
    }
    return std::nullopt;
}

void DecimalDisplayElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 1 && ei.value <= 16) {
            int newBitCount = (int) std::trunc(ei.value);
            if (newBitCount != bitCount) {
                bitCount = newBitCount;
                setupPins();
                setPoints();
            }
        } else
            ei.setError("must be between 1 and 16");
        return;
    }
    if (n == 1)
        displayMode = ei.choice->getSelectedIndex();
}
