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

#include "VoltageElm.h"

#include <cmath>

#include "../core/JsMath.h"
#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/FindPathInfo.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/WireRouter.h"

VoltageElm::VoltageElm(int xx, int yy, int wf) : CircuitElm(xx, yy) {
    waveform = wf;
    maxVoltage = 5;
    frequency = 60;
    dutyCycle = .5;
    bias = 0;
    phaseShift = 0;
    noiseValue = 0;
    riseTime = 0;
    freqTimeZero = 0;
    flags |= FLAG_SHOW_VOLTAGE;
    reset();
}

VoltageElm::VoltageElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    maxVoltage = 5;
    frequency = 40;
    waveform = WF_DC;
    dutyCycle = .5;
    bias = 0;
    phaseShift = 0;
    noiseValue = 0;
    riseTime = 0;
    freqTimeZero = 0;
    try {
        waveform = parseIntStrict(st.nextToken());
        frequency = parseFloatStrict(st.nextToken());
        maxVoltage = parseFloatStrict(st.nextToken());
        bias = parseFloatStrict(st.nextToken());
        phaseShift = parseFloatStrict(st.nextToken());
        dutyCycle = parseFloatStrict(st.nextToken());
        // don't change this, we don't generate this format anymore, plus VarRailElm adds more stuff here
    } catch (...) {}

    // old circuit files can have negative phase offsets
    phaseShift = positivePhase(phaseShift);
    if ((flags & FLAG_COS) != 0) {
        flags &= ~FLAG_COS;
        phaseShift = pi / 2;
    }
    // old circuit files have the wrong duty cycle for pulse waveforms (wasn't configurable in the past)
    if ((flags & FLAG_PULSE_DUTY) == 0 && waveform == WF_PULSE)
        dutyCycle = defaultPulseDuty;
    reset();
}

// point 2, not point 1, should track the mouse during toolbar drag-and-drop
void VoltageElm::dragPlace(int xa, int ya, bool vertical) {
    CircuitElm::dragPlace(xa, ya, vertical);
    swapDragEndpoints();
}

void VoltageElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "wf", waveform);
    if (waveform != WF_DC)
        CircuitXMLSerializer::dumpAttr(elem, "fr", frequency);
    CircuitXMLSerializer::dumpAttr(elem, "maxv", maxVoltage);
    if (bias != 0)
        CircuitXMLSerializer::dumpAttr(elem, "bias", bias);
    if (phaseShift != 0)
        CircuitXMLSerializer::dumpAttr(elem, "phaseShift", phaseShift);
    if (dutyCycle != .5)
        CircuitXMLSerializer::dumpAttr(elem, "dutyCycle", dutyCycle);
    if (riseTime != 0)
        CircuitXMLSerializer::dumpAttr(elem, "riseTime", riseTime);
    if (internalResistance != 0)
        CircuitXMLSerializer::dumpAttr(elem, "ir", internalResistance);
}

void VoltageElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    waveform = xml.parseIntAttr("wf", waveform);
    frequency = xml.parseDoubleAttr("fr", frequency);
    maxVoltage = xml.parseDoubleAttr("maxv", maxVoltage);
    bias = xml.parseDoubleAttr("bias", bias);
    phaseShift = positivePhase(xml.parseDoubleAttr("phaseShift", phaseShift));
    dutyCycle = xml.parseDoubleAttr("dutyCycle", dutyCycle);
    riseTime = xml.parseDoubleAttr("riseTime", riseTime);
    internalResistance = xml.parseDoubleAttr("ir", 0);
}

// a phase offset from 0 to 2 pi.  the waveforms take the phase mod 2 pi, which would be
// negative early on with a negative offset
double VoltageElm::positivePhase(double p) {
    return std::fmod(std::fmod(p, 2 * pi) + 2 * pi, 2 * pi);
}

void VoltageElm::reset() {
    freqTimeZero = 0;
    curcount = 0;
}

double VoltageElm::triangleFunc(double x) {
    if (x < pi)
        return x * (2 / pi) - 1;
    return 1 - (x - pi) * (2 / pi);
}

void VoltageElm::setVoltageSource(int n, VoltageSource *v) {
    CircuitElm::setVoltageSource(n, v);
    if (internalResistance > 0)
        v->setNodes(nodes[0], nodes[2]);
    else
        v->setNodes(nodes[0], nodes[1]);
}

