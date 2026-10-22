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

#include "LatchElm.h"

#include "../core/StringTokenizer.h"

#include <algorithm>
#include <cmath>

#include "../core/SimulationManager.h"

void LatchElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st == nullptr) {
        flags |= FLAG_STATE;
        setupPins();
    } else {
        // add FLAG_STATE flag to old latches so their state gets saved
        if ((flags & FLAG_STATE) == 0) {
            flags |= FLAG_STATE;
            setupPins();
        }
        restoreOutputValues();
    }
}

void LatchElm::setupPins() {
    sizeX = 2;
    int ieCount = inputEnableCount();
    int oeCount = outputEnableCount();
    int extraLeftPins = (hasReset() ? 1 : 0) + (hasSet() ? 1 : 0) + ieCount;
    int extraRightPins = oeCount;
    int bitsY = useBus() ? 1 : bits;
    sizeY = std::max(bitsY + 1 + extraLeftPins, bitsY + extraRightPins);
    pins.assign(getPostCount(), Pin());
    makeBitPins(bits, 0, SIDE_W, 0, "I", false, false, false);
    makeBitPins(bits, 0, SIDE_E, bits, "O", !hasOutputEnable(), (flags & FLAG_STATE) != 0, false);
    int pinIndex = bits * 2;
    int leftPos = bitsY;
    int rightPos = bitsY;
    pins[loadPin = pinIndex++] = Pin(this, leftPos++, SIDE_W, isEdgeTriggered() ? "" : "Ld");
    pins[loadPin].clock = isEdgeTriggered();
    if (hasReset()) {
        pins[resetPin = pinIndex++] = Pin(this, leftPos++, SIDE_W, "R");
        pins[resetPin].lineOver = resetActiveLow();
    }
    if (hasSet())
        pins[setPin = pinIndex++] = Pin(this, leftPos++, SIDE_W, "S");
    rightPos = leftPos;
    if (ieCount >= 1) {
        pins[ie1Pin = pinIndex++] = Pin(this, leftPos++, SIDE_W, "IE");
        pins[ie1Pin].lineOver = true;
    }
    if (ieCount >= 2) {
        pins[ie2Pin = pinIndex++] = Pin(this, leftPos++, SIDE_W, "IE");
        pins[ie2Pin].lineOver = true;
    }
    if (oeCount >= 1) {
        pins[oe1Pin = pinIndex++] = Pin(this, rightPos++, SIDE_E, "OE");
        pins[oe1Pin].lineOver = true;
    }
    if (oeCount >= 2) {
        pins[oe2Pin = pinIndex++] = Pin(this, rightPos++, SIDE_E, "OE");
        pins[oe2Pin].lineOver = true;
    }
    intNodes = pinIndex;
    allocNodes();
}

std::vector<bool> &LatchElm::lastOutputValues() {
    if (outputValues.empty())
        outputValues.assign(bits, false);
    return outputValues;
}

void LatchElm::restoreOutputValues() {
    std::vector<bool> &ov = lastOutputValues();
    for (int i = 0; i != bits; i++)
        ov[i] = pins[i + bits].value;
}

void LatchElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    restoreOutputValues();
}

void LatchElm::reset() {
    ChipElm::reset();
    outputValues.clear();
}

// execute() is used by ChipElm.doStep() when there is no output enable.
// when output enable is present, we override doStep() entirely.
void LatchElm::execute() {
    doLoad();
    for (int i = 0; i != bits; i++)
        pins[i + bits].value = lastOutputValues()[i];
}

// shared load logic
void LatchElm::doLoad() {
    std::vector<bool> &ov = lastOutputValues();
    if (hasSet() && pins[setPin].value) {
        for (int i = 0; i != bits; i++)
            ov[i] = true;
        lastLoad = pins[loadPin].value;
        return;
    }
    if (hasReset() && (pins[resetPin].value != resetActiveLow())) {
        for (int i = 0; i != bits; i++)
            ov[i] = false;
        lastLoad = pins[loadPin].value;
        return;
    }
    bool inputEnabled = true;
    if (inputEnableCount() >= 1 && pins[ie1Pin].value)
        inputEnabled = false;
    if (inputEnableCount() >= 2 && pins[ie2Pin].value)
        inputEnabled = false;
    if (inputEnabled && pins[loadPin].value && (!isEdgeTriggered() || !lastLoad))
        for (int i = 0; i != bits; i++)
            ov[i] = pins[i].value;
    lastLoad = pins[loadPin].value;
}

