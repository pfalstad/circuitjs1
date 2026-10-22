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

#include "TransistorModel.h"

#include <algorithm>

#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "CustomLogicModel.h"
#include "JsNumber.h"
#include "Locale.h"
#include "SimApp.h"
#include "SimulationManager.h"
#include "StringTokenizer.h"
#include "XmlDoc.h"

SimApp *TransistorModel::app = nullptr;

OrderedMap<TransistorModel *> &TransistorModel::modelMap() {
    static OrderedMap<TransistorModel *> m;
    return m;
}

TransistorModel::TransistorModel(const TransistorModel &copy) {
    flags = copy.flags;
    satCur = copy.satCur;
    invRollOffF = copy.invRollOffF;
    BEleakCur = copy.BEleakCur;
    leakBEemissionCoeff = copy.leakBEemissionCoeff;
    invRollOffR = copy.invRollOffR;
    BCleakCur = copy.BCleakCur;
    leakBCemissionCoeff = copy.leakBCemissionCoeff;
    emissionCoeffF = copy.emissionCoeffF;
    emissionCoeffR = copy.emissionCoeffR;
    invEarlyVoltF = copy.invEarlyVoltF;
    invEarlyVoltR = copy.invEarlyVoltR;
    betaR = copy.betaR;
    junctionCapBE = copy.junctionCapBE;
    junctionPotBE = copy.junctionPotBE;
    junctionExpBE = copy.junctionExpBE;
    junctionCapBC = copy.junctionCapBC;
    junctionPotBC = copy.junctionPotBC;
    junctionExpBC = copy.junctionExpBC;
    transitTimeF = copy.transitTimeF;
    transitTimeR = copy.transitTimeR;
    updateModel();
}

TransistorModel::TransistorModel(const std::string &d, double sc) {
    description = d;
    satCur = sc;
    updateModel();
}

TransistorModel *TransistorModel::getModelWithName(const std::string &name) {
    createModelMap();
    if (TransistorModel **lm = modelMap().get(name))
        return *lm;
    TransistorModel *lm = new TransistorModel();
    lm->name = name;
    modelMap().set(name, lm);
    return lm;
}

TransistorModel *TransistorModel::getModelWithNameOrCopy(const std::string &name, TransistorModel *oldmodel) {
    createModelMap();
    if (TransistorModel **lm = modelMap().get(name))
        return *lm;
    if (oldmodel == nullptr) {
        SimulationManager::console("model not found: " + name);
        return getDefaultModel();
    }
    TransistorModel *copy = new TransistorModel(*oldmodel);
    copy->name = name;
    modelMap().set(name, copy);
    return copy;
}

