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

#include "TestPointElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

TestPointElm::TestPointElm(int xx, int yy) : CircuitElm(xx, yy) {
    meter = TP_VOL;
    label = "TP";
}

TestPointElm::TestPointElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    meter = parseIntStrict(st.nextToken());
    if ((flags & FLAG_LABEL) != 0)
        label = CustomLogicModel::unescape(st.nextToken());
    else
        label = "TP";
}

void TestPointElm::reset() {
    CircuitElm::reset();
    zerocount = 0;
    rmsV = total = count = 0;
    avgV = totalV = 0;
    maxV = lastMaxV = 0;
    minV = lastMinV = 0;
    binaryLevel = 0;
    period = pulseWidth = dutyCycle = 0;
    selectedValue = 0;
    periodStart = periodLength = pulseStart = 0;
    increasingV = true;
    decreasingV = true;
    started = false;
    lastStepCount = 0;
}

void TestPointElm::setPoints() {
    CircuitElm::setPoints();
    lead1 = Point();
}

void TestPointElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "me", meter);
    if (label != "TP")
        CircuitXMLSerializer::dumpAttr(elem, "lb", label);
}

void TestPointElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    meter = xml.parseIntAttr("me", meter);
    label = xml.parseStringAttr("lb", std::string("TP")).value_or("TP");
}

std::string TestPointElm::getMeter() {
    switch (meter) {
    case TP_VOL: return "V";
    case TP_RMS: return "V(rms)";
    case TP_AVG: return "V(avg)";
    case TP_MAX: return "Vmax";
    case TP_MIN: return "Vmin";
    case TP_P2P: return "Peak to peak";
    case TP_BIN: return "Binary";
    case TP_FRQ: return "Frequency";
    case TP_PER: return "Period";
    case TP_PWI: return "Pulse width";
    case TP_DUT: return "Duty cycle";
    }
    return "";
}

void TestPointElm::drawText(Graphics &g, const std::string &str, const std::string &str2, const Point &pt1,
                            const Point &pt2) {
    double w1 = std::floor(g.measureWidth(str));
    double w2 = std::floor(g.measureWidth(str2));
    const int spacing = 14;
    double wmax = std::max(w1, w2);
    double h = std::floor(g.currentFontSize);
    g.save();
    g.setTextBaseline(Graphics::BASELINE_MIDDLE);
    double x = pt2.x, y = pt2.y;
    if (pt1.y != pt2.y) {
        x -= wmax / 2;
        y += sign(pt2.y - pt1.y) * h;
        if (pt2.y < pt1.y)
            y -= spacing - 4;
    } else {
        if (pt2.x > pt1.x)
            x += 4;
        else
            x -= 4 + wmax;
    }
    g.drawString(str, x + (wmax - w1) / 2, y);
    g.drawString(str2, x + (wmax - w2) / 2, y + spacing);
    adjustBbox(x, y - h / 2, x + wmax, y + spacing + h / 2);
    g.restore();
}

void TestPointElm::draw(Graphics &g) {
    g.save();
    bool sel = needsHighlight();
    g.setFont(Font("SansSerif", sel ? Font::BOLD : 0, 14));
    g.setColor(sel ? selectColor : whiteColor);

    std::string s = label;
    interpPoint(point1, point2, lead1,
        1 - (std::floor(g.measureWidth("TP")) / 2 + 8) / dn);
    setBbox(point1, lead1, 0);

    switch (meter) {
    case TP_VOL: s = getUnitText(nodes[0]->v, "V"); break;
    case TP_RMS: s = getUnitText(rmsV, "V(rms)"); break;
    case TP_AVG: s = getUnitText(avgV, "V(avg)"); break;
    case TP_MAX: s = getUnitText(lastMaxV, "Vpk"); break;
    case TP_MIN: s = getUnitText(lastMinV, "Vmin"); break;
    case TP_P2P: s = getUnitText(lastMaxV - lastMinV, "Vp2p"); break;
    case TP_BIN: s = std::to_string(binaryLevel); break;
    case TP_FRQ: s = getUnitText(frequency, "Hz"); break;
    case TP_PER: break;
    case TP_PWI: s = getUnitText(pulseWidth, "s"); break;
    case TP_DUT: s = showFormat.format(dutyCycle); break;
    }
    drawText(g, label, s, point1, lead1);

    setVoltageColor(g, nodes[0]->v);
    if (sel)
        g.setColor(selectColor);
    drawThickLine(g, point1, lead1);
    drawPosts(g);
    g.restore();
}

