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

#include "RelayModel.h"

#include <algorithm>
#include <cmath>
#include <iostream>

#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "Locale.h"
#include "SimApp.h"
#include "XmlDoc.h"

SimApp *RelayModel::app = nullptr;

OrderedMap<RelayModel *> &RelayModel::modelMap() {
    static OrderedMap<RelayModel *> map;
    return map;
}

RelayModel::RelayModel(const RelayModel &copy) {
    flags = copy.flags;
    inductance = copy.inductance;
    r_on = copy.r_on;
    r_off = copy.r_off;
    onCurrent = copy.onCurrent;
    offCurrent = copy.offCurrent;
    coilR = copy.coilR;
    switchingTime = copy.switchingTime;
    coilStyle = copy.coilStyle;
    poleCount = copy.poleCount;
    showBox = copy.showBox;
    pulldown = copy.pulldown;
}

RelayModel *RelayModel::getModelWithName(const std::string &name) {
    createModelMap();
    if (RelayModel **lm = modelMap().get(name))
        return *lm;
    RelayModel *lm = new RelayModel();
    lm->name = name;
    modelMap().set(name, lm);
    return lm;
}

RelayModel *RelayModel::getModelWithNameOrCopy(const std::string &name, RelayModel *oldmodel) {
    createModelMap();
    if (RelayModel **lm = modelMap().get(name))
        return *lm;
    if (oldmodel == nullptr) {
        std::cerr << "relay model not found: " << name << "\n";
        return getDefaultModel();
    }
    std::cerr << "relay model not found yet, using placeholder: " << name << "\n";
    RelayModel *copy = new RelayModel(*oldmodel);
    copy->name = name;
    modelMap().set(name, copy);
    return copy;
}

void RelayModel::createModelMap() {
    static bool created = false;
    if (created)
        return;
    created = true;
    addDefaultModel("default", new RelayModel());
    RelayModel *m2 = new RelayModel();
    m2->poleCount = 2;
    addDefaultModel("default-2-poles", m2);
    RelayModel *m3 = new RelayModel();
    m3->poleCount = 3;
    addDefaultModel("default-3-poles", m3);
}

void RelayModel::addDefaultModel(const std::string &name, RelayModel *rm) {
    modelMap().set(name, rm);
    rm->readOnly = rm->builtIn = true;
    rm->name = name;
}

RelayModel *RelayModel::getDefaultModel() {
    return getModelWithName("default");
}

RelayModel *RelayModel::getModelWithParameters(double inductance, double r_on, double r_off, double onCurrent,
                                               double offCurrent, double coilR, double switchingTime, int coilStyle,
                                               bool showBox, bool pulldown, int poleCount) {
    createModelMap();
    for (auto &kv : modelMap()) {
        RelayModel *rm = kv.second;
        if (std::abs(rm->inductance - inductance) < 1e-15 && std::abs(rm->r_on - r_on) < 1e-15 &&
            std::abs(rm->r_off - r_off) < 1e-15 && std::abs(rm->onCurrent - onCurrent) < 1e-15 &&
            std::abs(rm->offCurrent - offCurrent) < 1e-15 && std::abs(rm->coilR - coilR) < 1e-15 &&
            std::abs(rm->switchingTime - switchingTime) < 1e-15 && rm->coilStyle == coilStyle &&
            rm->showBox == showBox && rm->pulldown == pulldown && rm->poleCount == poleCount)
            return rm;
    }
    const std::string baseName = "old-relay";
    std::string name = baseName;
    if (modelMap().get(name) != nullptr) {
        for (int num = 2;; num++) {
            std::string n = baseName + "-" + std::to_string(num);
            if (modelMap().get(n) == nullptr) {
                name = n;
                break;
            }
        }
    }
    RelayModel *rm = getModelWithName(name);
    rm->inductance = inductance;
    rm->r_on = r_on;
    rm->r_off = r_off;
    rm->onCurrent = onCurrent;
    rm->offCurrent = offCurrent;
    rm->coilR = coilR;
    rm->switchingTime = switchingTime;
    rm->coilStyle = coilStyle;
    rm->showBox = showBox;
    rm->pulldown = pulldown;
    rm->poleCount = poleCount;
    rm->oldStyle = true;
    return rm;
}

void RelayModel::clearDumpedFlags() {
    for (auto &kv : modelMap())
        kv.second->dumped = false;
}

std::vector<RelayModel *> RelayModel::getModelList() {
    createModelMap();
    std::vector<RelayModel *> list;
    for (auto &kv : modelMap())
        if (std::find(list.begin(), list.end(), kv.second) == list.end())
            list.push_back(kv.second);
    std::stable_sort(list.begin(), list.end(), [](RelayModel *a, RelayModel *b) { return a->name < b->name; });
    return list;
}

std::string RelayModel::getDescription() const {
    if (!description)
        return name;
    return name + " (" + Locale::LS(*description) + ")";
}

void RelayModel::pickName() {
    name = "relaymodel";
    if (modelMap().get(name) != nullptr) {
        for (int num = 2;; num++) {
            std::string n = name + "-" + std::to_string(num);
            if (modelMap().get(n) == nullptr) {
                name = n;
                break;
            }
        }
    }
    modelMap().set(name, this);
}