void VoltageElm::stamp() {
    const NodeRef &vsNode2 = internalResistance > 0 ? nodes[2] : nodes[1];
    if (waveform == WF_DC)
        sim->stampVoltageSource(nodes[0], vsNode2, voltSource, getVoltage());
    else
        sim->stampVoltageSource(nodes[0], vsNode2, voltSource);
    if (internalResistance > 0)
        sim->stampResistor(nodes[2], nodes[1], internalResistance);
}

void VoltageElm::doStep() {
    const NodeRef &vsNode2 = internalResistance > 0 ? nodes[2] : nodes[1];
    if (waveform != WF_DC)
        sim->updateVoltageSource(nodes[0], vsNode2, voltSource, getVoltage());
}

void VoltageElm::stepFinished() {
    if (waveform == WF_NOISE)
        noiseValue = (app->randomDouble() * 2 - 1) * maxVoltage + bias;
}

double VoltageElm::getVoltage() {
    if (waveform != WF_DC && doDcAnalysis())
        return bias;
    double w = 2 * pi * (sim->t - freqTimeZero) * frequency + phaseShift;
    switch (waveform) {
    case WF_DC: return maxVoltage + bias;
    case WF_AC: return jsmath::sin(w) * maxVoltage + bias;
    case WF_SQUARE: {
        double wm = std::fmod(w, 2 * pi);
        double dutyPhase = 2 * pi * dutyCycle;
        if (riseTime > 0) {
            double risePhase = riseTime * frequency * 2 * pi;
            double halfRise = risePhase / 2;
            // rising edge centered at phase 0 (wraps around cycle boundary)
            if (wm < halfRise) {
                double t = (wm + halfRise) / risePhase;
                return bias + maxVoltage * (2 * t - 1);
            }
            // high plateau
            else if (wm < dutyPhase - halfRise)
                return bias + maxVoltage;
            // falling edge centered at dutyPhase
            else if (wm < dutyPhase + halfRise) {
                double t = (wm - dutyPhase + halfRise) / risePhase;
                return bias + maxVoltage * (1 - 2 * t);
            }
            // low plateau
            else if (wm < 2 * pi - halfRise)
                return bias - maxVoltage;
            // rising edge wrapping around end of cycle
            else {
                double t = (wm - (2 * pi - halfRise)) / risePhase;
                return bias + maxVoltage * (2 * t - 1);
            }
        }
        return bias + ((wm > dutyPhase) ? -maxVoltage : maxVoltage);
    }
    case WF_TRIANGLE:
        return bias + triangleFunc(std::fmod(w, 2 * pi)) * maxVoltage;
    case WF_SAWTOOTH:
        return bias + std::fmod(w, 2 * pi) * (maxVoltage / pi) - maxVoltage;
    case WF_PULSE: {
        double wm = std::fmod(w, 2 * pi);
        double dutyPhase = 2 * pi * dutyCycle;
        if (riseTime > 0) {
            double risePhase = riseTime * frequency * 2 * pi;
            double halfRise = risePhase / 2;
            // rising edge centered at phase 0 (wraps around cycle boundary)
            if (wm < halfRise) {
                double t = (wm + halfRise) / risePhase;
                return bias + maxVoltage * t;
            }
            // high plateau
            else if (wm < dutyPhase - halfRise)
                return bias + maxVoltage;
            // falling edge centered at dutyPhase
            else if (wm < dutyPhase + halfRise) {
                double t = (wm - dutyPhase + halfRise) / risePhase;
                return bias + maxVoltage * (1 - t);
            }
            // low for the rest of the cycle
            else if (wm < 2 * pi - halfRise)
                return bias;
            // rising edge wrapping around end of cycle
            else {
                double t = (wm - (2 * pi - halfRise)) / risePhase;
                return bias + maxVoltage * t;
            }
        }
        return (wm < dutyPhase) ? maxVoltage + bias : bias;
    }
    case WF_NOISE:
        return noiseValue;
    default:
        return 0;
    }
}

void VoltageElm::setPoints() {
    CircuitElm::setPoints();
    if (waveform == WF_DC && (flags & FLAG_CIRCLE_SYMBOL) != 0)
        calcLeads(circleSize * 2);
    else
        calcLeads((waveform == WF_DC || waveform == WF_VAR) ? 8 : circleSize * 2);
}

