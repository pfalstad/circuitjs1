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

#include "WattmeterTrueElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"

void WattmeterTrueElm::setup() {
    voltSources[0] = voltSources[1] = nullptr;
    currents[0] = currents[1] = 0;
    curcounts[0] = curcounts[1] = 0;
}

void WattmeterTrueElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "w", width);
    CircuitXMLSerializer::dumpAttr(elem, "meter", meter);
}

void WattmeterTrueElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    width = xml.parseIntAttr("w", width);
    meter = xml.parseIntAttr("meter", meter);
    setup();
}

void WattmeterTrueElm::drag(int xx, int yy) {
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

void WattmeterTrueElm::setPoints() {
    CircuitElm::setPoints();
    int ds = (dy == 0) ? sign(dx) : -sign(dy);

    // get 2 more terminals
    Point p3 = interpPoint(point1, point2, 0, -width * ds);
    Point p4 = interpPoint(point1, point2, 1, -width * ds);

    // get stubs
    int sep = app->gridSize;
    Point p5 = interpPoint(point1, point2, sep / dn);
    Point p6 = interpPoint(point1, point2, 1 - sep / dn);
    Point p7 = interpPoint(p3, p4, sep / dn);
    Point p8 = interpPoint(p3, p4, 1 - sep / dn);

    // we number the posts like this because we want the lower-numbered
    // points to be on the bottom, so that if some of them are unconnected
    // (which is often true) then the bottom ones will get automatically
    // attached to ground.
    // bottom 2 terminals (potential coil) are swapped so that the marked
    // (C) terminal lines up under the marked (M) current coil terminal,
    // matching the standard wattmeter terminal layout: M L / C V
    posts = {p4, p3, point1, point2};
    inner = {p8, p7, p5, p6};

    // get rectangle
    Point r1 = interpPoint(point1, point2, sep / dn, ds * sep);
    Point r2 = interpPoint(point1, point2, 1 - sep / dn, ds * sep);
    Point r3 = interpPoint(point1, point2, sep / dn, -ds * (sep + width));
    Point r4 = interpPoint(point1, point2, 1 - sep / dn, -ds * (sep + width));
    rectPointsX = {r1.x, r2.x, r4.x, r3.x};
    rectPointsY = {r1.y, r2.y, r4.y, r3.y};

    center = interpPoint(r1, r4, .5);
    maxTextLen = std::max(std::abs(r1.x - r4.x) - 5, 5);
}

void WattmeterTrueElm::stamp() {
    // 2  3
    // 0  1
    // zero-valued voltage source from 2 to 3, so we can measure current
    sim->stampVoltageSource(nodes[2], nodes[3], voltSources[0], 0);
    // but turn nodes 0 to 1 into a resistor, so we can measure voltage
    sim->stampResistor(nodes[0], nodes[1], 1e8);
}

void WattmeterTrueElm::draw(Graphics &g) {
    for (int i = 0; i != 2; i++)
        curcounts[i] = updateDotCount(currents[i], curcounts[i]);
    int flip = 1;
    for (int i = 0; i != 4; i++) {
        setVoltageColor(g, nodes[i]->v);
        drawThickLine(g, posts[i], inner[i]);
        if (i == 2 || i == 3)
            drawDots(g, posts[i], inner[i], curcounts[i / 2] * flip);
        // current coil terminals are labeled M (marked) and L, potential coil
        // terminals are labeled C (marked) and V, matching standard wattmeter
        // terminal markings: M L / C V.  Labels sit just inside the box edge,
        // like pin labels on a ChipElm.
        {
            const char *label;
            if (i == 2)
                label = "M";
            else if (i == 3)
                label = "L";
            else if (i == 1)
                label = "C";
            else
                label = "V";
            g.setColor(needsHighlight() ? selectColor : whiteColor);
            int w = (int) std::trunc(g.measureWidth(label));
            Point labelPoint = interpPoint(posts[i], inner[i], 1.5);
            g.drawString(label, labelPoint.x - w / 2, labelPoint.y + 4);
        }
        flip *= -1;
    }

    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    drawThickPolygon(g, rectPointsX, rectPointsY, 4);

    // set bounding box to be full wattmeter box
    setBbox(rectPointsX[0], rectPointsY[0], rectPointsX[2], rectPointsY[2]);
    drawPosts(g);

    std::string str = getUnitText(getMeterPower(), "W");
    g.save();
    int fsize = 15;
    int w;
    // adjust font size to fit
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

void WattmeterTrueElm::stepFinished() {
    double p = getPower();
    double dt = sim->timeStep;
    cycleTime += dt;
    totalEnergy += p * dt;
    runTime += dt;
    runEnergy += p * dt;

    double mid = runEnergy / runTime;

    // Track this cycle's power swing to size next cycle's hysteresis band, instead
    // of an all-time peak/trough. A resistor's instantaneous power settles near its
    // steady-state range almost immediately, but a capacitor charging from an
    // initial condition goes through a startup transient far outside its steady-state
    // swing; an all-time extreme would get stuck there and oversize the band forever,
    // so the detector would stop triggering cleanly once the load is reactive.
    if (p > curPeak)
        curPeak = p;
    if (p < curTrough)
        curTrough = p;

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
        peak = curPeak;
        trough = curTrough;
        curPeak = p;
        curTrough = p;
    } else if (lastCycleTime > 0 && cycleTime > lastCycleTime * 8) {
        // the waveform stopped or changed shape; don't freeze on a stale reading
        avgPower = totalEnergy / cycleTime;
        if (std::isnan(avgPower))
            avgPower = 0;
        totalEnergy = 0;
        cycleTime = 0;
        peak = curPeak;
        trough = curTrough;
        curPeak = p;
        curTrough = p;
    }
    wasAboveMid = above;

    // Constant power never crosses its own mean, so no period is ever measured. Report
    // the running mean until one is, which is the right answer for DC anyway.
    if (lastCycleTime == 0)
        avgPower = mid;

    // Clear the reading once the power has been off for longer than a period.
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

void WattmeterTrueElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "wattmeter";
    getBasicInfo(arr);
    arr[3] = "P = " + getUnitText(getVoltageDiff() * getCurrent(), "W");
    arr[4] = "P = " + getUnitText(getAveragePower(), "W");
}

double WattmeterTrueElm::getMeterPower() {
    double value;
    switch (meter) {
    case PM_INST:
        value = getVoltageDiff() * getCurrent();
        break;
    case PM_AVG:
        value = getAveragePower();
        break;
    default:
        value = -1;
    }
    return value;
}

std::optional<EditInfo> WattmeterTrueElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Value", selectedValue, -1, -1);
        ei.choice = Choice();
        ei.choice->add("Instantaneous Power");
        ei.choice->add("Average Power");
        ei.choice->select(meter);
        return ei;
    }
    return std::nullopt;
}

void WattmeterTrueElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        meter = ei.choice->getSelectedIndex();
}
