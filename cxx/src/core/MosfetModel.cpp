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

#include "MosfetModel.h"

#include <algorithm>
#include <cmath>
#include <iostream>

#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "CustomLogicModel.h"
#include "JsNumber.h"
#include "Locale.h"
#include "SimApp.h"
#include "StringTokenizer.h"
#include "XmlDoc.h"

SimApp *MosfetModel::app = nullptr;

OrderedMap<MosfetModel *> &MosfetModel::modelMap() {
    static OrderedMap<MosfetModel *> m;
    return m;
}

MosfetModel::MosfetModel() {
    threshold = 1.5;
    beta = .02;
    showBulk = true;
    bodyDiode = true;
}

MosfetModel::MosfetModel(const MosfetModel &copy) : Editable() {
    flags = copy.flags;
    threshold = copy.threshold;
    beta = copy.beta;
    lambda = copy.lambda;
    capGS = copy.capGS;
    capGD = copy.capGD;
    showBulk = copy.showBulk;
    digitalSymbol = copy.digitalSymbol;
    bodyDiode = copy.bodyDiode;
    bodyTerminal = copy.bodyTerminal;
    showBodyDiodeSymbol = copy.showBodyDiodeSymbol;
}

MosfetModel::MosfetModel(const std::string &d, double vt, double b) {
    description = d;
    threshold = vt;
    beta = b;
    showBulk = true;
    bodyDiode = true;
}

MosfetModel *MosfetModel::getModelWithName(const std::string &name) {
    createModelMap();
    if (MosfetModel **lm = modelMap().get(name))
        return *lm;
    MosfetModel *lm = new MosfetModel();
    lm->name = name;
    modelMap().set(name, lm);
    return lm;
}

MosfetModel *MosfetModel::getModelWithNameOrCopy(const std::string &name, MosfetModel *oldmodel, bool jfet) {
    createModelMap();
    if (MosfetModel **lm = modelMap().get(name))
        return *lm;
    if (oldmodel == nullptr) {
        std::cerr << "model not found: " << name << "\n";
        return getDefaultModel(jfet);
    }
    MosfetModel *copy = new MosfetModel(*oldmodel);
    copy->name = name;
    modelMap().set(name, copy);
    return copy;
}

void MosfetModel::createModelMap() {
    static bool created = false;
    if (created)
        return;
    created = true;

    addDefaultModel("default", new MosfetModel("default", 1.5, .02));

    MosfetModel *noDiodeDefault = new MosfetModel("default-nodiode", 1.5, .02);
    noDiodeDefault->bodyDiode = false;
    addDefaultModel("default-nodiode", noDiodeDefault);

    MosfetModel *bodyTerminalDefault = new MosfetModel("default-body", 1.5, .02);
    bodyTerminalDefault->bodyTerminal = true;
    addDefaultModel("default-body", bodyTerminalDefault);

    MosfetModel *digitalDefault = new MosfetModel("default-digital", 1.5, .02);
    digitalDefault->showBulk = false;
    digitalDefault->digitalSymbol = true;
    digitalDefault->bodyDiode = false;
    addDefaultModel("default-digital", digitalDefault);

    // values taken from Hayes+Horowitz p155.  JFETs never show a bulk/body terminal.
    MosfetModel *jfetDefault = (new MosfetModel("default-jfet", -4, .00125))->setJfet();
    jfetDefault->showBulk = jfetDefault->bodyDiode = false;
    addDefaultModel("default-jfet", jfetDefault);
}

void MosfetModel::addDefaultModel(const std::string &name, MosfetModel *dm) {
    modelMap().set(name, dm);
    dm->readOnly = dm->builtIn = true;
    dm->name = name;
}

MosfetModel *MosfetModel::getDefaultModel(bool jfet) {
    return getModelWithName(jfet ? "default-jfet" : "default");
}