// return the RMS-to-peak multiplier for the current waveform.
// RMS = amplitude * getRmsMultiplier(), so multiplier = 1/sqrt(2) for sine, etc.
double VoltageElm::getRmsMultiplier() {
    switch (waveform) {
    case WF_DC: return 1;
    case WF_AC: return 1 / std::sqrt(2);        // sine: Vpk/sqrt(2)
    case WF_SQUARE: return 1;                    // square swings +A/-A, RMS=A
    case WF_TRIANGLE: return 1 / std::sqrt(3);  // triangle: Vpk/sqrt(3)
    case WF_SAWTOOTH: return 1 / std::sqrt(3);  // sawtooth: Vpk/sqrt(3)
    case WF_PULSE: return std::sqrt(dutyCycle);  // pulse: Vpk*sqrt(d)
    default: return 1;
    }
}

void VoltageElm::setFrequency(double newFreq, bool continuous) {
    double oldfreq = frequency;
    frequency = newFreq;
    double maxfreq = 1 / (8 * sim->maxTimeStep);
    if (frequency > maxfreq) {
        if (app->confirm(Locale::LS("Adjust timestep to allow for higher frequencies?")))
            sim->maxTimeStep = 1 / (32 * frequency);
        else
            frequency = maxfreq;
    }
    freqTimeZero = (!continuous || frequency == 0) ? 0 : sim->t - oldfreq * (sim->t - freqTimeZero) / frequency;
}

bool VoltageElm::validate() {
    if (internalResistance > 0)
        return true;
    if (getPostCount() == 2) {
        FindPathInfo fpi(FindPathInfo::VOLTAGE, this, getNode(1), sim);
        if (fpi.findPath(getNode(0))) {
            internalResistance = .001;
            return false;
        }
    }
    return true;
}

void VoltageElm::draw(Graphics &g) {
    setBbox(x, y, x2, y2);
    draw2Leads(g);
    if (waveform == WF_DC && (flags & FLAG_CIRCLE_SYMBOL) != 0) {
        setBbox(point1, point2, circleSize);
        interpPoint(lead1, lead2, ps1, .5);
        int xc = ps1.x, yc = ps1.y;
        g.setColor(needsHighlight() ? selectColor : Color::gray);
        setPowerColor(g, false);
        drawThickCircle(g, xc, yc, circleSize);
        adjustBbox(xc - circleSize, yc - circleSize, xc + circleSize, yc + circleSize);
        // draw + and - signs inside the circle
        const int signSize = 4;
        const double plusPos = 0.74;
        const double minusPos = 0.26;
        // + sign: perpendicular bar
        interpPoint2(lead1, lead2, ps1, ps2, plusPos, signSize);
        drawThickLine(g, ps1, ps2);
        // + sign: along-axis bar
        double delta = signSize / (circleSize * 2.0);
        Point pA = interpPoint(lead1, lead2, plusPos - delta);
        Point pB = interpPoint(lead1, lead2, plusPos + delta);
        drawThickLine(g, pA, pB);
        // - sign: perpendicular bar only
        interpPoint2(lead1, lead2, ps1, ps2, minusPos, signSize);
        drawThickLine(g, ps1, ps2);
    } else if (waveform == WF_DC) {
        setVoltageColor(g, nodes[0]->v);
        setPowerColor(g, false);
        interpPoint2(lead1, lead2, ps1, ps2, 0, 10);
        drawThickLine(g, ps1, ps2);
        setVoltageColor(g, nodes[1]->v);
        setPowerColor(g, false);
        int hs = 16;
        setBbox(point1, point2, hs);
        interpPoint2(lead1, lead2, ps1, ps2, 1, hs);
        drawThickLine(g, ps1, ps2);
    } else {
        setBbox(point1, point2, circleSize);
        interpPoint(lead1, lead2, ps1, .5);
        drawWaveform(g, ps1);
        std::string inds;
        if (bias > 0 || (bias == 0 && waveform == WF_PULSE))
            inds = "+";
        else
            inds = "*";
        g.setColor(whiteColor);
        g.setFont(unitsFont);
        Point plusPoint = interpPoint(point1, point2, (dn / 2 + circleSize + 4) / dn, 10 * dsign);
        plusPoint.y += 4;
        double w = jsmath::round(g.measureWidth(inds));
        g.drawString(inds, plusPoint.x - w / 2, plusPoint.y);
    }
    if (dx == 0 || dy == 0) {
        bool showV = (flags & FLAG_SHOW_VOLTAGE) != 0;
        bool showF = showValues() && waveform != WF_DC && waveform != WF_NOISE;
        std::string s;
        if (showV && showF)
            s = getShortVoltageText() + " " + getShortUnitText(frequency, "Hz");
        else if (showV)
            s = getShortVoltageText();
        else if (showF)
            s = getShortUnitText(frequency, "Hz");
        if (!s.empty()) {
            int hs = (waveform == WF_DC && (flags & FLAG_CIRCLE_SYMBOL) == 0) ? 16 : circleSize;
            drawValues(g, s, hs);
        }
    }
    updateDotCount();
    if (!isCreating()) {
        if (waveform == WF_DC && (flags & FLAG_CIRCLE_SYMBOL) == 0)
            drawDots(g, point1, point2, curcount);
        else {
            drawDots(g, point1, lead1, curcount);
            drawDots(g, point2, lead2, -curcount);
        }
    }
    drawPosts(g);
}

