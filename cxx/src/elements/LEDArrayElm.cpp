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

#include "LEDArrayElm.h"

#include "../core/StringTokenizer.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/DiodeModel.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"

void LEDArrayElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st != nullptr) {
        try {
            sizeX = parseIntStrict(st->nextToken());
            sizeY = parseIntStrict(st->nextToken());
        } catch (...) {}
        allocNodes();
        setupPins();
        setPoints();
    }
}

std::string LEDArrayElm::dump() {
    return ChipElm::dump() + " " + std::to_string(sizeX) + " " + std::to_string(sizeY);
}

void LEDArrayElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "sx", sizeX);
    CircuitXMLSerializer::dumpAttr(elem, "sy", sizeY);
}

void LEDArrayElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    sizeX = xml.parseIntAttr("sx", sizeX);
    sizeY = xml.parseIntAttr("sy", sizeY);
    allocNodes();
    setupPins();
    setPoints();
}

void LEDArrayElm::setupPins() {
    if (sizeX == 0 || sizeY == 0) {
        sizeX = sizeY = 8;
        allocNodes();
    }
    pins.assign(sizeX + sizeY, Pin());
    for (int i = 0; i != sizeX; i++)
        pins[i] = Pin(this, i, SIDE_S, "");
    for (int i = 0; i != sizeY; i++)
        pins[i + sizeX] = Pin(this, i, SIDE_W, "");
    brightness.assign(sizeX * sizeY, 0);
}

void LEDArrayElm::reset() {
    brightness.assign(sizeX * sizeY, 0);
}

void LEDArrayElm::stamp() {
    ChipElm::stamp();
    DiodeModel *model = DiodeModel::getModelWithName("default-led");
    diodes.clear();
    diodes.reserve(sizeX * sizeY);
    for (int i = 0; i != sizeX * sizeY; i++) {
        diodes.emplace_back(sim);
        diodes[i].setup(model);
        diodes[i].stamp(nodes[sizeX + i / sizeX], nodes[i % sizeX]);
    }
    currents.assign(diodes.size(), 0);
}

void LEDArrayElm::doStep() {
    ChipElm::doStep();
    int i = 0;
    for (int iy = 0; iy != sizeY; iy++)
        for (int ix = 0; ix != sizeX; ix++, i++)
            diodes[i].doStep(nodes[sizeX + iy]->v - nodes[ix]->v);
}

void LEDArrayElm::draw(Graphics &g) {
    double elapsed = sim->t - lastDrawTime;
    lastDrawTime = sim->t;
    decayMultiplier = (elapsed > 0) ? jsmath::exp(-elapsed / brightnessTau) : 1;
    drawChip(g);
    for (int ix = 0; ix != sizeX; ix++) {
        for (int iy = 0; iy != sizeY; iy++) {
            int i = ix + iy * sizeX;
            setLEDColor(g, i);
            if (isFlippedXY())
                g.fillOval(pins[iy + sizeX].post.x - cspc / 2, pins[ix].post.y - cspc / 2, cspc, cspc);
            else
                g.fillOval(pins[ix].post.x - cspc / 2, pins[iy + sizeX].post.y - cspc / 2, cspc, cspc);
        }
    }
}

void LEDArrayElm::calculateCurrent() {
    for (int ix = 0; ix != sizeX; ix++)
        pins[ix].current = 0;
    // avoid exception if called before stamp()
    if (diodes.empty())
        return;
    int i = 0;
    for (int iy = 0; iy != sizeY; iy++) {
        double cur = 0;
        for (int ix = 0; ix != sizeX; ix++, i++) {
            currents[i] = diodes[i].calculateCurrent(nodes[sizeX + iy]->v - nodes[ix]->v);
            cur += currents[i];
            pins[ix].current += currents[i];
        }
        pins[iy + sizeX].current = -cur;
    }
}

void LEDArrayElm::stepFinished() {
    for (size_t i = 0; i != currents.size(); i++)
        if (std::abs(currents[i]) > 1e12)
            sim->stop("max current exceeded", this);
}

void LEDArrayElm::setLEDColor(Graphics &g, int p) {
    // 10mA current = max brightness
    if (currents.empty()) {
        g.setColor(Color(20, 0, 0));
        return;
    }
    double w = currents[p] / 0.01;
    if (w > 0)
        w = 255 * (1 + 0.2 * jsmath::log(w));
    if (w > 255)
        w = 255;
    if (w < 20)
        w = 20;
    // when diode turns off, fade gradually to simulate persistence of vision
    w = std::max(w, brightness[p]);
    brightness[p] = w * decayMultiplier;
    g.setColor(Color((int) std::trunc(w), 0, 0));
}

std::optional<EditInfo> LEDArrayElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("Grid Width", sizeX).setDimensionless();
    if (n == 1)
        return EditInfo("Grid Height", sizeY).setDimensionless();
    return std::nullopt;
}

void LEDArrayElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 2 && ei.value <= 16) {
            sizeX = (int) std::trunc(ei.value);
            allocNodes();
            setupPins();
            setPoints();
        } else
            ei.setError("must be between 2 and 16");
        return;
    }
    if (n == 1) {
        if (ei.value >= 2 && ei.value <= 16) {
            sizeY = (int) std::trunc(ei.value);
            allocNodes();
            setupPins();
            setPoints();
        } else
            ei.setError("must be between 2 and 16");
        return;
    }
}

void LEDArrayElm::getInfo(std::vector<std::string> &arr) {
    arr.assign(1, getChipName());
}