void TestPointElm::stepFinished() {
    if (sim->timeStepCount == lastStepCount)
        return;
    lastStepCount = sim->timeStepCount;
    count++;
    total += nodes[0]->v * nodes[0]->v;
    totalV += nodes[0]->v;

    // binary threshold is a fixed 2.5V (assumes ~5V logic levels); not scaled to the circuit's actual voltage range
    if (nodes[0]->v < 2.5)
        binaryLevel = 0;
    else
        binaryLevel = 1;

    if (!started) {
        // prime max/min tracking with the first sample instead of the stale defaults (0, increasingV==decreasingV==true),
        // which could otherwise register a bogus transition on the first step
        started = true;
        maxV = minV = nodes[0]->v;
        increasingV = true;
        decreasingV = false;
        periodStart = pulseStart = sim->t;
    }

    if (nodes[0]->v > maxV && increasingV) {
        maxV = nodes[0]->v;
        increasingV = true;
        decreasingV = false;
    }
    if (nodes[0]->v < maxV && increasingV) {
        lastMaxV = maxV;
        periodLength = sim->t - periodStart;
        periodStart = sim->t;
        period = periodLength;
        pulseWidth = sim->t - pulseStart;
        dutyCycle = pulseWidth / periodLength;
        minV = nodes[0]->v;
        increasingV = false;
        decreasingV = true;

        total = total / count;
        rmsV = std::sqrt(total);
        if (std::isnan(rmsV))
            rmsV = 0;
        avgV = totalV / count;
        if (std::isnan(avgV))
            avgV = 0;
        count = 0;
        total = 0;
        totalV = 0;
    }
    if (nodes[0]->v < minV && decreasingV) {
        minV = nodes[0]->v;
        increasingV = false;
        decreasingV = true;
    }
    if (nodes[0]->v > minV && decreasingV) {
        lastMinV = minV;
        pulseStart = sim->t;
        maxV = nodes[0]->v;
        increasingV = true;
        decreasingV = false;

        total = total / count;
        rmsV = std::sqrt(total);
        if (std::isnan(rmsV))
            rmsV = 0;
        avgV = totalV / count;
        if (std::isnan(avgV))
            avgV = 0;
        count = 0;
        total = 0;
        totalV = 0;
    }
    if (nodes[0]->v == 0) {
        zerocount++;
        if (zerocount > 5) {
            total = 0;
            rmsV = 0;
            avgV = 0;
            maxV = 0;
            minV = 0;
        }
    } else {
        zerocount = 0;
    }
    switch (meter) {
    case TP_VOL: selectedValue = nodes[0]->v; break;
    case TP_RMS: selectedValue = rmsV; break;
    case TP_AVG: selectedValue = avgV; break;
    case TP_MAX: selectedValue = lastMaxV; break;
    case TP_MIN: selectedValue = lastMinV; break;
    case TP_P2P: selectedValue = lastMaxV - lastMinV; break;
    case TP_BIN: selectedValue = binaryLevel; break;
    case TP_FRQ: selectedValue = frequency; break;
    case TP_PER: selectedValue = period; break;
    case TP_PWI: selectedValue = pulseWidth; break;
    case TP_DUT: selectedValue = dutyCycle; break;
    }
}

void TestPointElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "Test Point";
    size_t i = 1;
    auto add = [&](int m) {
        if (i < arr.size())
            arr[i++] = getMeterLine(m);
    };
    add(meter);
    // show the rest of the already-tracked values too, skipping whichever one is selected above.
    // frequency is left out here because it isn't actually computed anywhere (see getMeterLine);
    // binary value is left out to make room for average, since arr[] only has room for 10 entries total
    if (meter != TP_VOL) add(TP_VOL);
    if (meter != TP_MAX) add(TP_MAX);
    if (meter != TP_MIN) add(TP_MIN);
    if (meter != TP_RMS) add(TP_RMS);
    if (meter != TP_AVG) add(TP_AVG);
    if (meter != TP_P2P) add(TP_P2P);
    if (meter != TP_PER) add(TP_PER);
    if (meter != TP_PWI) add(TP_PWI);
    if (meter != TP_DUT) add(TP_DUT);
}

std::string TestPointElm::getMeterLine(int m) {
    switch (m) {
    case TP_VOL: return "V = " + getUnitText(nodes[0]->v, "V");
    case TP_RMS: return "V(rms) = " + getUnitText(rmsV, "V");
    case TP_AVG: return "V(avg) = " + getUnitText(avgV, "V");
    case TP_MAX: return "Vmax = " + getUnitText(lastMaxV, "Vpk");
    case TP_MIN: return "Vmin = " + getUnitText(lastMinV, "Vmin");
    case TP_P2P: return "Vp2p = " + getUnitText(lastMaxV - lastMinV, "Vp2p");
    case TP_BIN: return "Binary:" + std::to_string(binaryLevel);
    case TP_FRQ: return "Freq = " + getUnitText(frequency, "Hz");
    case TP_PER: return "Period = " + getUnitText(period, "s");
    case TP_PWI: return "Pulse width = " + getUnitText(pulseWidth, "s");
    case TP_DUT: return "Duty cycle = " + showFormat.format(dutyCycle);
    }
    return "";
}

std::optional<EditInfo> TestPointElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Value", selectedValue, -1, -1);
        ei.choice = Choice();
        ei.choice->add("Voltage");
        ei.choice->add("RMS Voltage");
        ei.choice->add("Average Voltage");
        ei.choice->add("Max Voltage");
        ei.choice->add("Min Voltage");
        ei.choice->add("P2P Voltage");
        ei.choice->add("Binary Value");
        // TP_AVG's value isn't contiguous with the other meter constants shown here (it was
        // appended after TP_DUT to avoid renumbering saved circuits), so map it explicitly.
        ei.choice->select(meterChoiceIndex(meter));
        return ei;
    }
    if (n == 1) {
        EditInfo ei("Label", 0, -1, -1);
        ei.text = label;
        return ei;
    }
    return std::nullopt;
}

std::vector<int> TestPointElm::meterChoices() {
    return {TP_VOL, TP_RMS, TP_AVG, TP_MAX, TP_MIN, TP_P2P, TP_BIN};
}

int TestPointElm::meterChoiceIndex(int m) {
    std::vector<int> choices = meterChoices();
    for (size_t i = 0; i != choices.size(); i++)
        if (choices[i] == m)
            return (int) i;
    return 0;
}

void TestPointElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        meter = meterChoices()[ei.choice->getSelectedIndex()];
    if (n == 1)
        label = ei.textf ? ei.textf->value : ei.text.value_or("TP");
}
