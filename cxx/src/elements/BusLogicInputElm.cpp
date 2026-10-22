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

#include "BusLogicInputElm.h"

#include <cmath>
#include <cstdint>
#include <cstdio>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/SimulationManager.h"

void BusLogicInputElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    SwitchElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "bw", busWidth);
    if (value != 0)
        CircuitXMLSerializer::dumpAttr(elem, "va", value);
    if (hiV != 5)
        CircuitXMLSerializer::dumpAttr(elem, "hi", hiV);
    if (loV != 0)
        CircuitXMLSerializer::dumpAttr(elem, "lo", loV);
}

void BusLogicInputElm::undumpXml(CircuitXMLDeserializer &xml) {
    SwitchElm::undumpXml(xml);
    busWidth = xml.parseIntAttr("bw", busWidth);
    value = xml.parseIntAttr("va", 0);
    hiV = xml.parseDoubleAttr("hi", hiV);
    loV = xml.parseDoubleAttr("lo", loV);
}

void BusLogicInputElm::setVoltageSource(int n, VoltageSource *v) {
    if (voltageSources.empty() || (int) voltageSources.size() != busWidth) {
        voltageSources.assign(busWidth, nullptr);
        currents.assign(busWidth, 0);
    }
    voltageSources[n] = v;
}

void BusLogicInputElm::setCurrent(VoltageSource *vs, double c) {
    for (int i = 0; i < busWidth; i++)
        if (voltageSources[i] == vs) {
            currents[i] = current = c;
            break;
        }
}

void BusLogicInputElm::setPoints() {
    SwitchElm::setPoints();
    lead1 = Point();
}

void BusLogicInputElm::draw(Graphics &g) {
    g.save();
    const int fontSize = 20;
    g.setFont(Font("SansSerif", Font::BOLD, fontSize));
    g.setColor(needsHighlight() ? selectColor : whiteColor);
    std::string s = std::to_string(value);
    interpPoint(point1, point2, lead1,
        1 - (std::floor(g.measureWidth(s)) / 2 + 8) / dn);
    setBbox(point1, lead1, 0);
    drawCenteredText(g, s, x2, y2, true);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1, 5);
    if (!currents.empty()) {
        current = 0;
        for (size_t i = 0; i < currents.size(); i++)
            current += currents[i];
    }
    updateDotCount();
    drawDots(g, point1, lead1, -curcount);
    drawPosts(g);
    g.restore();
}

void BusLogicInputElm::toggle() {
    value++;
    if (value >= (int32_t) (1u << (busWidth & 31)))
        value = 0;
}

void BusLogicInputElm::stamp() {
    for (int i = 0; i < busWidth; i++) {
        double v = ((value & (int32_t) (1u << (i & 31))) != 0) ? hiV : loV;
        sim->stampVoltageSource(CircuitNode::ground, nodes[i], voltageSources[i], v);
    }
}

void BusLogicInputElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "bus input (" + std::to_string(busWidth) + ")";
    arr[1] = "value = " + std::to_string(value);
    char buf[16];
    if (value < 0)
        std::snprintf(buf, sizeof(buf), "-%X", (unsigned) -(int64_t) value);
    else
        std::snprintf(buf, sizeof(buf), "%X", value);
    arr[2] = std::string("hex = 0x") + buf;
}

std::optional<EditInfo> BusLogicInputElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Bus Width", busWidth, 2, 32).setDimensionless();
    if (n == 1)
        return EditInfo("Value", value).setDimensionless();
    if (n == 2)
        return EditInfo("High Voltage", hiV).setUnitStep();
    if (n == 3)
        return EditInfo("Low Voltage", loV).setUnitStep();
    return std::nullopt;
}

void BusLogicInputElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 2) {
            busWidth = (int) std::floor(ei.value);
            allocNodes();
        } else
            ei.setError("must be >= 2");
    }
    if (n == 1)
        value = (int) std::floor(ei.value);
    if (n == 2)
        hiV = ei.value;
    if (n == 3)
        loV = ei.value;
}
