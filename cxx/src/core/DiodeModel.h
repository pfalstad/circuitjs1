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
class DiodeModel {
public:
    static OrderedMap<DiodeModel *> &modelMap();

    int flags = 0;
    std::string name;
    std::optional<std::string> description;
    double saturationCurrent;
    double seriesResistance;
    double emissionCoefficient;
    double breakdownVoltage;

    // used for UI code, not guaranteed to be set
    double forwardVoltage = 0;
    double forwardCurrent = 0;

    bool dumped = false;
    bool readOnly = false;
    bool builtIn = false;
    bool oldStyle = false;
    bool internal = false;
    static constexpr int FLAGS_SIMPLE = 1;

    // Electron thermal voltage at SPICE's default temperature of 27 C (300.15 K):
    static constexpr double vt = 0.025865;
    // The diode's "scale voltage", the voltage increase which will raise current by a factor of e.
    double vscale;
    // The multiplicative equivalent of dividing by vscale (for speed).
    double vdcoef;
    // voltage drop @ 1A
    double fwdrop;

    DiodeModel();
    DiodeModel(const DiodeModel &copy);
    DiodeModel(double sc, double sr, double ec, double bv, std::optional<std::string> d);

    static DiodeModel *getModelWithName(const std::string &name);
    static DiodeModel *getModelWithNameOrCopy(const std::string &name, DiodeModel *oldmodel);
    static void createModelMap();
    static void addDefaultModel(const std::string &name, DiodeModel *dm);
    DiodeModel *setInternal() { internal = true; return this; }
    // create a new model using given parameters, keeping backward compatibility
    static DiodeModel *getModelWithParameters(double fwdrop, double zvoltage);
    static DiodeModel *getDefaultModel() { return getModelWithName("default"); }
    static void loadInternalModel(const std::string &s);
    static void clearDumpedFlags();
    static std::vector<DiodeModel *> getModelList(bool zener);
    std::string getDescription() const;
    static DiodeModel *undumpModel(StringTokenizer &st);
    void undump(StringTokenizer &st);
    static DiodeModel *undumpModelXml(CircuitXMLDeserializer &xml);
    void undumpXml(CircuitXMLDeserializer &xml);
    void setEmissionCoefficient();
    void setForwardVoltage();
    void updateModel();
    std::string dump();
    void dumpXml(XmlElement *root);
    bool isSimple() const { return (flags & FLAGS_SIMPLE) != 0; }
    void setSimple(bool s) { flags = s ? FLAGS_SIMPLE : 0; }
};