void RelayModel::dumpXml(XmlElement *root) {
    dumped = true;
    XmlElement *elem = root->createChild("rlm");
    CircuitXMLSerializer::dumpAttr(elem, "nm", name);
    CircuitXMLSerializer::dumpAttr(elem, "f", flags);
    CircuitXMLSerializer::dumpAttr(elem, "in", inductance);
    CircuitXMLSerializer::dumpAttr(elem, "ron", r_on);
    CircuitXMLSerializer::dumpAttr(elem, "rof", r_off);
    CircuitXMLSerializer::dumpAttr(elem, "on", onCurrent);
    CircuitXMLSerializer::dumpAttr(elem, "of", offCurrent);
    CircuitXMLSerializer::dumpAttr(elem, "coR", coilR);
    CircuitXMLSerializer::dumpAttr(elem, "sw", switchingTime);
    CircuitXMLSerializer::dumpAttr(elem, "cs", coilStyle);
    if (poleCount != 1)
        CircuitXMLSerializer::dumpAttr(elem, "po", poleCount);
    if (showBox)
        CircuitXMLSerializer::dumpAttr(elem, "sb", 1);
    if (pulldown)
        CircuitXMLSerializer::dumpAttr(elem, "pd", 1);
}

RelayModel *RelayModel::undumpModelXml(CircuitXMLDeserializer &xml) {
    std::string name = xml.parseStringAttr("nm", std::nullopt).value_or("");
    RelayModel *rm = getModelWithName(name);
    rm->undumpXml(xml);
    return rm;
}

void RelayModel::undumpXml(CircuitXMLDeserializer &xml) {
    flags = xml.parseIntAttr("f", flags);
    inductance = xml.parseDoubleAttr("in", inductance);
    r_on = xml.parseDoubleAttr("ron", r_on);
    r_off = xml.parseDoubleAttr("rof", r_off);
    onCurrent = xml.parseDoubleAttr("on", onCurrent);
    offCurrent = xml.parseDoubleAttr("of", offCurrent);
    coilR = xml.parseDoubleAttr("coR", coilR);
    switchingTime = xml.parseDoubleAttr("sw", switchingTime);
    coilStyle = xml.parseIntAttr("cs", coilStyle);
    poleCount = xml.parseIntAttr("po", poleCount);
    showBox = xml.parseIntAttr("sb", showBox ? 1 : 0) != 0;
    pulldown = xml.parseIntAttr("pd", pulldown ? 1 : 0) != 0;
}

std::optional<EditInfo> RelayModel::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Model Name", 0);
        ei.text = name;
        return ei;
    }
    if (n == 1)
        return EditInfo("Inductance (H)", inductance, 0, 0).setPositive();
    if (n == 2)
        return EditInfo("On Resistance (ohms)", r_on, 0, 0).setPositive();
    if (n == 3)
        return EditInfo("Off Resistance (ohms)", r_off, 0, 0).setPositive();
    if (n == 4)
        return EditInfo("On Current (A)", onCurrent, 0, 0).setPositive();
    if (n == 5)
        return EditInfo("Off Current (A)", offCurrent, 0, 0).setPositive();
    if (n == 6)
        return EditInfo("Number of Poles", poleCount, 1, 4).setDimensionless();
    if (n == 7)
        return EditInfo("Coil Resistance (ohms)", coilR, 0, 0).setPositive();
    if (n == 8)
        return EditInfo("Switching Time (s)", switchingTime, 0, 0).setPositive();
    if (n == 9) {
        EditInfo ei("Coil Style", coilStyle, -1, -1);
        ei.choice = Choice();
        ei.choice->add("Both Sides");
        ei.choice->add("Side 1");
        ei.choice->add("Side 2");
        ei.choice->select(coilStyle);
        return ei;
    }
    if (n == 10)
        return EditInfo::createCheckbox("Show Box", showBox);
    if (n == 11)
        return EditInfo::createCheckbox("Pulldown Resistor", pulldown);
    return std::nullopt;
}

void RelayModel::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        name = ei.textf->value;
        if (!name.empty())
            modelMap().set(name, this);
    }
    if (n == 1 && ei.value > 0) inductance = ei.value;
    if (n == 2 && ei.value > 0) r_on = ei.value;
    if (n == 3 && ei.value > 0) r_off = ei.value;
    if (n == 4 && ei.value > 0) onCurrent = ei.value;
    if (n == 5 && ei.value > 0) offCurrent = ei.value;
    if (n == 6 && ei.value >= 1) poleCount = (int) std::trunc(ei.value);
    if (n == 7 && ei.value > 0) coilR = ei.value;
    if (n == 8 && ei.value > 0) switchingTime = ei.value;
    if (n == 9) coilStyle = ei.choice->getSelectedIndex();
    if (n == 10) showBox = ei.checkbox->getState();
    if (n == 11) pulldown = ei.checkbox->getState();
    if (app != nullptr)
        app->updateModels();
}
