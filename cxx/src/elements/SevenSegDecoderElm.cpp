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

#include "SevenSegDecoderElm.h"

#include "../core/StringTokenizer.h"

#include <algorithm>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"

const bool SevenSegDecoderElm::symbols[16][7] = {
    {true,true,true,true,true,true,false},  //0
    {false,true,true,false,false,false,false},  //1
    {true,true,false,true,true,false,true},  //2
    {true,true,true,true,false,false,true},  //3
    {false,true,true,false,false,true,true},  //4
    {true,false,true,true,false,true,true},  //5
    {true,false,true,true,true,true,true},  //6
    {true,true,true,false,false,false,false},  //7
    {true,true,true,true,true,true,true},  //8
    {true,true,true,true,false,true,true},  //9
    {true,true,true,false,true,true,true},  //A
    {false,false,true,true,true,true,true},  //B
    {true,false,false,true,true,true,false},  //C
    {false,true,true,true,true,false,true},  //D
    {true,false,false,true,true,true,true},  //E
    {true,false,false,false,true,true,true},  //F
};

// 14-segment encoding: a=top, b=upper-right, c=lower-right, d=bottom, e=lower-left, f=upper-left,
// g=diag UL-center, h=vert upper, i=diag UR-center, j=horiz right-center,
// k=diag center-LR, l=vert lower, m=diag center-LL, n=horiz left-center
const bool SevenSegDecoderElm::symbols14[16][14] = {
    {true,true,true,true,true,true, false,false,true,false,false,false,true,false},  //0
    {false,true,true,false,false,false, false,false,true,false,false,false,false,false},  //1
    {true,true,false,true,true,false, false,false,false,true,false,false,false,true},  //2
    {true,true,true,true,false,false, false,false,false,true,false,false,false,true},  //3
    {false,true,true,false,false,true, false,false,false,true,false,false,false,true},  //4
    {true,false,true,true,false,true, false,false,false,true,false,false,false,true},  //5
    {true,false,true,true,true,true, false,false,false,true,false,false,false,true},  //6
    {true,false,false,false,false,false, false,false,true,false,false,true,false,false},  //7
    {true,true,true,true,true,true, false,false,false,true,false,false,false,true},  //8
    {true,true,true,true,false,true, false,false,false,true,false,false,false,true},  //9
    {true,true,true,false,true,true, false,false,false,true,false,false,false,true},  //A
    {true,true,true,true,false,false, false,true,false,true,false,true,false,false},  //B
    {true,false,false,true,true,true, false,false,false,false,false,false,false,false},  //C
    {true,true,true,true,false,false, false,true,false,false,false,true,false,false},  //D
    {true,false,false,true,true,true, false,false,false,true,false,false,false,true},  //E
    {true,false,false,false,true,true, false,false,false,true,false,false,false,true},  //F
};

// 16-segment encoding: a=top-left, b=top-right, c=upper-right, d=lower-right,
// e=bottom-right, f=bottom-left, g=lower-left, h=upper-left,
// i=diag UL-center, j=vert upper, k=diag UR-center, l=horiz right,
// m=diag center-LR, n=vert lower, o=diag center-LL, p=horiz left
const bool SevenSegDecoderElm::symbols16[16][16] = {
    {true,true,true,true,true,true,true,true, false,false,true,false,false,false,true,false},  //0
    {false,false,true,true,false,false,false,false, false,false,true,false,false,false,false,false},  //1
    {true,true,true,false,true,true,true,false, false,false,false,true,false,false,false,true},  //2
    {true,true,true,true,true,true,false,false, false,false,false,true,false,false,false,true},  //3
    {false,false,true,true,false,false,false,true, false,false,false,true,false,false,false,true},  //4
    {true,true,false,true,true,true,false,true, false,false,false,true,false,false,false,true},  //5
    {true,true,false,true,true,true,true,true, false,false,false,true,false,false,false,true},  //6
    {true,true,false,false,false,false,false,false, false,false,true,false,false,true,false,false},  //7
    {true,true,true,true,true,true,true,true, false,false,false,true,false,false,false,true},  //8
    {true,true,true,true,true,true,false,true, false,false,false,true,false,false,false,true},  //9
    {true,true,true,true,false,false,true,true, false,false,false,true,false,false,false,true},  //A
    {true,true,true,true,true,true,false,false, false,true,false,true,false,true,false,false},  //B
    {true,true,false,false,true,true,true,true, false,false,false,false,false,false,false,false},  //C
    {true,true,true,true,true,true,false,false, false,true,false,false,false,true,false,false},  //D
    {true,true,false,false,true,true,true,true, false,false,false,true,false,false,false,true},  //E
    {true,true,false,false,false,false,true,true, false,false,false,true,false,false,false,true},  //F
};

void SevenSegDecoderElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr) {
        try {
            segmentType = parseIntStrict(st->nextToken());
            setupPins();
            setPoints();
        } catch (...) {}
    }
}

void SevenSegDecoderElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "sgt", segmentType);
}

void SevenSegDecoderElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    segmentType = xml.parseIntAttr("sgt", segmentType);
    setupPins();
}

int SevenSegDecoderElm::getSegmentCount() {
    if (segmentType == 1) return 14;
    if (segmentType == 2) return 16;
    return 7;
}

std::string SevenSegDecoderElm::getChipName() {
    if (getSegmentCount() == 7) return "7-Segment Decoder";
    if (getSegmentCount() == 14) return "14-Segment Decoder";
    return "16-Segment Decoder";
}

void SevenSegDecoderElm::setupPins() {
    int segCount = getSegmentCount();
    bits = 4;
    sizeX = 3;
    int inputPinsY = useBus() ? 1 : 4;
    int outputPinsY = useBus() ? 1 : segCount;
    sizeY = std::max(outputPinsY, inputPinsY + (hasBlank() ? 1 : 0));
    pins.assign(getPostCount(), Pin());
    makeBitPins(4, 0, SIDE_W, segCount, "I", false, false, true);
    if (useBus()) {
        makeBitPins(segCount, 0, SIDE_E, 0, "seg", true, false, false);
    } else {
        for (int i = 0; i < segCount; i++) {
            pins[i] = Pin(this, i, SIDE_E, std::string(1, (char) ('a' + i)));
            pins[i].output = true;
        }
    }
    if (hasBlank()) {
        pins[segCount + 4] = Pin(this, inputPinsY, SIDE_W, "BI");
        pins[segCount + 4].bubble = true;
    }
    allocNodes();
}

// 7-segment mode only: by default 6 has a "hat" (top segment) and 9 has its bottom
// segment filled in, matching the symbols table above. The '148 Font option (named for
// the 74'148-style font some chips use) drops both, matching older 7-segment decoders.
bool SevenSegDecoderElm::segVal(int segCount, int digit, int seg) {
    if (segCount == 7 && use148Font()) {
        if (digit == 6 && seg == 0) return false;  // no hat on 6
        if (digit == 9 && seg == 3) return false;  // no bottom on 9
    }
    if (segCount == 14) return symbols14[digit][seg];
    if (segCount == 16) return symbols16[digit][seg];
    return symbols[digit][seg];
}

void SevenSegDecoderElm::execute() {
    int segCount = getSegmentCount();
    int input = 0;
    if (pins[segCount + 0].value) input += 8;
    if (pins[segCount + 1].value) input += 4;
    if (pins[segCount + 2].value) input += 2;
    if (pins[segCount + 3].value) input += 1;
    bool en = true;
    if (hasBlank() && !pins[segCount + 4].value)
        en = false;
    if (!en || (input == 15 && blankOnF())) {
        for (int i = 0; i != segCount; i++)
            writeOutput(i, false);
    } else {
        for (int i = 0; i < segCount; i++)
            writeOutput(i, segVal(segCount, input, i));
    }
}

std::optional<EditInfo> SevenSegDecoderElm::getChipEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Segments", 0, -1, -1);
        ei.choice.emplace();
        ei.choice->add("7 Segment");
        ei.choice->add("14 Segment");
        ei.choice->add("16 Segment");
        ei.choice->select(segmentType);
        return ei.setStructural();
    }
    if (n == 1)
        return EditInfo::createCheckbox("Blank Pin", hasBlank()).setStructural();
    if (n == 2)
        return EditInfo::createCheckbox("Blank on 1111", blankOnF());
    if (n == 3 && getSegmentCount() == 7)
        return EditInfo::createCheckbox("'148 Font", use148Font());
    return ChipElm::getChipEditInfo(n);
}

void SevenSegDecoderElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        segmentType = ei.choice->getSelectedIndex();
        setupPins();
        setPoints();
        return;
    }
    if (n == 1) {
        flags = ei.changeFlag(flags, FLAG_ENABLE);
        setupPins();
        setPoints();
        return;
    }
    if (n == 2)
        flags = ei.changeFlag(flags, FLAG_BLANK_F);
    if (n == 3)
        flags = ei.changeFlag(flags, FLAG_148_FONT);
    ChipElm::setChipEditValue(n, ei);
}
