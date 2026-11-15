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

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"

void DecimalDisplayElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    bitCount = 4;
    if (st == nullptr)
        flags |= FLAG_ALLOW_WIDE;
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

int DecimalDisplayElm::getRadix() {
    switch (displayMode) {
    case 1: return 16;
    case 2: return 8;
    default: return 10;
    }
}

// value.toString(radix).toUpperCase()
static std::string toRadixString(unsigned long long value, int radix) {
    std::string s;
    do {
        s.insert(s.begin(), "0123456789ABCDEF"[value % radix]);
        value /= radix;
    } while (value != 0);
    return s;
}

int DecimalDisplayElm::maxDigits() {
    return (int) toRadixString((1ULL << bitCount) - 1, getRadix()).size();
}

void DecimalDisplayElm::draw(Graphics &g) {
    drawChip(g);
    unsigned long long value = 0;
    for (int i = 0; i != bitCount; i++)
        if (pins[i].value)
            value += 1ULL << i;
    std::string str = toRadixString(value, getRadix());

    // the space inside the chip that isn't taken by the pin labels
    double x1 = rectPointsX[0], x2 = rectPointsX[2];
    double y1 = rectPointsY[0], y2 = rectPointsY[2];
    // which side the pins (and so their labels) are on, after any flipping
    const Point &post = pins[0].post;
    bool left = post.x < x1, right = post.x > x2;
    if (left || right) {
        g.setFont(Font("normal", 0, 10 * csize));
        double labelW = 0;
        for (int i = 0; i != getPostCount(); i++) {
            const Pin &p = pins[i];
            if (p.busZ > 0)
                continue;
            std::string text = p.busWidth > 1 ? p.text + "/" + std::to_string(p.busWidth) : p.text;
            labelW = std::max(labelW, g.measureWidth(text));
        }
        double band = 5 + labelW + 3 * csize;
        if (left)
            x1 += band;
        else
            x2 -= band;
    } else if (post.y < y1)
        y1 += cspc2;
    else
        y2 -= cspc2;

    g.save();
    int fsz = 15 * csize;
    g.setFont(Font("SansSerif", 0, fsz));
    g.setColor(whiteColor);
    g.setTextBaseline(Graphics::BASELINE_MIDDLE);
    double avail = x2 - x1 - 4 * csize;
    double w = g.measureWidth(str);
    if (w > avail && avail > 0) {
        fsz = std::max(6, (int) std::floor(fsz * avail / w));
        g.setFont(Font("SansSerif", 0, fsz));
        w = g.measureWidth(str);
    }
    g.drawString(str, (x1 + x2) / 2 - w / 2, (y1 + y2) / 2);
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
    // wide enough for the pin labels plus the largest value.  (in units of csize: a grid
    // unit is 16, a digit is about 8.4, and the labels and margins take about 22, or 27
    // for two-digit pin numbers)
    int labels = bitCount > 10 ? 27 : 22;
    sizeX = !hasFlag(FLAG_ALLOW_WIDE) ? 3 : std::max(3, (int) std::ceil((labels + 8.4 * maxDigits()) / 16));
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
                flags |= FLAG_ALLOW_WIDE;
                setupPins();
                setPoints();
            }
        } else
            ei.setError("must be between 1 and 16");
        return;
    }
    if (n == 1) {
        int mode = ei.choice->getSelectedIndex();
        if (mode != displayMode) {
            displayMode = mode;
            flags |= FLAG_ALLOW_WIDE;
            setupPins();
            setPoints();
        }
    }
}