void VoltageElm::drawWaveform(Graphics &g, const Point &center) {
    g.setColor(needsHighlight() ? selectColor : Color::gray);
    setPowerColor(g, false);
    int xc = center.x, yc = center.y;
    if (waveform != WF_NOISE)
        drawThickCircle(g, xc, yc, circleSize);
    const int wl = 8;
    adjustBbox(xc - circleSize, yc - circleSize, xc + circleSize, yc + circleSize);
    switch (waveform) {
    case WF_DC:
        break;
    case WF_SQUARE: {
        int xc2 = (int) jsmath::round(wl * 2 * dutyCycle - wl + xc);
        xc2 = std::max(xc - wl + 3, std::min(xc + wl - 3, xc2));
        drawThickLine(g, xc - wl, yc - wl, xc - wl, yc);
        drawThickLine(g, xc - wl, yc - wl, xc2, yc - wl);
        drawThickLine(g, xc2, yc - wl, xc2, yc + wl);
        drawThickLine(g, xc + wl, yc + wl, xc2, yc + wl);
        drawThickLine(g, xc + wl, yc, xc + wl, yc + wl);
        break;
    }
    case WF_PULSE: {
        int ycp = yc + wl / 2;
        drawThickLine(g, xc - wl, ycp - wl, xc - wl, ycp);
        drawThickLine(g, xc - wl, ycp - wl, xc - wl / 2, ycp - wl);
        drawThickLine(g, xc - wl / 2, ycp - wl, xc - wl / 2, ycp);
        drawThickLine(g, xc - wl / 2, ycp, xc + wl, ycp);
        break;
    }
    case WF_SAWTOOTH:
        drawThickLine(g, xc, yc - wl, xc - wl, yc);
        drawThickLine(g, xc, yc - wl, xc, yc + wl);
        drawThickLine(g, xc, yc + wl, xc + wl, yc);
        break;
    case WF_TRIANGLE: {
        const int xl = 5;
        drawThickLine(g, xc - xl * 2, yc, xc - xl, yc - wl);
        drawThickLine(g, xc - xl, yc - wl, xc, yc);
        drawThickLine(g, xc, yc, xc + xl, yc + wl);
        drawThickLine(g, xc + xl, yc + wl, xc + xl * 2, yc);
        break;
    }
    case WF_NOISE:
        g.setColor(needsHighlight() ? selectColor : whiteColor);
        setPowerColor(g, false);
        drawLabeledNode(g, Locale::LS("Noise"), point1, lead1);
        break;
    case WF_AC: {
        const int xl = 10;
        g.beginPath();
        g.setLineWidth(3.0);
        for (int i = -xl; i <= xl; i++) {
            double yy = yc + jsmath::round(.95 * jsmath::sin(i * pi / xl) * wl);
            if (i == -xl)
                g.moveTo(xc + i, yy);
            else
                g.lineTo(xc + i, yy);
        }
        g.stroke();
        g.setLineWidth(1.0);
        break;
    }
    }
    if (isRailElm() && (dx == 0 || dy == 0)) {
        bool showV = (flags & FLAG_SHOW_VOLTAGE_RAIL) != 0;
        bool showF = showValues() && waveform != WF_NOISE;
        std::string s;
        if (showV && showF)
            s = getShortVoltageText() + " " + getShortUnitText(frequency, "Hz");
        else if (showV)
            s = getShortVoltageText();
        else if (showF)
            s = getShortUnitText(frequency, "Hz");
        if (!s.empty())
            drawValues(g, s, circleSize);
    }
}

bool VoltageElm::useRmsDisplay(double peakValue) {
    double rmsMult = getRmsMultiplier();
    double rmsVal = peakValue * rmsMult;
    return rmsMult != 1 && std::abs(peakValue) > 1e-4 &&
        diffFromInteger(rmsVal * 1e4) < diffFromInteger(peakValue * 1e4);
}

