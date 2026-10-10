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

#include "TransLineElm.h"

#include <algorithm>
#include <cmath>
#include <limits>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/VoltageSource.h"

TransLineElm::TransLineElm(int xx, int yy) : CircuitElm(xx, yy) {
    delay = 1000 * sim->maxTimeStep;
    imped = 75;
    noDiagonal = true;
    reset();
}

TransLineElm::TransLineElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    delay = parseFloatStrict(st.nextToken());
    imped = parseFloatStrict(st.nextToken());
    width = parseIntStrict(st.nextToken());
    // next slot is for resistance (losses), not implemented
    st.nextToken();
    noDiagonal = true;
    reset();
}

std::string TransLineElm::dump() {
    return CircuitElm::dump() + " " + jsNumberToString(delay) + " " + jsNumberToString(imped) + " " +
           std::to_string(width) + " 0";
}

void TransLineElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "de", delay);
    CircuitXMLSerializer::dumpAttr(elem, "im", imped);
    CircuitXMLSerializer::dumpAttr(elem, "wi", width);
}

void TransLineElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    delay = xml.parseDoubleAttr("de", delay);
    imped = xml.parseDoubleAttr("im", imped);
    width = xml.parseIntAttr("wi", width);
    reset();
}

void TransLineElm::drag(int xx, int yy) {
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

void TransLineElm::reset() {
    if (sim->maxTimeStep == 0)
        return;
    lenSteps = (int) std::trunc(delay / sim->maxTimeStep);
    if (lenSteps > 100000) {
        buffersOk = false;
        voltageL.clear();
        voltageR.clear();
    } else {
        buffersOk = true;
        voltageL.assign(lenSteps, 0.0);
        voltageR.assign(lenSteps, 0.0);
    }
    ptr = 0;
    CircuitElm::reset();
    lastStepCount = 0;
}

void TransLineElm::setPoints() {
    CircuitElm::setPoints();
    int ds = (dy == 0) ? sign(dx) : -sign(dy);
    Point p3 = interpPoint(point1, point2, 0, -width * ds);
    Point p4 = interpPoint(point1, point2, 1, -width * ds);
    double sep = app->gridSize / 2.;
    Point p5 = interpPoint(point1, point2, 0, -(width / 2. - sep) * ds);
    Point p6 = interpPoint(point1, point2, 1, -(width / 2. - sep) * ds);
    Point p7 = interpPoint(point1, point2, 0, -(width / 2. + sep) * ds);
    Point p8 = interpPoint(point1, point2, 1, -(width / 2. + sep) * ds);

    // we number the posts like this because we want the lower-numbered
    // points to be on the bottom, so that if some of them are unconnected
    // (which is often true) then the bottom ones will get automatically
    // attached to ground.
    posts = {p3, p4, point1, point2};
    inner = {p7, p8, p5, p6};
}

void TransLineElm::draw(Graphics &g) {
    setBbox(posts[0], posts[3], 0);
    int segments = (int) std::trunc(dn / 2);
    int ix0 = ptr - 1 + lenSteps;
    double segf = 1. / segments;

    g.setColor(Color::darkGray);
    g.fillRect(inner[2].x, inner[2].y, inner[1].x - inner[2].x + 2, inner[1].y - inner[2].y + 2);

    for (int i = 0; i != 4; i++) {
        setVoltageColor(g, nodes[i]->v);
        drawThickLine(g, posts[i], inner[i]);
    }

    if (buffersOk && lenSteps > 0) {
        for (int i = 0; i != segments; i++) {
            int ix1 = (ix0 - (int) std::trunc((double) lenSteps * i / segments)) % lenSteps;
            int ix2 = (ix0 - (int) std::trunc((double) lenSteps * (segments - 1 - i) / segments)) % lenSteps;
            double v = (voltageL[ix1] + voltageR[ix2]) / 2;
            setVoltageColor(g, v);
            interpPoint(inner[0], inner[1], ps1, i * segf);
            interpPoint(inner[2], inner[3], ps2, i * segf);
            g.drawLine(ps1.x, ps1.y, ps2.x, ps2.y);
            interpPoint(inner[2], inner[3], ps1, (i + 1) * segf);
            drawThickLine(g, ps1, ps2);
        }
    }

    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, inner[0], inner[1]);
    drawPosts(g);

    curCount1 = updateDotCount(-current1, curCount1);
    curCount2 = updateDotCount(current2, curCount2);
    if (!isCreating()) {
        drawDots(g, posts[0], inner[0], curCount1);
        drawDots(g, posts[2], inner[2], -curCount1);
        drawDots(g, posts[1], inner[1], -curCount2);
        drawDots(g, posts[3], inner[3], curCount2);
    }
}

