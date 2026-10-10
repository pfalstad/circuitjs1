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

#include "JsMath.h"
#include "DiodeModel.h"

#include <cmath>

#include <algorithm>

#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "CustomLogicModel.h"
#include "JsNumber.h"
#include "Locale.h"
#include "SimulationManager.h"
#include "StringTokenizer.h"
#include "XmlDoc.h"

OrderedMap<DiodeModel *> &DiodeModel::modelMap() {
    static OrderedMap<DiodeModel *> m;
    return m;
}

DiodeModel::DiodeModel() {
    saturationCurrent = 1e-14;
    seriesResistance = 0;
    emissionCoefficient = 1;
    breakdownVoltage = 0;
    updateModel();
}

DiodeModel::DiodeModel(const DiodeModel &copy) {
    flags = copy.flags;
    saturationCurrent = copy.saturationCurrent;
    seriesResistance = copy.seriesResistance;
    emissionCoefficient = copy.emissionCoefficient;
    breakdownVoltage = copy.breakdownVoltage;
    forwardCurrent = copy.forwardCurrent;
    updateModel();
}

DiodeModel::DiodeModel(double sc, double sr, double ec, double bv, std::optional<std::string> d) {
    saturationCurrent = sc;
    seriesResistance = sr;
    emissionCoefficient = ec;
    breakdownVoltage = bv;
    description = std::move(d);
    updateModel();
}

DiodeModel *DiodeModel::getModelWithName(const std::string &name) {
    createModelMap();
    if (DiodeModel **lm = modelMap().get(name))
        return *lm;
    DiodeModel *lm = new DiodeModel();
    lm->name = name;
    modelMap().set(name, lm);
    return lm;
}

DiodeModel *DiodeModel::getModelWithNameOrCopy(const std::string &name, DiodeModel *oldmodel) {
    createModelMap();
    if (DiodeModel **lm = modelMap().get(name))
        return *lm;
    if (oldmodel == nullptr) {
        SimulationManager::console("model not found: " + name);
        return getDefaultModel();
    }
    DiodeModel *copy = new DiodeModel(*oldmodel);
    copy->name = name;
    modelMap().set(name, copy);
    return copy;
}

void DiodeModel::createModelMap() {
    static bool created = false;
    if (created)
        return;
    created = true;
    addDefaultModel("spice-default", new DiodeModel(1e-14, 0, 1, 0, std::nullopt));
    addDefaultModel("default", new DiodeModel(1.7143528192808883e-7, 0, 2, 0, std::nullopt));
    addDefaultModel("default-zener", new DiodeModel(1.7143528192808883e-7, 0, 2, 5.6, std::nullopt));

    // old default LED with saturation current that is way too small (causes numerical errors)
    addDefaultModel("old-default-led", (new DiodeModel(2.2349907006671927e-18, 0, 2, 0, std::nullopt))->setInternal());

    // default for newly created LEDs, https://www.diyaudio.com/forums/software-tools/25884-spice-models-led.html
    addDefaultModel("default-led", new DiodeModel(93.2e-12, .042, 3.73, 0, std::nullopt));

    addDefaultModel("default-optocoupler-led", new DiodeModel(1.714e-7, 0., 4.077, 0., std::nullopt));

    // https://www.allaboutcircuits.com/textbook/semiconductors/chpt-3/spice-models/
    addDefaultModel("1N5711", new DiodeModel(315e-9, 2.8, 2.03, 70, "Schottky"));
    addDefaultModel("1N5712", new DiodeModel(680e-12, 12, 1.003, 20, "Schottky"));

    // https://github.com/peteut/spice-models/blob/master/nxp/sbd/sbd.txt
    addDefaultModel("BAT85", new DiodeModel(2.076e-7, 2.326, 1.023, 33, "Schottky"));

    // model is inaccurate
    addDefaultModel("1N34", (new DiodeModel(200e-12, 84e-3, 2.19, 60, "germanium"))->setInternal());

    addDefaultModel("1N4004", new DiodeModel(18.8e-9, 28.6e-3, 2, 400, "general purpose"));

    // http://users.skynet.be/hugocoolens/spice/diodes/1n4148.htm
    addDefaultModel("1N4148", new DiodeModel(4.352e-9, .6458, 1.906, 75, "switching"));
    addDefaultModel("x2n2646-emitter", (new DiodeModel(2.13e-11, 0, 1.8, 0, std::nullopt))->setInternal());

    // for TL431
    loadInternalModel("~tl431ed-d_ed 0 1e-14 5 1 0 0");

    // for LM317
    loadInternalModel("~lm317-dz 0 1e-14 0 1 6.3 0");
}

void DiodeModel::addDefaultModel(const std::string &name, DiodeModel *dm) {
    modelMap().set(name, dm);
    dm->readOnly = dm->builtIn = true;
    dm->name = name;
}

