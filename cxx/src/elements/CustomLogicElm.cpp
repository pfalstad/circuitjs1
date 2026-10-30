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

#include "CustomLogicElm.h"

#include "../core/StringTokenizer.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"

std::string CustomLogicElm::lastModelName = "default";

void CustomLogicElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st == nullptr) {
        modelName = lastModelName;
        setupPins();
        allocNodes();
    } else {
        modelName = CustomLogicModel::unescape(st->nextToken());
        updateModels();
        for (int i = 0; i != getPostCount(); i++) {
            if (pins[i].output) {
                double v = parseFloatStrict(st->nextToken());
                pins[i].value = v > getThreshold();
            }
        }
    }
}

void CustomLogicElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    if (!model->dumped)
        model->dumpXml(doc);
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "mo", *modelName);
}

void CustomLogicElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    std::optional<std::string> mo = xml.parseStringAttr("mo", std::nullopt);
    if (mo)
        modelName = mo;
    updateModels();
}

void CustomLogicElm::updateModels() {
    model = CustomLogicModel::getModelWithNameOrCopy(*modelName, model);
    setupPins();
    allocNodes();
    ChipElm::updateModels();
    setPoints();
}

void CustomLogicElm::setupPins() {
    if (!modelName) {
        postCount = bits;
        allocNodes();
        return;
    }
    model = CustomLogicModel::getModelWithName(*modelName);
    inputCount = (int) model->inputs.size();
    outputCount = (int) model->outputs.size();
    sizeY = inputCount > outputCount ? inputCount : outputCount;
    if (sizeY == 0)
        sizeY = 1;
    sizeX = 2;
    postCount = inputCount + outputCount;
    pins.assign(postCount, Pin());
    for (int i = 0; i != inputCount; i++) {
        pins[i] = Pin(this, i, SIDE_W, model->inputs[i]);
        pins[i].fixName();
    }
    for (int i = 0; i != outputCount; i++) {
        pins[i + inputCount] = Pin(this, i, SIDE_E, model->outputs[i]);
        pins[i + inputCount].output = true;
        pins[i + inputCount].fixName();
    }
    lastValues.assign(postCount, false);
    patternValues.assign(26, false);
    highImpedance.assign(postCount, false);
}

bool CustomLogicElm::hasTriState() {
    return model == nullptr ? false : model->triState;
}

// a tri-state output's voltage source drives an internal node, which connects to the
// output pin through a resistor, so they have to be in the same matrix
bool CustomLogicElm::getMatrixConnection(int n1, int n2) {
    if (hasTriState())
        for (int i = inputCount; i != postCount; i++)
            if (comparePair(n1, n2, i, i + outputCount))
                return true;
    return false;
}

void CustomLogicElm::stamp() {
    int add = hasTriState() ? outputCount : 0;
    for (int i = 0; i != getPostCount(); i++) {
        Pin &p = pins[i];
        if (p.output) {
            sim->stampVoltageSource(CircuitNode::ground, nodes[i + add], p.voltSource);
            if (hasTriState()) {
                sim->stampNonLinear(nodes[i + add]);
                sim->stampNonLinear(nodes[i]);
            }
        }
    }
}

void CustomLogicElm::doStep() {
    int add = hasTriState() ? outputCount : 0;
    for (int i = 0; i != getPostCount(); i++) {
        Pin &p = pins[i];
        if (p.output) {
            // connect output voltage source (to internal node if tri-state, otherwise connect directly to output)
            sim->updateVoltageSource(CircuitNode::ground, nodes[i + add], p.voltSource, p.value ? highVoltage : 0);
            // add resistor for tri-state if necessary
            if (hasTriState())
                sim->stampResistor(nodes[i + add], nodes[i], highImpedance[i] ? 1e8 : 1e-3);
        }
    }
}

void CustomLogicElm::execute() {
    for (size_t i = 0; i != model->rulesLeft.size(); i++) {
        // check for a match
        const std::string &rl = model->rulesLeft[i];
        size_t j;
        for (j = 0; j != rl.size(); j++) {
            char x = rl[j];
            if (x == '0' || x == '1') {
                if (pins[j].value == (x == '1'))
                    continue;
                break;
            }
            // do not care
            if (x == '?')
                continue;
            // up transition
            if (x == '+') {
                if (pins[j].value && !lastValues[j])
                    continue;
                break;
            }
            // down transition
            if (x == '-') {
                if (!pins[j].value && lastValues[j])
                    continue;
                break;
            }
            // save pattern values
            if (x >= 'a' && x <= 'z') {
                patternValues[x - 'a'] = pins[j].value;
                continue;
            }
            // compare pattern values
            if (x >= 'A' && x <= 'Z') {
                if (patternValues[x - 'A'] != pins[j].value)
                    break;
                continue;
            }
        }
        if (j != rl.size())
            continue;
        // success
        const std::string &rr = model->rulesRight[i];
        for (j = 0; j != rr.size(); j++) {
            char x = rr[j];
            highImpedance[j + inputCount] = false;
            if (x >= 'a' && x <= 'z')
                pins[j + inputCount].value = patternValues[x - 'a'];
            else if (x == '_')
                highImpedance[j + inputCount] = true;
            else
                pins[j + inputCount].value = (x == '1');
        }
        break;
    }
    // save values for transition checking
    for (int j = 0; j != postCount; j++)
        lastValues[j] = pins[j].value;
}

std::optional<EditInfo> CustomLogicElm::getChipEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Model Name", 0, -1, -1);
        ei.text = *modelName;
        ei.disallowSliders();
        return ei.setStructural();
    }
    if (n == 1) {
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Edit Model")};
        return ei;
    }
    return std::nullopt;
}

void CustomLogicElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        std::string newModelName = ei.textf->value;
        if (modelName == newModelName)
            return;
        modelName = lastModelName = ei.textf->value;
        model = CustomLogicModel::getModelWithNameOrCopy(*modelName, model);
        setupPins();
        allocNodes();
        setPoints();
        return;
    }
    if (n == 1) {
        app->doEditModel(model);
        return;
    }
}

void CustomLogicElm::getInfo(std::vector<std::string> &arr) {
    ChipElm::getInfo(arr);
    arr[0] = model->infoText;
}

RegistryModel *CustomLogicElm::getModel() {
    return model;
}
