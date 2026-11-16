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

#include "BusTransceiverElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/SimulationManager.h"

void BusTransceiverElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st == nullptr) {
        dataBits = 4;
        setupPins();
    }
}

void BusTransceiverElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "db", dataBits);
}

void BusTransceiverElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    dataBits = xml.parseIntAttr("db", dataBits);
    setupPins();
}

void BusTransceiverElm::setupPins() {
    if (!dataBits) dataBits = 4;
    sizeX = 2;
    int dataY = useBus() ? 1 : dataBits;
    sizeY = dataY + 2;
    bits = dataBits;
    pins.assign(getPostCount(), Pin());
    pins[0] = Pin(this, 0, SIDE_W, "OE");
    pins[0].lineOver = true;
    pins[1] = Pin(this, 0, SIDE_E, "DIR");
    aNodes = 2;
    bNodes = 2 + dataBits;
    intNodes = 2 + 2 * dataBits;
    makeBitPins(dataBits, sizeY - dataY, SIDE_W, aNodes, "A", false, false, true);
    makeBitPins(dataBits, sizeY - dataY, SIDE_E, bNodes, "B", false, false, true);
    allocNodes();
}

void BusTransceiverElm::setVoltageSource(int j, VoltageSource *vs) {
    if ((int) vSources.size() != dataBits)
        vSources.assign(dataBits, nullptr);
    vSources[j] = vs;
    vs->setNodes(CircuitNode::ground, nodes[intNodes + j]);
}

bool BusTransceiverElm::getMatrixConnection(int n1, int n2) {
    for (int i = 0; i < dataBits; i++) {
        if (comparePair(n1, n2, intNodes + i, aNodes + i)) return true;
        if (comparePair(n1, n2, intNodes + i, bNodes + i)) return true;
    }
    return false;
}

void BusTransceiverElm::stamp() {
    for (int i = 0; i < dataBits; i++) {
        sim->stampVoltageSource(CircuitNode::ground, nodes[intNodes + i], vSources[i]);
        sim->stampNonLinear(nodes[intNodes + i]);
        sim->stampNonLinear(nodes[aNodes + i]);
        sim->stampNonLinear(nodes[bNodes + i]);
    }
}

void BusTransceiverElm::doStep() {
    bool outputEnabled = nodes[0]->v < getThreshold();
    bool dirAtoB = nodes[1]->v > getThreshold();
    for (int i = 0; i < dataBits; i++) {
        bool srcVal = dirAtoB ? nodes[aNodes + i]->v > getThreshold() : nodes[bNodes + i]->v > getThreshold();
        sim->updateVoltageSource(CircuitNode::ground, nodes[intNodes + i], vSources[i], srcVal ? highVoltage : 0);
        double rDst = outputEnabled ? 1 : 1e10;
        if (dirAtoB) {
            sim->stampResistor(nodes[intNodes + i], nodes[aNodes + i], 1e8);
            sim->stampResistor(nodes[intNodes + i], nodes[bNodes + i], rDst);
        } else {
            sim->stampResistor(nodes[intNodes + i], nodes[aNodes + i], rDst);
            sim->stampResistor(nodes[intNodes + i], nodes[bNodes + i], 1e8);
        }
    }
}

void BusTransceiverElm::getInfo(std::vector<std::string> &arr) {
    arr.resize(2);
    arr[0] = "bus transceiver";
    bool outputEnabled = nodes[0]->v < getThreshold();
    bool dirAtoB = nodes[1]->v > getThreshold();
    arr[1] = outputEnabled ? (dirAtoB ? "A→B" : "B→A") : "hi-Z";
}

std::optional<EditInfo> BusTransceiverElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Bits", dataBits, 1, 1).setDimensionless().setStructural();
    return ChipElm::getChipEditInfo(n);
}

void BusTransceiverElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 1 && ei.value <= 16) {
            dataBits = (int) std::trunc(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be between 1 and 16");
    }
}