std::string VoltageElm::getShortVoltageText() {
    if (bias != 0)
        return getShortUnitText(bias + maxVoltage, "V");
    if (useRmsDisplay(maxVoltage))
        return getShortUnitText(maxVoltage * getRmsMultiplier(), "V") + "rms";
    return getShortUnitText(maxVoltage, "V");
}

void VoltageElm::getInfo(std::vector<std::string> &arr) {
    switch (waveform) {
    case WF_DC: case WF_VAR: arr[0] = "voltage source"; break;
    case WF_AC: arr[0] = "A/C source"; break;
    case WF_SQUARE: arr[0] = "square wave gen"; break;
    case WF_PULSE: arr[0] = "pulse gen"; break;
    case WF_SAWTOOTH: arr[0] = "sawtooth gen"; break;
    case WF_TRIANGLE: arr[0] = "triangle gen"; break;
    case WF_NOISE: arr[0] = "noise gen"; break;
    }
    arr[1] = "I = " + getCurrentText(getCurrent());
    arr[2] = (isRailElm() ? "V = " : "Vd = ") + getVoltageText(getVoltageDiff());
    int i = 3;
    if (waveform != WF_DC && waveform != WF_VAR && waveform != WF_NOISE) {
        arr[i++] = "f = " + getUnitText(frequency, "Hz");
        arr[i++] = "Vmax = " + getVoltageText(maxVoltage);
        if (bias == 0)
            arr[i++] = "V(rms) = " + getVoltageText(maxVoltage * getRmsMultiplier());
        if (bias != 0)
            arr[i++] = "Voff = " + getVoltageText(bias);
        else if (frequency > 500)
            arr[i++] = "wavelength = " + getUnitText(2.9979e8 / frequency, "m");
    }
    if (waveform == WF_DC && current != 0 && app->showResistanceInVoltageSources)
        arr[i++] = "(R = " + getUnitText(maxVoltage / current, Locale::ohmString) + ")";
    arr[i++] = "P = " + getUnitText(getPower(), "W");
}

void VoltageElm::setFrequencyFromTimes(double highTime, double lowTime, bool continuous) {
    double newFreq = 1 / (highTime + lowTime);
    double newDuty = highTime / (highTime + lowTime);
    setFrequency(newFreq, continuous);
    dutyCycle = newDuty;
}

std::optional<EditInfo> VoltageElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo(waveform == WF_DC ? "Voltage" : "Max Voltage", maxVoltage, -20, 20).setUnitStep();
    if (n == 1) {
        EditInfo ei("Waveform", waveform, -1, -1);
        ei.choice = Choice();
        ei.choice->add("D/C");
        ei.choice->add("A/C");
        ei.choice->add("Square Wave");
        ei.choice->add("Triangle");
        ei.choice->add("Sawtooth");
        ei.choice->add("Pulse");
        ei.choice->add("Noise");
        ei.choice->select(waveform);
        return ei;
    }
    if (n == 2)
        return EditInfo("DC Offset (V)", bias, -20, 20).setUnitStep();
    if (n == 3) {
        EditInfo ei("Internal Resistance (ohms)", internalResistance);
        ei.setNonNegative();
        return ei;
    }
    if (n == 4 && !(isRailElm() && (waveform == WF_DC || waveform == WF_VAR))) {
        EditInfo ei("", 0, -1, -1);
        int svFlag = isRailElm() ? FLAG_SHOW_VOLTAGE_RAIL : FLAG_SHOW_VOLTAGE;
        ei.checkbox = Checkbox("Show Voltage", (flags & svFlag) != 0);
        return ei;
    }
    if (n == 5 && waveform == WF_DC && !isRailElm()) {
        EditInfo ei("", 0, -1, -1);
        ei.checkbox = Checkbox("Circle Symbol", (flags & FLAG_CIRCLE_SYMBOL) != 0);
        return ei;
    }
    int fo = getFrequencyOffset();
    if (waveform == WF_DC || waveform == WF_NOISE)
        return std::nullopt;
    int n2 = n - fo;
    if (hasTimingOptions()) {
        // square/pulse: dropdown + freq-or-time + phase + duty-or-time + rise
        if (n2 == 0) {
            EditInfo ei("Specify As", 0, -1, -1);
            ei.choice = Choice();
            ei.choice->add("Frequency/Duty Cycle");
            ei.choice->add("High Time/Low Time");
            ei.choice->select(timeSpec() ? 1 : 0);
            ei.newColumn = true;
            return ei;
        }
        if (n2 == 1) {
            if (timeSpec())
                return EditInfo("High Time (s)", dutyCycle / frequency, 0, 0);
            return EditInfo("Frequency (Hz)", frequency, 4, 500);
        }
        if (n2 == 2)
            return EditInfo("Phase Offset (degrees)", phaseShift * 180 / pi, -180, 180).setDimensionless();
        if (n2 == 3) {
            if (timeSpec())
                return EditInfo("Low Time (s)", (1 - dutyCycle) / frequency, 0, 0);
            return EditInfo("Duty Cycle", dutyCycle * 100, 0, 100).setDimensionless();
        }
        if (n2 == 4)
            return EditInfo("Rise/Fall Time (s)", riseTime, 0, 0);
    } else {
        // other waveforms: freq + phase only
        if (n2 == 0)
            return EditInfo("Frequency (Hz)", frequency, 4, 500);
        if (n2 == 1)
            return EditInfo("Phase Offset (degrees)", phaseShift * 180 / pi, -180, 180).setDimensionless();
    }
    return std::nullopt;
}

