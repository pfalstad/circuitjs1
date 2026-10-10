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

#pragma once

#include <optional>
#include <string>
#include <vector>

#include "OrderedMap.h"

class StringTokenizer;
class CircuitXMLDeserializer;
class XmlElement;

// Models live for the whole session in modelMap, which owns them.
class TransistorModel {
public:
    static OrderedMap<TransistorModel *> &modelMap();

    int flags = 0;
    std::string name;
    std::optional<std::string> description;
    double satCur = 0;
    double invRollOffF = 0;
    double BEleakCur = 0;
    double leakBEemissionCoeff = 1.5;
    double invRollOffR = 0;
    double BCleakCur = 0;
    double leakBCemissionCoeff = 2;
    double emissionCoeffF = 1;
    double emissionCoeffR = 1;
    double invEarlyVoltF = 0;
    double invEarlyVoltR = 0;
    double betaR = 1;
    // Junction capacitance parameters (SPICE Gummel-Poon charge storage).
    // SPICE formula:  C(V) = Cj0 / (1 - V/Vj)^Mj   for V < 0.5*Vj
    //                 (linear extrapolation above 0.5*Vj to avoid singularity)
    double junctionCapBE = 0;      // CJE: zero-bias BE depletion capacitance (F), 0=disabled
    double junctionCapBC = 0;      // CJC: zero-bias BC depletion capacitance (F), 0=disabled
    double junctionPotBE = 0.75;   // VJE: BE built-in potential (V)
    double junctionPotBC = 0.75;   // VJC: BC built-in potential (V)
    double junctionExpBE = 0.33;   // MJE: BE junction grading coefficient
    double junctionExpBC = 0.33;   // MJC: BC junction grading coefficient
    // Transit time parameters (SPICE Gummel-Poon diffusion charge storage)
    double transitTimeF = 0;       // TF: forward transit time (s), 0=disabled
    double transitTimeR = 0;       // TR: reverse transit time (s), 0=disabled
    bool dumped = false;
    bool readOnly = false;
    bool builtIn = false;
    bool internal = false;

    TransistorModel() { updateModel(); }
    TransistorModel(const TransistorModel &copy);
    TransistorModel(const std::string &d, double sc);

    static TransistorModel *getModelWithName(const std::string &name);
    static TransistorModel *getModelWithNameOrCopy(const std::string &name, TransistorModel *oldmodel);
    static void createModelMap();
    static void addDefaultModel(const std::string &name, TransistorModel *dm);
    static TransistorModel *getDefaultModel() { return getModelWithName("default"); }
    static void clearDumpedFlags();
    static std::vector<TransistorModel *> getModelList();
    std::string getDescription() const;
    static void loadInternalModel(const std::string &s);
    static TransistorModel *undumpModel(StringTokenizer &st);
    void undump(StringTokenizer &st);
    void updateModel() {}
    void dumpXml(XmlElement *root);
    static TransistorModel *undumpModelXml(CircuitXMLDeserializer &xml);
    void undumpXml(CircuitXMLDeserializer &xml);
};