void TransistorModel::createModelMap() {
    static bool created = false;
    if (created)
        return;
    created = true;
    addDefaultModel("default", new TransistorModel("default", 1e-13));
    addDefaultModel("spice-default", new TransistorModel("spice-default", 1e-16));
    // for LM324v2 OpAmpRealElm
    loadInternalModel("xlm324v2-qpi 0 1.01e-16 333.3333333333333 0 1.5 0 0 2 1 1 0.0034482758620689655 0 1");
    loadInternalModel("xlm324v2-qpi 0 1.01e-16 333.3333333333333 0 1.5 0 0 2 1 1 0.0034482758620689655 0 1");
    loadInternalModel("xlm324v2-qpa 0 1.01e-16 333.3333333333333 0 1.5 0 0 2 1 1 0.004081632653061225 0 1");
    loadInternalModel("xlm324v2-qnq 0 1e-16 200 0 1.5 0 0 2 1 1 0 0 1");
    loadInternalModel("xlm324v2-qpq 0 1e-16 333.3333333333333 0 1.5 0 0 2 1 1 0 0 1");
    // for TL431
    loadInternalModel("~tl431ed-qn_ed 0 1e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
    loadInternalModel("~tl431ed-qn_ed-A1.2 0 1.2e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
    loadInternalModel("~tl431ed-qn_ed-A2.2 0 2.2000000000000002e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
    loadInternalModel("~tl431ed-qn_ed-A0.5 0 5e-17 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
    loadInternalModel("~tl431ed-qp_ed 0 1e-16 0 0 1.5 0 0 2 1 1 0.014285714285714285 0.025 1");
    loadInternalModel("~tl431ed-qn_ed-A5 0 5e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
    // for LM317
    loadInternalModel("~lm317-qpl-A0.1 0 1e-17 0 0 1.5 0 0 2 1 1 0.02 0 1");
    loadInternalModel("~lm317-qnl-A0.2 0 2e-17 0 0 1.5 0 0 2 1 1 0.01 0 1");
    loadInternalModel("~lm317-qpl-A0.2 0 2e-17 0 0 1.5 0 0 2 1 1 0.02 0 1");
    loadInternalModel("~lm317-qnl-A2 0 2e-16 0 0 1.5 0 0 2 1 1 0.01 0 1");
    loadInternalModel("~lm317-qpl-A2 0 2e-16 0 0 1.5 0 0 2 1 1 0.02 0 1");
    loadInternalModel("~lm317-qnl-A5 0 5e-16 0 0 1.5 0 0 2 1 1 0.01 0 1");
    loadInternalModel("~lm317-qnl-A50 0 5e-15 0 0 1.5 0 0 2 1 1 0.01 0 1");
}

void TransistorModel::addDefaultModel(const std::string &name, TransistorModel *dm) {
    modelMap().set(name, dm);
    dm->readOnly = dm->builtIn = true;
    dm->name = name;
}

void TransistorModel::clearDumpedFlags() {
    for (auto &kv : modelMap())
        kv.second->dumped = false;
}

void TransistorModel::loadInternalModel(const std::string &s) {
    StringTokenizer st(s);
    TransistorModel *tm = undumpModel(st);
    tm->builtIn = tm->internal = true;
}

TransistorModel *TransistorModel::undumpModel(StringTokenizer &st) {
    std::string name = CustomLogicModel::unescape(st.nextToken());
    TransistorModel *dm = getModelWithName(name);
    dm->undump(st);
    return dm;
}

void TransistorModel::undump(StringTokenizer &st) {
    flags = parseIntStrict(st.nextToken());
    satCur = parseFloatStrict(st.nextToken());
    invRollOffF = parseFloatStrict(st.nextToken());
    BEleakCur = parseFloatStrict(st.nextToken());
    leakBEemissionCoeff = parseFloatStrict(st.nextToken());
    invRollOffR = parseFloatStrict(st.nextToken());
    BCleakCur = parseFloatStrict(st.nextToken());
    leakBCemissionCoeff = parseFloatStrict(st.nextToken());
    emissionCoeffF = parseFloatStrict(st.nextToken());
    emissionCoeffR = parseFloatStrict(st.nextToken());
    invEarlyVoltF = parseFloatStrict(st.nextToken());
    invEarlyVoltR = parseFloatStrict(st.nextToken());
    betaR = parseFloatStrict(st.nextToken());
    // Junction capacitance params (optional, for backward compatibility)
    try {
        junctionCapBE = parseFloatStrict(st.nextToken());
        junctionPotBE = parseFloatStrict(st.nextToken());
        junctionExpBE = parseFloatStrict(st.nextToken());
        junctionCapBC = parseFloatStrict(st.nextToken());
        junctionPotBC = parseFloatStrict(st.nextToken());
        junctionExpBC = parseFloatStrict(st.nextToken());
    } catch (...) {}
    try {
        transitTimeF = parseFloatStrict(st.nextToken());
        transitTimeR = parseFloatStrict(st.nextToken());
    } catch (...) {}
    updateModel();
}

void TransistorModel::dumpXml(XmlElement *root) {
    dumped = true;
    XmlElement *elem = root->createChild("tm");
    CircuitXMLSerializer::dumpAttr(elem, "nm", name);
    CircuitXMLSerializer::dumpAttr(elem, "f", flags);
    CircuitXMLSerializer::dumpAttr(elem, "is", satCur);
    CircuitXMLSerializer::dumpAttr(elem, "ikf", invRollOffF);
    CircuitXMLSerializer::dumpAttr(elem, "ise", BEleakCur);
    CircuitXMLSerializer::dumpAttr(elem, "ne", leakBEemissionCoeff);
    CircuitXMLSerializer::dumpAttr(elem, "ikr", invRollOffR);
    CircuitXMLSerializer::dumpAttr(elem, "isc", BCleakCur);
    CircuitXMLSerializer::dumpAttr(elem, "nc", leakBCemissionCoeff);
    CircuitXMLSerializer::dumpAttr(elem, "nf", emissionCoeffF);
    CircuitXMLSerializer::dumpAttr(elem, "nr", emissionCoeffR);
    CircuitXMLSerializer::dumpAttr(elem, "vaf", invEarlyVoltF);
    CircuitXMLSerializer::dumpAttr(elem, "var", invEarlyVoltR);
    CircuitXMLSerializer::dumpAttr(elem, "br", betaR);
    if (junctionCapBE != 0) {
        CircuitXMLSerializer::dumpAttr(elem, "cje", junctionCapBE);
        CircuitXMLSerializer::dumpAttr(elem, "vje", junctionPotBE);
        CircuitXMLSerializer::dumpAttr(elem, "mje", junctionExpBE);
    }
    if (junctionCapBC != 0) {
        CircuitXMLSerializer::dumpAttr(elem, "cjc", junctionCapBC);
        CircuitXMLSerializer::dumpAttr(elem, "vjc", junctionPotBC);
        CircuitXMLSerializer::dumpAttr(elem, "mjc", junctionExpBC);
    }
    if (transitTimeF != 0)
        CircuitXMLSerializer::dumpAttr(elem, "tf", transitTimeF);
    if (transitTimeR != 0)
        CircuitXMLSerializer::dumpAttr(elem, "tr", transitTimeR);
}

TransistorModel *TransistorModel::undumpModelXml(CircuitXMLDeserializer &xml) {
    std::string name = xml.parseStringAttr("nm", std::nullopt).value_or("");
    TransistorModel *tm = getModelWithName(name);
    tm->undumpXml(xml);
    return tm;
}

void TransistorModel::undumpXml(CircuitXMLDeserializer &xml) {
    flags = xml.parseIntAttr("f", flags);
    satCur = xml.parseDoubleAttr("is", satCur);
    invRollOffF = xml.parseDoubleAttr("ikf", invRollOffF);
    BEleakCur = xml.parseDoubleAttr("ise", BEleakCur);
    leakBEemissionCoeff = xml.parseDoubleAttr("ne", leakBEemissionCoeff);
    invRollOffR = xml.parseDoubleAttr("ikr", invRollOffR);
    BCleakCur = xml.parseDoubleAttr("isc", BCleakCur);
    leakBCemissionCoeff = xml.parseDoubleAttr("nc", leakBCemissionCoeff);
    emissionCoeffF = xml.parseDoubleAttr("nf", emissionCoeffF);
    emissionCoeffR = xml.parseDoubleAttr("nr", emissionCoeffR);
    invEarlyVoltF = xml.parseDoubleAttr("vaf", invEarlyVoltF);
    invEarlyVoltR = xml.parseDoubleAttr("var", invEarlyVoltR);
    betaR = xml.parseDoubleAttr("br", betaR);
    junctionCapBE = xml.parseDoubleAttr("cje", junctionCapBE);
    junctionPotBE = xml.parseDoubleAttr("vje", junctionPotBE);
    junctionExpBE = xml.parseDoubleAttr("mje", junctionExpBE);
    junctionCapBC = xml.parseDoubleAttr("cjc", junctionCapBC);
    junctionPotBC = xml.parseDoubleAttr("vjc", junctionPotBC);
    junctionExpBC = xml.parseDoubleAttr("mjc", junctionExpBC);
    transitTimeF = xml.parseDoubleAttr("tf", transitTimeF);
    transitTimeR = xml.parseDoubleAttr("tr", transitTimeR);
    updateModel();
}

std::vector<TransistorModel *> TransistorModel::getModelList() {
    std::vector<TransistorModel *> vector;
    for (auto &kv : modelMap()) {
        TransistorModel *dm = kv.second;
        if (dm->internal)
            continue;
        if (std::find(vector.begin(), vector.end(), dm) == vector.end())
            vector.push_back(dm);
    }
    std::sort(vector.begin(), vector.end(), [](TransistorModel *a, TransistorModel *b) { return a->name < b->name; });
    return vector;
}

std::string TransistorModel::getDescription() const {
    if (!description || *description == name)
        return name;
    return name + " (" + Locale::LS(*description) + ")";
}

std::optional<EditInfo> TransistorModel::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Model Name", 0);
        ei.text = name;
        return ei;
    }
    if (n == 1) return EditInfo("Transport Saturation Current (IS)", satCur);
    if (n == 2) return EditInfo("Reverse Beta (BR)", betaR);
    if (n == 3) return EditInfo("Forward Early Voltage (VAF)", 1 / invEarlyVoltF);
    if (n == 4) return EditInfo("Reverse Early Voltage (VAR)", 1 / invEarlyVoltR);
    if (n == 5) return EditInfo("Corner For Forward Beta High Current Roll-Off (IKF)", 1 / invRollOffF);
    if (n == 6) return EditInfo("Corner For Reverse Beta High Current Roll-Off (IKR)", 1 / invRollOffR);
    if (n == 7) return EditInfo("Forward Current Emission Coefficient (NF)", emissionCoeffF);
    if (n == 8) return EditInfo("Reverse Current Emission Coefficient (NR)", emissionCoeffR);
    if (n == 9) return EditInfo("B-E Leakage Saturation Current (ISE)", BEleakCur);
    if (n == 10) return EditInfo("B-E Leakage Emission Coefficient (NE)", leakBEemissionCoeff);
    if (n == 11) return EditInfo("B-C Leakage Saturation Current (ISC)", BCleakCur);
    if (n == 12) return EditInfo("B-C Leakage Emission Coefficient (NC)", leakBCemissionCoeff);
    if (n == 13) return EditInfo("B-E Zero-Bias Junction Capacitance (CJE)", junctionCapBE);
    if (n == 14) return EditInfo("B-E Junction Potential (VJE)", junctionPotBE).setPositive();
    if (n == 15) return EditInfo("B-E Junction Grading Coefficient (MJE)", junctionExpBE).setPositive();
    if (n == 16) return EditInfo("B-C Zero-Bias Junction Capacitance (CJC)", junctionCapBC);
    if (n == 17) return EditInfo("B-C Junction Potential (VJC)", junctionPotBC).setPositive();
    if (n == 18) return EditInfo("B-C Junction Grading Coefficient (MJC)", junctionExpBC).setPositive();
    if (n == 19) return EditInfo("Forward Transit Time TF (s)", transitTimeF);
    if (n == 20) return EditInfo("Reverse Transit Time TR (s)", transitTimeR);
    return std::nullopt;
}

void TransistorModel::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        name = ei.textf->value;
        if (!name.empty())
            modelMap().set(name, this);
    }
    if (n == 1) satCur = ei.value;
    if (n == 2) betaR = ei.value;
    if (n == 3) invEarlyVoltF = 1 / ei.value;
    if (n == 4) invEarlyVoltR = 1 / ei.value;
    if (n == 5) invRollOffF = 1 / ei.value;
    if (n == 6) invRollOffR = 1 / ei.value;
    if (n == 7) emissionCoeffF = ei.value;
    if (n == 8) emissionCoeffR = ei.value;
    if (n == 9) BEleakCur = ei.value;
    if (n == 10) leakBEemissionCoeff = ei.value;
    if (n == 11) BCleakCur = ei.value;
    if (n == 12) leakBCemissionCoeff = ei.value;
    if (n == 13) junctionCapBE = ei.value;
    if (n == 14) junctionPotBE = ei.value;
    if (n == 15) junctionExpBE = ei.value;
    if (n == 16) junctionCapBC = ei.value;
    if (n == 17) junctionPotBC = ei.value;
    if (n == 18) junctionExpBC = ei.value;
    if (n == 19) {
        if (ei.value >= 0) transitTimeF = ei.value;
        else ei.setError("must be >= 0");
    }
    if (n == 20) {
        if (ei.value >= 0) transitTimeR = ei.value;
        else ei.setError("must be >= 0");
    }
    updateModel();
    if (app != nullptr)
        app->updateModels();
}

void TransistorModel::pickName() {
    name = "transistormodel";
    if (modelMap().has(name)) {
        for (int num = 2;; num++) {
            std::string n = name + "-" + std::to_string(num);
            if (!modelMap().has(n)) {
                name = n;
                break;
            }
        }
    }
    modelMap().set(name, this);
}
