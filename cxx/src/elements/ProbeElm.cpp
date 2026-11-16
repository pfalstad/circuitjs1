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

#include "ProbeElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"

ProbeElm::ProbeElm(int xx, int yy) : CircuitElm(xx, yy) {
    meter = TP_VOL;
    flags = FLAG_SHOWVOLTAGE | FLAG_CIRCLE;
    scale = SCALE_AUTO;
    resistance = 1e7;
}

ProbeElm::ProbeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CircuitElm(xa, ya, xb, yb, f) {
    meter = TP_VOL;
    scale = SCALE_AUTO;
    resistance = 0;
    try {
        meter = parseIntStrict(st.nextToken());
        scale = parseIntStrict(st.nextToken());
        resistance = parseFloatStrict(st.nextToken());
    } catch (...) {}
}

void ProbeElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "me", meter);
    CircuitXMLSerializer::dumpAttr(elem, "sc", scale);
    CircuitXMLSerializer::dumpAttr(elem, "re", resistance);
    if (!label.empty())
        CircuitXMLSerializer::dumpAttr(elem, "lb", label);
}

void ProbeElm::undumpXml(CircuitXMLDeserializer &xml) {
    flags = 0;
    CircuitElm::undumpXml(xml);
    meter = xml.parseIntAttr("me", meter);
    scale = xml.parseIntAttr("sc", scale);
    resistance = xml.parseDoubleAttr("re", 0);
    label = xml.parseStringAttr("lb", std::string()).value_or("");
}

void ProbeElm::setPoints() {
    CircuitElm::setPoints();
    center = interpPoint(point1, point2, .5);
}

