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

#include "SweepElm.h"

#include "../core/CircuitNode.h"
#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

SweepElm::SweepElm(int xx, int yy) : CircuitElm(xx, yy) {
    minF = 20;
    maxF = 4000;
    maxV = 5;
    sweepTime = .1;
    flags = FLAG_BIDIR;
    reset();
}

SweepElm::SweepElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CircuitElm(xa, ya, xb, yb, f) {
    minF = parseFloatStrict(st.nextToken());
    maxF = parseFloatStrict(st.nextToken());
    maxV = parseFloatStrict(st.nextToken());
    sweepTime = parseFloatStrict(st.nextToken());
    reset();
}

void SweepElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "mi", minF);
    CircuitXMLSerializer::dumpAttr(elem, "ma", maxF);
    CircuitXMLSerializer::dumpAttr(elem, "mv", maxV);
    CircuitXMLSerializer::dumpAttr(elem, "sw", sweepTime);
}

void SweepElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    minF = xml.parseDoubleAttr("mi", minF);
    maxF = xml.parseDoubleAttr("ma", maxF);
    maxV = xml.parseDoubleAttr("mv", maxV);
    sweepTime = xml.parseDoubleAttr("sw", sweepTime);
    reset();
}

void SweepElm::setPoints() {
    CircuitElm::setPoints();
    lead1 = interpPoint(point1, point2, 1 - circleSize / dn);
}

void SweepElm::draw(Graphics &g) {
    setBbox(point1, point2, circleSize);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1);
    g.setColor(needsHighlight() ? selectColor : Color::gray);
    setPowerColor(g, false);
    int xc = point2.x;
    int yc = point2.y;
    drawThickCircle(g, xc, yc, circleSize);
    int wl = 8;
    adjustBbox(xc - circleSize, yc - circleSize, xc + circleSize, yc + circleSize);
    int xl = 10;
    double tm = app->currentTimeMillis();
    tm = std::fmod(tm, 2000);
    if (tm > 1000)
        tm = 2000 - tm;
    double w = 1 + tm * .002;
    if (app->simIsRunning())
        w = 1 + 2 * (frequency - minF) / (maxF - minF);

    g.beginPath();
    g.setLineWidth(3.0);
    for (int i = -xl; i <= xl; i++) {
        double yy = yc + jsmath::round(.95 * jsmath::sin(i * pi * w / xl) * wl);
        if (i == -xl)
            g.moveTo(xc + i, yy);
        else
            g.lineTo(xc + i, yy);
    }
    g.stroke();
    g.setLineWidth(1.0);

    if (showValues()) {
        std::string s = getShortUnitText(frequency, "Hz");
        if (dx == 0 || dy == 0)
            drawValues(g, s, circleSize);
    }

    drawPosts(g);
    curcount = updateDotCount(-current, curcount);
    if (!isCreating())
        drawDots(g, point1, lead1, curcount);
}

void SweepElm::stamp() {
    sim->stampVoltageSource(CircuitNode::ground, nodes[0], voltSource);
}

void SweepElm::setParams() {
    if (frequency < minF || frequency > maxF) {
        frequency = minF;
        freqTime = 0;
        dir = 1;
    }
    if ((flags & FLAG_LOG) == 0) {
        fadd = dir * sim->timeStep * (maxF - minF) / sweepTime;
        fmul = 1;
    } else {
        fadd = 0;
        fmul = jsmath::pow(maxF / minF, dir * sim->timeStep / sweepTime);
    }
    savedTimeStep = sim->timeStep;
}

void SweepElm::reset() {
    frequency = minF;
    freqTime = 0;
    dir = 1;
    setParams();
}

void SweepElm::startIteration() {
    // has timestep been changed?
    if (sim->timeStep != savedTimeStep)
        setParams();
    v = jsmath::sin(freqTime) * maxV;
    freqTime += frequency * 2 * pi * sim->timeStep;
    frequency = frequency * fmul + fadd;
    if (frequency >= maxF && dir == 1) {
        if ((flags & FLAG_BIDIR) != 0) {
            fadd = -fadd;
            fmul = 1 / fmul;
            dir = -1;
        } else
            frequency = minF;
    }
    if (frequency <= minF && dir == -1) {
        fadd = -fadd;
        fmul = 1 / fmul;
        dir = 1;
    }
}

void SweepElm::doStep() {
    sim->updateVoltageSource(CircuitNode::ground, nodes[0], voltSource, v);
}

void SweepElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = std::string("sweep ") + (((flags & FLAG_LOG) == 0) ? "(linear)" : "(log)");
    arr[1] = "I = " + getCurrentDText(getCurrent());
    arr[2] = "V = " + getVoltageText(nodes[0]->v);
    arr[3] = "f = " + getUnitText(frequency, "Hz");
    arr[4] = "range = " + getUnitText(minF, "Hz") + " .. " + getUnitText(maxF, "Hz");
    arr[5] = "time = " + getUnitText(sweepTime, "s");
}

std::optional<EditInfo> SweepElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Min Frequency (Hz)", minF, 0, 0);
    if (n == 1)
        return EditInfo("Max Frequency (Hz)", maxF, 0, 0);
    if (n == 2)
        return EditInfo("Sweep Time (s)", sweepTime, 0, 0);
    if (n == 3)
        return EditInfo::createCheckbox("Logarithmic", (flags & FLAG_LOG) != 0);
    if (n == 4)
        return EditInfo("Max Voltage", maxV, 0, 0).setUnitStep();
    if (n == 5)
        return EditInfo::createCheckbox("Bidirectional", (flags & FLAG_BIDIR) != 0);
    return std::nullopt;
}

void SweepElm::setEditValue(int n, EditInfo &ei) {
    double maxfreq = 1 / (8 * sim->timeStep);
    if (n == 0) {
        minF = ei.value;
        if (minF > maxfreq)
            minF = maxfreq;
    }
    if (n == 1) {
        maxF = ei.value;
        if (maxF > maxfreq)
            maxF = maxfreq;
    }
    if (n == 2)
        sweepTime = ei.value;
    if (n == 3) {
        flags &= ~FLAG_LOG;
        if (ei.checkbox->getState())
            flags |= FLAG_LOG;
    }
    if (n == 4)
        maxV = ei.value;
    if (n == 5) {
        flags &= ~FLAG_BIDIR;
        if (ei.checkbox->getState())
            flags |= FLAG_BIDIR;
    }
    setParams();
}