void VoltageElm::setEditValue(int n, EditInfo &ei) {
    // any edit-dialog change makes the waveform phase-coherent with other sources
    if (!ei.continuous)
        freqTimeZero = 0;
    if (n == 0)
        maxVoltage = ei.value;
    if (n == 2)
        bias = ei.value;
    if (n == 3)
        internalResistance = ei.value;
    if (n == 4 && ei.checkbox) {
        int svFlag = isRailElm() ? FLAG_SHOW_VOLTAGE_RAIL : FLAG_SHOW_VOLTAGE;
        flags = ei.changeFlag(flags, svFlag);
    }
    if (n == 5 && waveform == WF_DC && ei.checkbox && !isRailElm()) {
        flags = ei.changeFlag(flags, FLAG_CIRCLE_SYMBOL);
        setPoints();
    }
    if (n == 1) {
        int ow = waveform;
        waveform = ei.choice->getSelectedIndex();
        if (waveform == WF_DC && ow != WF_DC) {
            ei.newDialog = true;
            bias = 0;
        } else if (waveform != ow)
            ei.newDialog = true;
        // change duty cycle if we're changing to or from pulse
        if (waveform == WF_PULSE && ow != WF_PULSE)
            dutyCycle = defaultPulseDuty;
        else if (ow == WF_PULSE && waveform != WF_PULSE)
            dutyCycle = .5;
        setPoints();
    }
    int fo = getFrequencyOffset();
    int n2 = n - fo;
    if (hasTimingOptions()) {
        if (n2 == 0 && ei.choice) {
            int oldFlags = flags;
            flags = (ei.choice->getSelectedIndex() == 1) ? (flags | FLAG_TIME_SPEC) : (flags & ~FLAG_TIME_SPEC);
            if (flags != oldFlags)
                ei.newDialog = true;
        }
        if (n2 == 1) {
            if (timeSpec()) {
                // high time changed; recompute frequency and duty cycle
                double highTime = ei.value;
                double lowTime = (1 - dutyCycle) / frequency;
                if (highTime > 0 && lowTime > 0)
                    setFrequencyFromTimes(highTime, lowTime, ei.continuous);
            } else if (ei.value != 0) {
                setFrequency(ei.value, ei.continuous);
            }
        }
        if (n2 == 2) {
            phaseShift = positivePhase(ei.value * pi / 180);
        }
        if (n2 == 3) {
            if (timeSpec()) {
                // low time changed; recompute frequency and duty cycle
                double highTime = dutyCycle / frequency;
                double lowTime = ei.value;
                if (highTime > 0 && lowTime > 0)
                    setFrequencyFromTimes(highTime, lowTime, ei.continuous);
            } else {
                dutyCycle = ei.value * .01;
            }
        }
        if (n2 == 4)
            riseTime = ei.value;
    } else {
        if (n2 == 0 && waveform != WF_DC && ei.value != 0)
            setFrequency(ei.value, ei.continuous);
        if (n2 == 1) {
            phaseShift = positivePhase(ei.value * pi / 180);
        }
    }
}

void VoltageElm::addRoutingObstacle(WireRouter &wr) {
    addRoutingObstacleWithLeads(wr, 16);
}