MosfetModel *MosfetModel::getModelWithParameters(double vt, double beta, bool jfet, bool showBulk, bool bodyDiode,
                                                 bool bodyTerminal, bool digitalSymbol, bool showBodyDiodeSymbol) {
    createModelMap();
    for (auto &kv : modelMap()) {
        MosfetModel *mm = kv.second;
        if (mm->isJfet() == jfet && std::abs(mm->threshold - vt) < 1e-15 && std::abs(mm->beta - beta) < 1e-15 &&
            mm->lambda == 0 && mm->capGS == 0 && mm->capGD == 0 && mm->showBulk == showBulk &&
            mm->bodyDiode == bodyDiode && mm->bodyTerminal == bodyTerminal && mm->digitalSymbol == digitalSymbol &&
            mm->showBodyDiodeSymbol == showBodyDiodeSymbol)
            return mm;
    }
    std::string baseName = std::string("old-") + (jfet ? "jfet" : "mosfet");
    std::string name = baseName;
    if (modelMap().has(name)) {
        for (int num = 2;; num++) {
            std::string n = baseName + "-" + std::to_string(num);
            if (!modelMap().has(n)) {
                name = n;
                break;
            }
        }
    }
    MosfetModel *mm = getModelWithName(name);
    mm->threshold = vt;
    mm->beta = beta;
    mm->showBulk = showBulk;
    mm->bodyDiode = bodyDiode;
    mm->bodyTerminal = bodyTerminal;
    mm->digitalSymbol = digitalSymbol;
    mm->showBodyDiodeSymbol = showBodyDiodeSymbol;
    if (jfet)
        mm->setJfet();
    // unlike DiodeModel's oldStyle models (whose auto-generated name embeds the value, e.g.
    // "fwdrop=0.7", so editing the value in place would make the name misleading), this
    // name ("old-mosfet-2" etc.) does not encode the values, so there is no harm in letting the
    // user edit it directly - matches RelayModel's oldStyle models, which are also editable.
    mm->oldStyle = true;
    return mm;
}

void MosfetModel::clearDumpedFlags() {
    for (auto &kv : modelMap())
        kv.second->dumped = false;
}

std::vector<MosfetModel *> MosfetModel::getModelList(bool jfet) {
    createModelMap();
    std::vector<MosfetModel *> vector;
    for (auto &kv : modelMap()) {
        MosfetModel *mm = kv.second;
        if (mm->internal || mm->isJfet() != jfet)
            continue;
        if (std::find(vector.begin(), vector.end(), mm) == vector.end())
            vector.push_back(mm);
    }
    std::stable_sort(vector.begin(), vector.end(), [](MosfetModel *a, MosfetModel *b) { return a->name < b->name; });
    return vector;
}

std::string MosfetModel::getDescription() const {
    if (!description || *description == name)
        return name;
    return name + " (" + Locale::LS(*description) + ")";
}

MosfetModel *MosfetModel::undumpModel(StringTokenizer &st) {
    std::string name = CustomLogicModel::unescape(st.nextToken());
    MosfetModel *dm = getModelWithName(name);
    dm->undump(st);
    return dm;
}

void MosfetModel::undump(StringTokenizer &st) {
    flags = parseIntStrict(st.nextToken());
    threshold = parseFloatStrict(st.nextToken());
    beta = parseFloatStrict(st.nextToken());
    try {
        lambda = parseFloatStrict(st.nextToken());
    } catch (...) {}
    try {
        capGS = parseFloatStrict(st.nextToken());
        capGD = parseFloatStrict(st.nextToken());
    } catch (...) {}
    try {
        showBulk = parseIntStrict(st.nextToken()) != 0;
        digitalSymbol = parseIntStrict(st.nextToken()) != 0;
        bodyDiode = parseIntStrict(st.nextToken()) != 0;
        bodyTerminal = parseIntStrict(st.nextToken()) != 0;
        showBodyDiodeSymbol = parseIntStrict(st.nextToken()) != 0;
    } catch (...) {}
}

void MosfetModel::dumpXml(XmlElement *root) {
    dumped = true;
    XmlElement *elem = root->createChild("mm");
    CircuitXMLSerializer::dumpAttr(elem, "nm", name);
    CircuitXMLSerializer::dumpAttr(elem, "f", flags);
    CircuitXMLSerializer::dumpAttr(elem, "vt", threshold);
    CircuitXMLSerializer::dumpAttr(elem, "be", beta);
    if (lambda != 0)
        CircuitXMLSerializer::dumpAttr(elem, "la", lambda);
    if (capGS != 0)
        CircuitXMLSerializer::dumpAttr(elem, "cgs", capGS);
    if (capGD != 0)
        CircuitXMLSerializer::dumpAttr(elem, "cgd", capGD);
    // dumped unconditionally (not just when true) since these default to true for MOSFETs;
    // an omitted attribute would otherwise be misread as true again on reload
    CircuitXMLSerializer::dumpAttr(elem, "sb", showBulk ? 1 : 0);
    CircuitXMLSerializer::dumpAttr(elem, "dsy", digitalSymbol ? 1 : 0);
    CircuitXMLSerializer::dumpAttr(elem, "bd", bodyDiode ? 1 : 0);
    CircuitXMLSerializer::dumpAttr(elem, "bt", bodyTerminal ? 1 : 0);
    CircuitXMLSerializer::dumpAttr(elem, "sbd", showBodyDiodeSymbol ? 1 : 0);
}