DiodeModel *DiodeModel::getModelWithParameters(double fwdrop, double zvoltage) {
    createModelMap();

    const double emcoef = 2;

    // look for existing model with same parameters
    for (auto &kv : modelMap()) {
        DiodeModel *dm = kv.second;
        if (std::abs(dm->fwdrop - fwdrop) < 1e-8 && dm->seriesResistance == 0 &&
            std::abs(dm->breakdownVoltage - zvoltage) < 1e-8 && dm->emissionCoefficient == emcoef)
            return dm;
    }

    // create a new one, converting to new parameter values
    double vscale = emcoef * vt;
    double vdcoef = 1 / vscale;
    double leakage = 1 / (jsmath::exp(fwdrop * vdcoef) - 1);
    std::string name = "fwdrop=" + jsNumberToString(fwdrop);
    if (zvoltage != 0)
        name = name + " zvoltage=" + jsNumberToString(zvoltage);
    DiodeModel *dm = getModelWithName(name);
    dm->saturationCurrent = leakage;
    dm->emissionCoefficient = emcoef;
    dm->breakdownVoltage = zvoltage;
    dm->readOnly = dm->oldStyle = true;
    dm->updateModel();
    return dm;
}

void DiodeModel::loadInternalModel(const std::string &s) {
    StringTokenizer st(s);
    DiodeModel *dm = undumpModel(st);
    dm->builtIn = dm->internal = true;
}

void DiodeModel::clearDumpedFlags() {
    for (auto &kv : modelMap())
        kv.second->dumped = false;
}

DiodeModel *DiodeModel::undumpModel(StringTokenizer &st) {
    std::string name = CustomLogicModel::unescape(st.nextToken());
    DiodeModel *dm = getModelWithName(name);
    dm->undump(st);
    return dm;
}

void DiodeModel::undump(StringTokenizer &st) {
    flags = parseIntStrict(st.nextToken());
    saturationCurrent = parseFloatStrict(st.nextToken());
    seriesResistance = parseFloatStrict(st.nextToken());
    emissionCoefficient = parseFloatStrict(st.nextToken());
    breakdownVoltage = parseFloatStrict(st.nextToken());
    try {
        forwardCurrent = parseFloatStrict(st.nextToken());
    } catch (...) {}
    updateModel();
}

DiodeModel *DiodeModel::undumpModelXml(CircuitXMLDeserializer &xml) {
    std::string name = xml.parseStringAttr("nm", std::nullopt).value_or("");
    DiodeModel *dm = getModelWithName(name);
    dm->undumpXml(xml);
    return dm;
}

void DiodeModel::undumpXml(CircuitXMLDeserializer &xml) {
    flags = xml.parseIntAttr("f", flags);
    saturationCurrent = xml.parseDoubleAttr("is", saturationCurrent);
    seriesResistance = xml.parseDoubleAttr("rs", seriesResistance);
    emissionCoefficient = xml.parseDoubleAttr("n", emissionCoefficient);
    breakdownVoltage = xml.parseDoubleAttr("bv", breakdownVoltage);
    forwardCurrent = xml.parseDoubleAttr("fi", forwardCurrent);
    updateModel();
}

// set emission coefficient for simple mode if we have enough data
void DiodeModel::setEmissionCoefficient() {
    if (forwardCurrent > 0 && forwardVoltage > 0)
        emissionCoefficient = (forwardVoltage / jsmath::log(forwardCurrent / saturationCurrent + 1)) / vt;
    seriesResistance = 0;
}

void DiodeModel::setForwardVoltage() {
    if (forwardCurrent == 0)
        forwardCurrent = 1;
    forwardVoltage = emissionCoefficient * vt * jsmath::log(forwardCurrent / saturationCurrent + 1);
}

void DiodeModel::updateModel() {
    vscale = emissionCoefficient * vt;
    vdcoef = 1 / vscale;
    fwdrop = jsmath::log(1 / saturationCurrent + 1) * emissionCoefficient * vt;
}

std::string DiodeModel::dump() {
    dumped = true;
    return "34 " + CustomLogicModel::escape(name) + " " + std::to_string(flags) + " " +
        jsNumberToString(saturationCurrent) + " " + jsNumberToString(seriesResistance) + " " +
        jsNumberToString(emissionCoefficient) + " " + jsNumberToString(breakdownVoltage) + " " +
        jsNumberToString(forwardCurrent);
}

void DiodeModel::dumpXml(XmlElement *root) {
    dumped = true;
    XmlElement *elem = root->createChild("dm");
    CircuitXMLSerializer::dumpAttr(elem, "nm", name);
    CircuitXMLSerializer::dumpAttr(elem, "f", flags);
    CircuitXMLSerializer::dumpAttr(elem, "is", saturationCurrent);
    CircuitXMLSerializer::dumpAttr(elem, "rs", seriesResistance);
    CircuitXMLSerializer::dumpAttr(elem, "n", emissionCoefficient);
    CircuitXMLSerializer::dumpAttr(elem, "bv", breakdownVoltage);
    if (forwardCurrent > 0)
        CircuitXMLSerializer::dumpAttr(elem, "fi", forwardCurrent);
}

std::vector<DiodeModel *> DiodeModel::getModelList(bool zener) {
    std::vector<DiodeModel *> vector;
    for (auto &kv : modelMap()) {
        DiodeModel *dm = kv.second;
        if (dm->internal)
            continue;
        if (zener && dm->breakdownVoltage == 0)
            continue;
        if (std::find(vector.begin(), vector.end(), dm) == vector.end())
            vector.push_back(dm);
    }
    std::sort(vector.begin(), vector.end(), [](DiodeModel *a, DiodeModel *b) { return a->name < b->name; });
    return vector;
}

std::string DiodeModel::getDescription() const {
    if (!description)
        return name;
    return name + " (" + Locale::LS(*description) + ")";
}
