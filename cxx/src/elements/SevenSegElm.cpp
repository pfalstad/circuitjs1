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

#include "SevenSegElm.h"

#include "../core/StringTokenizer.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/DiodeModel.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"

void SevenSegElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    setDefaults();
    if (st != nullptr) {
        try {
            baseSegmentCount = parseIntStrict(st->nextToken());
            extraSegment = parseIntStrict(st->nextToken());
            diodeDirection = parseIntStrict(st->nextToken());
        } catch (...) {}
    }
    setPinCount();
}

void SevenSegElm::setDefaults() {
    baseSegmentCount = segmentCount = 7;
    diodeDirection = 0;
}

void SevenSegElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ba", baseSegmentCount);
    CircuitXMLSerializer::dumpAttr(elem, "ex", extraSegment);
    CircuitXMLSerializer::dumpAttr(elem, "di", diodeDirection);
}

void SevenSegElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    baseSegmentCount = xml.parseIntAttr("ba", baseSegmentCount);
    extraSegment = xml.parseIntAttr("ex", extraSegment);
    diodeDirection = xml.parseIntAttr("di", diodeDirection);
    setPinCount();
}

void SevenSegElm::setupPins() {
    if (!pinCount)
        return;
    darkred = Color(30, 0, 0);
    lightgray = Color(255 - 10, 255 - 10, 255 - 10);
    bits = segmentCount;
    if (useBus()) {
        sizeX = (baseSegmentCount == 7) ? 4 : 5;
        sizeY = (baseSegmentCount == 7) ? 4 : 6;
        pins.assign(pinCount, Pin());
        makeBitPins(segmentCount, 0, SIDE_W, 0, "I", false, false, false);
        if (commonPin > 0)
            pins[commonPin] = Pin(this, 1, SIDE_W, (diodeDirection == 1) ? "gnd" : "Vcc");
    } else {
        int segmentPinsOnLeftSide = (baseSegmentCount + 1) / 2;
        sizeY = segmentPinsOnLeftSide;
        if (baseSegmentCount == 7) {
            sizeX = 4;
            if (pinCount > 7)
                sizeX = 5;
        } else
            sizeX = 5;
        // make room for common/dp/colon pins
        if (pinCount > sizeY * 2)
            sizeY++;
        pins.assign(pinCount, Pin());
        int i;
        for (i = 0; i != segmentPinsOnLeftSide; i++)
            pins[i] = Pin(this, i, SIDE_W, std::string(1, (char) ('a' + i)));
        // retain backward compatibility pin layout for old 7-segment setup, otherwise put pins on left and right side
        bool backwardCompatibility = (segmentCount == 7 && diodeDirection == 0 && extraSegment == ES_NONE);
        int s = backwardCompatibility ? 1 : 0;
        for (; i != segmentCount; i++)
            pins[i] = Pin(this, s++, backwardCompatibility ? SIDE_S : SIDE_E, std::string(1, (char) ('a' + i)));
        if (extraSegment == ES_DP)
            pins[segmentCount - 1].text = "dp";
        if (commonPin > 0) {
            int side = SIDE_E;
            if (segmentCount != 7) {
                side = SIDE_W;
                s = segmentPinsOnLeftSide;
            }
            pins[commonPin] = Pin(this, s++, side, (diodeDirection == 1) ? "gnd" : "Vcc");
        }
    }
}

void SevenSegElm::drawSegment(Graphics &g, const Point &p1, const Point &p2, double thick) {
    g.beginPath();
    Point p3, p4, p5, p6;
    // (Math.hypot; drawing only, so it need not match V8 to the last bit)
    double dn = std::hypot(p1.x - p2.x, p1.y - p2.y);
    // from p1 to p2, calculate points several pixels from each end, offset from center of line on both sides
    interpPoint2(p1, p2, p3, p4, thick / dn, thick);
    interpPoint2(p1, p2, p5, p6, 1 - thick / dn, thick);
    g.moveTo(p1.x, p1.y);
    g.lineTo(p3.x, p3.y);
    g.lineTo(p5.x, p5.y);
    g.lineTo(p2.x, p2.y);
    g.lineTo(p6.x, p6.y);
    g.lineTo(p4.x, p4.y);
    g.lineTo(p1.x, p1.y);
    g.fill();
}

