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

#include "SeqGenElm.h"

#include "../core/StringTokenizer.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"

void SeqGenElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr) {
        try {
            if ((flags & FLAG_NEW_VERSION) == 0) {
                flags |= FLAG_NEW_VERSION;
                // old format: single byte read backwards
                int32_t oldData = parseIntStrict(st->nextToken());
                int32_t newData = 0;
                for (int i = 0; i < 32; i++) {
                    if (((~(0x7FFFFFFF - 1) >> i) != 0) && (oldData & (int32_t) (1u << i)))
                        newData |= (int32_t) (1u << i);
                }
                bitCount = 8;
                data = {newData};
            } else {
                bitCount = parseIntStrict(st->nextToken());
                int wordCount = bitCount / 32 + (bitCount % 32 != 0 ? 1 : 0);
                data.assign(wordCount, 0);
                for (int i = 0; i < wordCount; i++)
                    data[i] = parseIntStrict(st->nextToken());
            }
        } catch (...) {}
        if (bitCount > (int) data.size() * 32)
            bitCount = (int) data.size() * 32;
    } else {
        bitCount = 8;
        data = {0};
        flags |= FLAG_NEW_VERSION;
        flags |= FLAG_HAS_RESET;
        setupPins();
        allocNodes();
    }
}

void SeqGenElm::setupPins() {
    sizeX = 2;
    sizeY = 2;
    pins.assign(getPostCount(), Pin());
    pins[0] = Pin(this, 0, SIDE_W, "");
    pins[0].clock = true;
    pins[1] = Pin(this, 1, SIDE_E, "Q");
    pins[1].output = true;
    if (hasReset())
        pins[2] = Pin(this, 1, SIDE_W, "R");
}

void SeqGenElm::reset() {
    ChipElm::reset();
    bitPosition = 0;
}

void SeqGenElm::nextBit() {
    if (!data.empty() && bitCount > 0) {
        if (bitPosition >= bitCount) {
            if (hasPlayOnce()) {
                pins[1].value = false;
                return;
            }
            bitPosition = 0;
        }
        pins[1].value = (data[bitPosition / 32] & (int32_t) (1u << (bitPosition % 32))) != 0;
        bitPosition++;
    } else {
        pins[1].value = false;
    }
}

void SeqGenElm::execute() {
    if (hasReset() && pins[2].value) {
        bitPosition = 0;
        clockstate = pins[0].value;
        nextBit();
    } else {
        if (pins[0].value != clockstate) {
            clockstate = pins[0].value;
            if (clockstate)
                nextBit();
        }
    }
}

void SeqGenElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "bc", bitCount);
    std::string s;
    for (size_t i = 0; i < data.size(); i++) {
        if (i > 0) s += " ";
        s += std::to_string(data[i]);
    }
    CircuitXMLSerializer::dumpAttr(elem, "dt", s);
}

void SeqGenElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    bitCount = xml.parseIntAttr("bc", bitCount);
    std::optional<std::string> dt = xml.parseStringAttr("dt", std::nullopt);
    if (dt) {
        StringTokenizer st(*dt, " ");
        std::vector<int32_t> words;
        while (st.hasMoreTokens()) words.push_back(parseIntStrict(st.nextToken()));
        data = words;
    }
    if (bitCount > (int) data.size() * 32)
        bitCount = (int) data.size() * 32;
}

std::optional<EditInfo> SeqGenElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Play Once", hasPlayOnce());
    if (n == 1) {
        EditInfo ei("Sequence", 0, -1, -1);
        ei.textArea.emplace();
        std::string sb;
        for (int i = 0; i < bitCount; i++)
            sb += (data[i / 32] & (int32_t) (1u << (i % 32))) != 0 ? '1' : '0';
        ei.textArea->value = sb;
        return ei;
    }
    return std::nullopt;
}

void SeqGenElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        flags = ei.changeFlag(flags, FLAG_PLAY_ONCE);
        return;
    }
    if (n == 1) {
        const std::string &s = ei.textArea->value;
        // count bits
        bitCount = 0;
        for (char c : s)
            if (c == '0' || c == '1') bitCount++;
        int wordCount = (bitCount + 31) / 32;  // (the TS version rounds down, dropping the last partial word)
        data.assign(std::max(1, wordCount), 0);
        // fill bits
        bitCount = 0;
        for (char c : s) {
            if (c == '0' || c == '1') {
                if (c == '1')
                    data[bitCount / 32] |= (int32_t) (1u << (bitCount % 32));
                bitCount++;
            }
        }
    }
}