void TransLineElm::setVoltageSource(int n, VoltageSource *v) {
    if (n == 0) {
        voltSource1 = v;
        v->setNodes(nodes[4], nodes[0]);
    } else {
        voltSource2 = v;
        v->setNodes(nodes[5], nodes[1]);
    }
}

void TransLineElm::setCurrent(VoltageSource *vs, double c) {
    if (vs == voltSource1)
        current1 = c;
    else
        current2 = c;
}

void TransLineElm::stamp() {
    sim->stampVoltageSource(nodes[4], nodes[0], voltSource1);
    sim->stampVoltageSource(nodes[5], nodes[1], voltSource2);
    sim->stampResistor(nodes[2], nodes[4], imped);
    sim->stampResistor(nodes[3], nodes[5], imped);
}

void TransLineElm::startIteration() {
    if (!buffersOk) {
        sim->stop("Transmission line delay too large!", this);
        return;
    }
    if (ptr < lenSteps) {
        voltageL[ptr] = nodes[2]->v - nodes[0]->v + nodes[2]->v - nodes[4]->v;
        voltageR[ptr] = nodes[3]->v - nodes[1]->v + nodes[3]->v - nodes[5]->v;
    }
}

void TransLineElm::doStep() {
    if (!buffersOk) {
        sim->stop("Transmission line delay too large!", this);
        return;
    }
    // (with a delay shorter than one step, lenSteps is 0 and the TS version reads NaN)
    double nan = std::numeric_limits<double>::quiet_NaN();
    int nextPtr = lenSteps > 0 ? (ptr + 1) % lenSteps : -1;
    sim->updateVoltageSource(nodes[4], nodes[0], voltSource1, nextPtr < 0 ? nan : -voltageR[nextPtr]);
    sim->updateVoltageSource(nodes[5], nodes[1], voltSource2, nextPtr < 0 ? nan : -voltageL[nextPtr]);
    if (std::abs(nodes[0]->v) > 1e-5 || std::abs(nodes[1]->v) > 1e-5) {
        sim->stop("Need to ground transmission line!", this);
        return;
    }
}

void TransLineElm::stepFinished() {
    if (sim->timeStepCount == lastStepCount)
        return;
    lastStepCount = sim->timeStepCount;
    if (lenSteps > 0)
        ptr = (ptr + 1) % lenSteps;
}

void TransLineElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "transmission line";
    arr[1] = getUnitText(imped, Locale::ohmString);
    // use velocity factor for RG-58 cable (65%)
    arr[2] = "length = " + getUnitText(0.65 * 2.9979e8 * delay, "m");
    arr[3] = "delay = " + getUnitText(delay, "s");
}

std::optional<EditInfo> TransLineElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Delay (s)", delay, 0, 0).setPositive();
    if (n == 1)
        return EditInfo("Impedance (ohms)", imped, 0, 0).setPositive();
    return std::nullopt;
}

void TransLineElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0) {
        delay = ei.value;
        reset();
    }
    if (n == 1 && ei.value > 0) {
        imped = ei.value;
        reset();
    }
}

double TransLineElm::getCurrentIntoNode(int n) {
    if (n == 0)
        return current1;
    if (n == 2)
        return -current1;
    if (n == 3)
        return -current2;
    return current2;
}