MosfetModel *MosfetModel::undumpModelXml(CircuitXMLDeserializer &xml) {
    std::optional<std::string> name = xml.parseStringAttr("nm", std::nullopt);
    MosfetModel *dm = getModelWithName(name.value_or(""));
    dm->undumpXml(xml);
    return dm;
}

void MosfetModel::undumpXml(CircuitXMLDeserializer &xml) {
    flags = xml.parseIntAttr("f", flags);
    threshold = xml.parseDoubleAttr("vt", threshold);
    beta = xml.parseDoubleAttr("be", beta);
    lambda = xml.parseDoubleAttr("la", lambda);
    capGS = xml.parseDoubleAttr("cgs", capGS);
    capGD = xml.parseDoubleAttr("cgd", capGD);
    showBulk = xml.parseIntAttr("sb", showBulk ? 1 : 0) != 0;
    digitalSymbol = xml.parseIntAttr("dsy", digitalSymbol ? 1 : 0) != 0;
    bodyDiode = xml.parseIntAttr("bd", bodyDiode ? 1 : 0) != 0;
    bodyTerminal = xml.parseIntAttr("bt", bodyTerminal ? 1 : 0) != 0;
    showBodyDiodeSymbol = xml.parseIntAttr("sbd", showBodyDiodeSymbol ? 1 : 0) != 0;
}

std::optional<EditInfo> MosfetModel::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Model Name", 0);
        ei.text = name;
        return ei;
    }
    if (n == 1) return EditInfo("Threshold Voltage (Vt)", threshold);
    if (n == 2) return EditInfo(EditInfo::makeLink("mosfet-beta.html", "Beta"), beta);
    int idx = 3;
    // JFETs never show the bulk/body, so these options do not apply to jfet models
    if (!isJfet()) {
        if (n == idx++)
            return EditInfo::createCheckbox("Show Bulk", showBulk);
        if (n == idx++) {
            if (!showBulk)
                return EditInfo::createCheckbox("Digital Symbol", digitalSymbol);
            return EditInfo::createCheckbox("Simulate Body Diode", bodyDiode);
        }
        if (showBulk && bodyDiode) {
            if (n == idx++)
                return EditInfo::createCheckbox("Body Terminal", bodyTerminal);
            if (n == idx++)
                return EditInfo::createCheckbox("Show Body Diode", showBodyDiodeSymbol);
        }
    }
    if (n == idx++) return EditInfo("Lambda", lambda).setDimensionless().newColumnMethod();
    if (n == idx++) return EditInfo("Gate-Source Capacitance (Cgs)", capGS);
    if (n == idx) return EditInfo("Gate-Drain Capacitance (Cgd)", capGD);
    return std::nullopt;
}

void MosfetModel::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        name = ei.textf->value;
        if (!name.empty())
            modelMap().set(name, this);
    }
    if (n == 1) threshold = ei.value;
    if (n == 2 && ei.value > 0) beta = ei.value;
    int idx = 3;
    if (!isJfet()) {
        if (n == idx++) {
            bool newVal = ei.checkbox->getState();
            if (newVal != showBulk)
                ei.newDialog = true;
            showBulk = newVal;
        } else if (n == idx++) {
            bool newVal = ei.checkbox->getState();
            if (!showBulk) {
                if (newVal != digitalSymbol)
                    ei.newDialog = true;
                digitalSymbol = newVal;
            } else {
                if (newVal != bodyDiode)
                    ei.newDialog = true;
                bodyDiode = newVal;
            }
        } else if (showBulk && bodyDiode && n == idx++) {
            bodyTerminal = ei.checkbox->getState();
        } else if (showBulk && bodyDiode && n == idx++) {
            showBodyDiodeSymbol = ei.checkbox->getState();
        }
    }
    if (n == idx) lambda = (ei.value >= 0) ? ei.value : lambda;
    else if (n == idx + 1) capGS = (ei.value >= 0) ? ei.value : capGS;
    else if (n == idx + 2) capGD = (ei.value >= 0) ? ei.value : capGD;
    if (app != nullptr)
        app->updateModels();
}

void MosfetModel::pickName() {
    name = isJfet() ? "jfetmodel" : "mosfetmodel";
    if (modelMap().has(name)) {
        for (int num = 2;; num++) {
            std::string n = name + "-" + std::to_string(num);
            if (!modelMap().has(n)) {
                name = n;
                break;
            }
        }
    }
}