void LatchElm::startIteration() {
    if (!hasOutputEnable()) {
        ChipElm::startIteration();
        return;
    }
    for (int i = 0; i < getPostCount(); i++) {
        Pin &p = pins[i];
        if (!p.output)
            p.value = nodes[i]->v > getThreshold();
    }
    doLoad();
}

void LatchElm::doStep() {
    if (!hasOutputEnable()) {
        ChipElm::doStep();
        return;
    }
    bool outputEnabled = true;
    if (outputEnableCount() >= 1 && pins[oe1Pin].value)
        outputEnabled = false;
    if (outputEnableCount() >= 2 && pins[oe2Pin].value)
        outputEnabled = false;
    for (int i = 0; i < bits; i++) {
        double v = lastOutputValues()[i] ? highVoltage : 0;
        sim->updateVoltageSource(CircuitNode::ground, nodes[intNodes + i], vSources[i], v);
        if (outputEnabled)
            sim->stampResistor(nodes[intNodes + i], nodes[bits + i], 1);
        else
            sim->stampResistor(nodes[bits + i], CircuitNode::ground, 1e8);
    }
}

void LatchElm::stamp() {
    if (!hasOutputEnable()) {
        ChipElm::stamp();
        return;
    }
    for (int i = 0; i < bits; i++) {
        sim->stampVoltageSource(CircuitNode::ground, nodes[intNodes + i], vSources[i]);
        sim->stampNonLinear(nodes[intNodes + i]);
        sim->stampNonLinear(nodes[bits + i]);
    }
}

void LatchElm::setVoltageSource(int j, VoltageSource *vs) {
    if (hasOutputEnable()) {
        if ((int) vSources.size() != bits)
            vSources.assign(bits, nullptr);
        vSources[j] = vs;
        vs->setNodes(CircuitNode::ground, nodes[intNodes + j]);
    } else {
        ChipElm::setVoltageSource(j, vs);
    }
}

bool LatchElm::getMatrixConnection(int n1, int n2) {
    if (hasOutputEnable()) {
        for (int i = 0; i < bits; i++)
            if (comparePair(n1, n2, intNodes + i, bits + i))
                return true;
    }
    return false;
}

bool LatchElm::hasGroundConnection(int n1) {
    if (hasOutputEnable())
        return (n1 >= bits && n1 < bits * 2);
    return pins[n1].output;
}

int LatchElm::getPostCount() {
    return bits * 2 + 1 + (hasReset() ? 1 : 0) + (hasSet() ? 1 : 0) + inputEnableCount() + outputEnableCount();
}

std::optional<EditInfo> LatchElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Bits", bits, 1, 1).setDimensionless();
    if (n == 1)
        return EditInfo::createCheckbox("Edge Triggered", isEdgeTriggered());
    if (n == 2)
        return EditInfo::createCheckbox("Reset Pin", hasReset());
    if (n == 3)
        return EditInfo::createCheckbox("Set Pin", hasSet());
    if (n == 4) {
        EditInfo ei("Enable Pins", 0);
        ei.choice.emplace();
        ei.choice->add("None");
        ei.choice->add("1 Input/Output Enable");
        ei.choice->add("2 Input/Output Enables");
        ei.choice->select(enableMode());
        return ei;
    }
    if (n == 5 && hasReset())
        return EditInfo::createCheckbox("Invert Reset", resetActiveLow());
    return std::nullopt;
}

void LatchElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 2 && bits != (int) std::floor(ei.value)) {
            bits = (int) std::floor(ei.value);
            setupPins();
            setPoints();
        } else if (ei.value < 2)
            ei.setError("must be >= 2");
    }
    if (n == 1) {
        flags = ei.changeFlagInverted(flags, FLAG_NO_EDGE);
        setupPins();
        setPoints();
        ei.newDialog = true;
    }
    if (n == 2) {
        flags = ei.changeFlag(flags, FLAG_RESET);
        setupPins();
        allocNodes();
        setPoints();
    }
    if (n == 3) {
        flags = ei.changeFlag(flags, FLAG_SET);
        setupPins();
        allocNodes();
        setPoints();
    }
    if (n == 4) {
        int mode = ei.choice->getSelectedIndex();
        flags = (flags & ~FLAG_ENABLE_MASK) | (mode << FLAG_ENABLE_SHIFT);
        setupPins();
        allocNodes();
        setPoints();
    }
    if (n == 5) {
        flags = ei.changeFlag(flags, FLAG_RESET_INVERT);
        setupPins();
        setPoints();
    }
}