void SevenSegElm::drawDecimal(Graphics &g, double x, double y, double sp) {
    g.beginPath();
    g.moveTo(x, y - sp);
    g.lineTo(x - sp, y);
    g.lineTo(x, y + sp);
    g.lineTo(x + sp, y);
    g.lineTo(x, y - sp);
    g.fill();
}

const int SevenSegElm::display7[] = {
    // x1, y1, x2, y2 for each segment
    0, 0, 2, 0,
    2, 0, 2, 1,
    2, 1, 2, 2,
    0, 2, 2, 2,
    0, 1, 0, 2,
    0, 0, 0, 1,
    0, 1, 2, 1
};

const int SevenSegElm::display16[] = {
    0, 0, 1, 0,
    1, 0, 2, 0,
    2, 0, 2, 1,
    2, 1, 2, 2,
    2, 2, 1, 2,
    1, 2, 0, 2,
    0, 2, 0, 1,
    0, 1, 0, 0,
    0, 0, 1, 1,
    1, 0, 1, 1,
    2, 0, 1, 1,
    1, 1, 2, 1,
    1, 1, 2, 2,
    1, 1, 1, 2,
    1, 1, 0, 2,
    0, 1, 1, 1
};

const int SevenSegElm::display14[] = {
    0, 0, 2, 0,
    2, 0, 2, 1,
    2, 1, 2, 2,
    2, 2, 0, 2,
    0, 2, 0, 1,
    0, 1, 0, 0,
    0, 0, 1, 1,
    1, 0, 1, 1,
    2, 0, 1, 1,
    1, 1, 2, 1,
    1, 1, 2, 2,
    1, 1, 1, 2,
    1, 1, 0, 2,
    0, 1, 1, 1
};

void SevenSegElm::stamp() {
    ChipElm::stamp();
    if (diodeDirection == 0)
        return;
    DiodeModel *model = DiodeModel::getModelWithName("default-led");
    diodes.clear();
    diodes.reserve(segmentCount);
    for (int i = 0; i != segmentCount; i++) {
        diodes.emplace_back(sim);
        diodes[i].setup(model);
        if (diodeDirection == 1)
            diodes[i].stamp(nodes[i], nodes[commonPin]);
        else
            diodes[i].stamp(nodes[commonPin], nodes[i]);
    }
}

void SevenSegElm::doStep() {
    ChipElm::doStep();
    if (diodeDirection == 0)
        return;
    for (int i = 0; i != segmentCount; i++)
        diodes[i].doStep(diodeDirection * (nodes[i]->v - nodes[commonPin]->v));
}

void SevenSegElm::draw(Graphics &g) {
    drawChip(g);
    g.setColor(Color::red);
    int spx = cspc * 2;
    // make room for dp/colon
    if (extraSegment != ES_NONE)
        spx = (int) std::trunc(spx * .9);
    if (sizeY <= 4 || isFlippedXY())
        spx = spx / 2;
    int spy = spx * 2;
    int xl = x + cspc + flippedSizeX * cspc - spx;
    int yl = y - cspc + flippedSizeY * cspc - spy;
    if (sizeY <= 4 && (flags & (FLAG_FLIP_Y | FLAG_FLIP_XY)) != 0)
        yl += 10;
    const int *disp = (baseSegmentCount == 7) ? display7 : (baseSegmentCount == 14) ? display14 : display16;
    int thick = (sizeY <= 4) ? 5 : spx / 6;
    int dpsize = (sizeY <= 4) ? 7 : isFlippedXY() ? 3 : 7;
    for (int step = 0; step != 2; step++)
        for (int i = 0; i != segmentCount; i++) {
            int i4 = i * 4;
            // draw diagonal lines in first pass, so the other lines overlap
            bool diag = (disp[i4] != disp[i4 + 2] && disp[i4 + 1] != disp[i4 + 3]);
            if (diag != (step == 0))
                continue;
            setColor(g, i);
            drawSegment(g, Point(xl + disp[i4] * spx, yl + disp[i4 + 1] * spy),
                        Point(xl + disp[i4 + 2] * spx, yl + disp[i4 + 3] * spy), thick);
        }
    if (extraSegment == ES_DP) {
        setColor(g, baseSegmentCount);
        double dist = std::max(spx * 1.5, spx + 12.0);
        drawDecimal(g, xl + spx + dist, yl + spy * 2, dpsize);
    }
    if (extraSegment == ES_COLON) {
        setColor(g, baseSegmentCount);
        double dist = std::max(spx * 1.5, spx + 14.0);
        drawDecimal(g, xl + spx + dist, yl + spy * .5, dpsize);
        drawDecimal(g, xl + spx + dist, yl + spy * 1.5, dpsize);
    }
}

