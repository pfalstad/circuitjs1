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

#include "WattmeterElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

WattmeterElm::WattmeterElm(int xx, int yy) : CircuitElm(xx, yy) {
    setup();
}

WattmeterElm::WattmeterElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    width = parseIntStrict(st.nextToken());
    try {
        meter = parseIntStrict(st.nextToken());
    } catch (...) {}
    setup();
}

void WattmeterElm::setup() {
    voltSources[0] = voltSources[1] = nullptr;
    currents[0] = currents[1] = 0;
    curcounts[0] = curcounts[1] = 0;
}

std::string WattmeterElm::dump() {
    return CircuitElm::dump() + " " + std::to_string(width) + " " + std::to_string(meter);
}

void WattmeterElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "w", width);
    CircuitXMLSerializer::dumpAttr(elem, "meter", meter);
}

void WattmeterElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    width = xml.parseIntAttr("w", width);
    meter = xml.parseIntAttr("meter", meter);
    setup();
}

void WattmeterElm::drag(int xx, int yy) {
    xx = snapGrid(xx);
    yy = snapGrid(yy);
    int w1 = std::max(app->gridSize, std::abs(yy - y));
    int w2 = std::max(app->gridSize, std::abs(xx - x));
    if (w1 > w2) {
        xx = x;
        width = w2;
    } else {
        yy = y;
        width = w1;
    }
    x2 = xx;
    y2 = yy;
    setPoints();
}

void WattmeterElm::setPoints() {
    CircuitElm::setPoints();
    int ds = (dy == 0) ? sign(dx) : -sign(dy);
    Point p3 = interpPoint(point1, point2, 0, -width * ds);
    Point p4 = interpPoint(point1, point2, 1, -width * ds);
    int sep = app->gridSize;
    Point p5 = interpPoint(point1, point2, sep / dn);
    Point p6 = interpPoint(point1, point2, 1 - sep / dn);
    Point p7 = interpPoint(p3, p4, sep / dn);
    Point p8 = interpPoint(p3, p4, 1 - sep / dn);
    posts = {p3, p4, point1, point2};
    inner = {p7, p8, p5, p6};
    Point r1 = interpPoint(point1, point2, sep / dn, ds * sep);
    Point r2 = interpPoint(point1, point2, 1 - sep / dn, ds * sep);
    Point r3 = interpPoint(point1, point2, sep / dn, -ds * (sep + width));
    Point r4 = interpPoint(point1, point2, 1 - sep / dn, -ds * (sep + width));
    rectPointsX = {r1.x, r2.x, r4.x, r3.x};
    rectPointsY = {r1.y, r2.y, r4.y, r3.y};
    center = interpPoint(r1, r4, 0.5);
    maxTextLen = std::max(std::abs(r1.x - r4.x) - 5, 5);
}

void WattmeterElm::stamp() {
    sim->stampVoltageSource(nodes[0], nodes[1], voltSources[0], 0);
    sim->stampVoltageSource(nodes[2], nodes[3], voltSources[1], 0);
}

void WattmeterElm::setVoltageSource(int j, VoltageSource *vs) {
    voltSources[j] = vs;
    vs->setNodes(nodes[j * 2], nodes[j * 2 + 1]);
}

void WattmeterElm::stepFinished() {
    double p = getPower();
    double dt = sim->timeStep;
    cycleTime += dt;
    totalEnergy += p * dt;
    runTime += dt;
    runEnergy += p * dt;

    // Average over whole cycles, delimited by rising crossings of the long-run mean.
    // The previous code delimited them by the local extremes of the power waveform,
    // which is half a period for a sine wave, and for a waveform with a flat section -
    // such as the output of a half-wave rectifier - gives a window that falls either
    // side of the conducting part instead of spanning a period.
    double mid = runEnergy / runTime;

    // Compare against the threshold with hysteresis. While the power is constant it
    // equals its own running mean, and a bare p > mid then chatters on rounding noise
    // alone, manufacturing crossings a fraction of a timestep apart. Those leave a
    // period estimate orders of magnitude too short behind, which the timeout and the
    // zero check below would then act on.
    if (p > peak)
        peak = p;
    if (p < trough)
        trough = p;
    double band = (peak - trough) * .05 + std::abs(peak) * 1e-9;
    bool above = wasAboveMid ? p > mid - band : p > mid + band;

    if (above && !wasAboveMid) {
        if (haveFullCycle) {
            avgPower = totalEnergy / cycleTime;
            if (std::isnan(avgPower))
                avgPower = 0;
            lastCycleTime = cycleTime;
        } else {
            // The run up to the first crossing is a partial cycle. Measuring it would
            // leave a period estimate far shorter than the real one.
            haveFullCycle = true;
        }
        totalEnergy = 0;
        cycleTime = 0;
    } else if (lastCycleTime > 0 && cycleTime > lastCycleTime * 8) {
        // the waveform stopped or changed shape; don't freeze on a stale reading
        avgPower = totalEnergy / cycleTime;
        if (std::isnan(avgPower))
            avgPower = 0;
        totalEnergy = 0;
        cycleTime = 0;
    }
    wasAboveMid = above;

    // Constant power never crosses its own mean, so no period is ever measured. Report
    // the running mean until one is, which is the right answer for DC anyway.
    if (lastCycleTime == 0)
        avgPower = mid;

    // Clear the reading once the power has been off for longer than a period. The
    // previous code cleared after five zero samples, which a rectified waveform reaches
    // during every cycle; tying it to the measured period does not.
    if (p == 0) {
        zeroTime += dt;
        if (lastCycleTime > 0 && zeroTime > lastCycleTime * 1.5) {
            avgPower = 0;
            totalEnergy = 0;
            cycleTime = 0;
        }
    } else {
        zeroTime = 0;
    }
}

void WattmeterElm::draw(Graphics &g) {
    for (int i = 0; i != 2; i++)
        curcounts[i] = updateDotCount(currents[i], curcounts[i]);
    int flip = 1;
    for (int i = 0; i != 4; i++) {
        setVoltageColor(g, nodes[i]->v);
        drawThickLine(g, posts[i], inner[i]);
        drawDots(g, posts[i], inner[i], curcounts[i / 2] * flip);
        flip *= -1;
    }
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    drawThickPolygon(g, rectPointsX, rectPointsY, 4);
    setBbox(posts[0].x, posts[0].y, posts[3].x, posts[3].y);
    drawPosts(g);

    std::string str = meter == PM_AVG
        ? getUnitText(avgPower, "W(avg)")
        : getUnitText(getPower(), "W");
    g.save();
    int fsize = 15;
    int w;
    while (true) {
        g.setFont(Font("SansSerif", 0, fsize));
        w = (int) std::trunc(g.measureWidth(str));
        if (w < maxTextLen || fsize <= 1)
            break;
        fsize--;
    }
    g.setColor(whiteColor);
    g.setTextBaseline(Graphics::BASELINE_MIDDLE);
    g.drawString(str, center.x - w / 2, center.y);
    g.restore();
}

void WattmeterElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "wattmeter (old)";
    getBasicInfo(arr);
    arr[3] = "P = " + getUnitText(getPower(), "W");
    if (meter == PM_AVG)
        arr[4] = "Pavg = " + getUnitText(avgPower, "W");
}

std::optional<EditInfo> WattmeterElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Value", 0, -1, -1);
        ei.choice = Choice();
        ei.choice->add("Instantaneous");
        ei.choice->add("Average");
        ei.choice->select(meter);
        return ei;
    }
    return std::nullopt;
}

void WattmeterElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        meter = ei.choice->getSelectedIndex();
}