void ProbeElm::reset() {
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

std::string ProbeElm::getMeter() {
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

void ProbeElm::draw(Graphics &g) {
    g.save();
    const std::string *role = app->getScopePlotRole(this);
    bool showCircle = drawAsCircle() && (role == nullptr || role->empty());
    int hs = showCircle ? circleSize : 8;
    setBbox(point1, point2, hs);
    bool selected = needsHighlight();
    double len = (selected || isCreating() || mustShowVoltage()) ? 16 : dn - 32;
    if (showCircle)
        len = circleSize * 2;
    calcLeads((int) len);
    setVoltageColor(g, nodes[0]->v);
    if (selected)
        g.setColor(selectColor);
    drawThickLine(g, point1, lead1);
    setVoltageColor(g, nodes[1]->v);
    if (selected)
        g.setColor(selectColor);
    drawThickLine(g, lead2, point2);
    Font f("SansSerif", Font::BOLD, 14);
    g.setFont(f);
    if (role != nullptr && !role->empty())
        drawCenteredText(g, *role, center.x, center.y, true);
    int hsv = showCircle ? circleSize + 3 : 4;
    if (mustShowVoltage()) {
        std::string s;
        switch (meter) {
        case TP_VOL: s = getUnitTextWithScale(getVoltageDiff(), "V", scale); break;
        case TP_RMS: s = getUnitTextWithScale(rmsV, "V(rms)", scale); break;
        case TP_AVG: s = getUnitTextWithScale(avgV, "V(avg)", scale); break;
        case TP_MAX: s = getUnitTextWithScale(lastMaxV, "Vpk", scale); break;
        case TP_MIN: s = getUnitTextWithScale(lastMinV, "Vmin", scale); break;
        case TP_P2P: s = getUnitTextWithScale(lastMaxV - lastMinV, "Vp2p", scale); break;
        case TP_BIN: s = jsNumberToString(binaryLevel); break;
        case TP_FRQ: s = getUnitText(frequency, "Hz"); break;
        case TP_PER: break;
        case TP_PWI: s = getUnitText(pulseWidth, "s"); break;
        case TP_DUT: s = showFormat.format(dutyCycle); break;
        }
        if (!label.empty())
            s = label + " " + s;
        drawValues(g, s, hsv);
    } else if (!label.empty())
        drawValues(g, label, hsv);
    g.setColor(whiteColor);
    g.setFont(unitsFont);
    Point plusPoint = interpPoint(point1, point2, (dn / 2 - len / 2 - 4) / dn, -10 * dsign);
    if (y2 > y)
        plusPoint.y += 4;
    if (y > y2)
        plusPoint.y += 3;
    double w = g.measureWidth("+");
    g.drawString("+", plusPoint.x - w / 2, plusPoint.y);
    if (showCircle) {
        g.setColor(lightGrayColor);
        drawThickCircle(g, center.x, center.y, circleSize);
        drawCenteredText(g, "V", center.x, center.y, true);
    }
    drawPosts(g);
    g.restore();
}

void ProbeElm::stepFinished() {
    if (sim->timeStepCount == lastStepCount)
        return;
    lastStepCount = sim->timeStepCount;
    count++;
    double v = getVoltageDiff();
    total += v * v;
    totalV += v;
    // binary threshold is a fixed 2.5V (assumes ~5V logic levels); not scaled to the circuit's actual voltage range
    binaryLevel = (v < 2.5) ? 0 : 1;
    if (!started) {
        // prime max/min tracking with the first sample instead of the stale defaults (0, increasingV==decreasingV==true),
        // which could otherwise register a bogus transition on the first step
        started = true;
        maxV = minV = v;
        increasingV = true;
        decreasingV = false;
        periodStart = pulseStart = sim->t;
    }
    if (v > maxV && increasingV) {
        maxV = v;
        increasingV = true;
        decreasingV = false;
    }
    if (v < maxV && increasingV) {
        // direction change: was going up, now going down
        lastMaxV = maxV;
        periodLength = sim->t - periodStart;
        periodStart = sim->t;
        period = periodLength;
        pulseWidth = sim->t - pulseStart;
        dutyCycle = pulseWidth / periodLength;
        minV = v;
        increasingV = false;
        decreasingV = true;
        total /= count;
        rmsV = std::sqrt(total);
        if (std::isnan(rmsV)) rmsV = 0;
        avgV = totalV / count;
        if (std::isnan(avgV)) avgV = 0;
        count = 0;
        total = 0;
        totalV = 0;
    }
    if (v < minV && decreasingV) {
        minV = v;
        increasingV = false;
        decreasingV = true;
    }
    if (v > minV && decreasingV) {
        // direction change: was going down, now going up
        lastMinV = minV;
        pulseStart = sim->t;
        maxV = v;
        increasingV = true;
        decreasingV = false;
        total /= count;
        rmsV = std::sqrt(total);
        if (std::isnan(rmsV)) rmsV = 0;
        avgV = totalV / count;
        if (std::isnan(avgV)) avgV = 0;
        count = 0;
        total = 0;
        totalV = 0;
    }
    if (v == 0) {
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
}

void ProbeElm::calculateCurrent() {
    current = (resistance == 0) ? 0 : (nodes[0]->v - nodes[1]->v) / resistance;
}

void ProbeElm::stamp() {
    if (resistance != 0)
        sim->stampResistor(nodes[0], nodes[1], resistance);
}

void ProbeElm::getInfo(std::vector<std::string> &arr) {
    arr.clear();
    arr.push_back("voltmeter");
    arr.push_back(getMeterLine(meter));
    // show the rest of the already-tracked values too, skipping whichever one is selected above.
    // frequency is left out here because it is not actually computed anywhere (see getMeterLine);
    // binary value is left out to make room for average, since arr[] only has room for 10 entries total
    for (int m : {TP_VOL, TP_MAX, TP_MIN, TP_RMS, TP_AVG, TP_P2P, TP_PER, TP_PWI, TP_DUT})
        if (meter != m)
            arr.push_back(getMeterLine(m));
}

std::string ProbeElm::getMeterLine(int m) {
    switch (m) {
    case TP_VOL: return "Vd = " + getVoltageText(getVoltageDiff());
    case TP_RMS: return "V(rms) = " + getVoltageText(rmsV);
    case TP_AVG: return "V(avg) = " + getVoltageText(avgV);
    case TP_MAX: return "Vmax = " + getVoltageText(lastMaxV);
    case TP_MIN: return "Vmin = " + getVoltageText(lastMinV);
    case TP_P2P: return "Vp2p = " + getVoltageText(lastMaxV - lastMinV);
    case TP_BIN: return "Binary = " + jsNumberToString(binaryLevel);
    case TP_FRQ: return "Freq = " + getUnitText(frequency, "Hz");
    case TP_PER: return "Period = " + getUnitText(period, "s");
    case TP_PWI: return "Pulse width = " + getUnitText(pulseWidth, "s");
    case TP_DUT: return "Duty cycle = " + showFormat.format(dutyCycle);
    }
    return "";
}

std::optional<EditInfo> ProbeElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Show Value", mustShowVoltage());
    if (n == 1) {
        EditInfo ei("Value", selectedValue, -1, -1);
        ei.choice.emplace();
        ei.choice->add("Voltage");
        ei.choice->add("RMS Voltage");
        ei.choice->add("Average Voltage");
        ei.choice->add("Max Voltage");
        ei.choice->add("Min Voltage");
        ei.choice->add("P2P Voltage");
        ei.choice->add("Binary Value");
        // TP_AVG's value is not contiguous with the other meter constants shown here (it was
        // appended after TP_DUT to avoid renumbering saved circuits), so map it explicitly.
        ei.choice->select(meterChoiceIndex(meter));
        return ei;
    }
    if (n == 2) {
        EditInfo ei("Scale", 0);
        ei.choice.emplace();
        ei.choice->add("Auto");
        ei.choice->add("V");
        ei.choice->add("mV");
        ei.choice->add(Locale::muString + "V");
        ei.choice->select(scale);
        return ei;
    }
    if (n == 3)
        return EditInfo::createCheckbox("Use Circle Symbol", drawAsCircle());
    if (n == 4)
        return EditInfo("Series Resistance (0 = infinite)", resistance);
    if (n == 5) {
        EditInfo ei("Label", 0, -1, -1);
        ei.text = label;
        return ei;
    }
    return std::nullopt;
}

std::vector<int> ProbeElm::meterChoices() {
    return {TP_VOL, TP_RMS, TP_AVG, TP_MAX, TP_MIN, TP_P2P, TP_BIN};
}

int ProbeElm::meterChoiceIndex(int m) {
    std::vector<int> choices = meterChoices();
    for (size_t i = 0; i != choices.size(); i++)
        if (choices[i] == m)
            return (int) i;
    return 0;
}

void ProbeElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.checkbox->getState())
            flags |= FLAG_SHOWVOLTAGE;
        else
            flags &= ~FLAG_SHOWVOLTAGE;
    }
    if (n == 1)
        meter = meterChoices()[ei.choice->getSelectedIndex()];
    if (n == 2)
        scale = ei.choice->getSelectedIndex();
    if (n == 3)
        flags = ei.changeFlag(flags, FLAG_CIRCLE);
    if (n == 4)
        resistance = ei.value;
    if (n == 5)
        label = ei.textf ? ei.textf->value : ei.text.value_or("");
}