void SevenSegElm::calculateCurrent() {
    if (diodeDirection == 0 || diodes.empty()) {
        // no current
        for (int i = 0; i != pinCount; i++)
            pins[i].current = 0;
        return;
    }
    // calculate diode currents
    pins[commonPin].current = 0;
    for (int i = 0; i != segmentCount; i++) {
        pins[i].current = -diodeDirection * diodes[i].calculateCurrent(diodeDirection * (nodes[i]->v - nodes[commonPin]->v));
        pins[commonPin].current -= pins[i].current;
    }
}

void SevenSegElm::stepFinished() {
    // stop for huge currents that make simulator act weird
    if (commonPin > 0 && std::abs(pins[commonPin].current) > 1e12)
        sim->stop("max current exceeded", this);
}

void SevenSegElm::setColor(Graphics &g, int p) {
    bool whiteBkg = app->isPrintable();
    if (diodeDirection == 0) {
        g.setColor(pins[p].value ? Color::red : whiteBkg ? lightgray : darkred);
        return;
    }
    // 10mA current = max brightness
    double w = -diodeDirection * pins[p].current / .01;
    if (w > 0)
        w = 255 * (1 + .2 * jsmath::log(w));
    if (w > 255)
        w = 255;
    double minw = whiteBkg ? 5 : 30;
    if (w < minw)
        w = minw;
    int wi = (int) std::trunc(w);
    g.setColor(whiteBkg ? Color(255, 255 - wi, 255 - wi) : Color(wi, 0, 0));
}

std::optional<EditInfo> SevenSegElm::getChipEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Segments", 0, -1, -1);
        ei.choice.emplace();
        ei.choice->add("7 Segment");
        ei.choice->add("14 Segment");
        ei.choice->add("16 Segment");
        ei.choice->select(baseSegmentCount == 7 ? 0 : baseSegmentCount == 14 ? 1 : 2);
        return ei;
    }
    if (n == 1) {
        EditInfo ei("Extra Segment", 0, -1, -1);
        ei.choice.emplace();
        ei.choice->add("None");
        ei.choice->add("Decimal Point");
        ei.choice->add("Colon");
        ei.choice->select(extraSegment);
        return ei;
    }
    if (n == 2) {
        EditInfo ei("Diodes", 0, -1, -1);
        ei.choice.emplace();
        ei.choice->add("Common Cathode");
        ei.choice->add("Common Anode");
        ei.choice->add("None (logic inputs)");
        ei.choice->select(diodeDirection == 1 ? 0 : diodeDirection == -1 ? 1 : 2);
        return ei;
    }
    return ChipElm::getChipEditInfo(n);
}

void SevenSegElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        int ix = ei.choice->getSelectedIndex();
        baseSegmentCount = (ix == 0) ? 7 : (ix == 1) ? 14 : 16;
        setPinCount();
        return;
    }
    if (n == 1) {
        extraSegment = ei.choice->getSelectedIndex();
        setPinCount();
        return;
    }
    if (n == 2) {
        int ix = ei.choice->getSelectedIndex();
        diodeDirection = (ix == 0) ? 1 : (ix == 1) ? -1 : 0;
        setPinCount();
        return;
    }
    ChipElm::setChipEditValue(n, ei);
}

void SevenSegElm::setPinCount() {
    segmentCount = baseSegmentCount;
    if (extraSegment > 0)
        segmentCount++;
    if (diodeDirection == 0) {
        pinCount = segmentCount;
        commonPin = -1;
    } else {
        pinCount = segmentCount + 1;
        commonPin = pinCount - 1;
    }
    allocNodes();
    setupPins();
    setPoints();
}
