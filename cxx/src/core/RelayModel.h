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

#include "EditInfo.h"
#include "ModelRegistry.h"

class CircuitXMLDeserializer;
class SimApp;
class XmlElement;

// Models are never freed: elements may still use one that's been removed from the registry.
class RelayModel : public Editable, public RegistryModel {
public:
    static ModelRegistry<RelayModel> &registry();

    int flags = 0;
    std::optional<std::string> description;
    double inductance = .2;
    double r_on = .05;
    double r_off = 1e6;
    double onCurrent = .02;
    double offCurrent = .015;
    double coilR = 20;
    double switchingTime = 5e-3;
    int coilStyle = 0;  // 0=both sides, 1=side1, 2=side2
    int poleCount = 1;
    bool showBox = true;
    bool pulldown = true;

    bool readOnly = false;
    bool builtIn = false;
    bool oldStyle = false;

    RelayModel() = default;
    RelayModel(const RelayModel &copy);

    static RelayModel *getModelWithName(const std::string &name);
    static RelayModel *getModelWithNameOrCopy(const std::string &name, RelayModel *oldmodel);
    static void createModelMap();
    static void addDefaultModel(const std::string &name, RelayModel *rm);
    static RelayModel *getDefaultModel();
    // Create (or find) a model from old-style per-element parameters for backward compatibility.
    static RelayModel *getModelWithParameters(double inductance, double r_on, double r_off, double onCurrent,
                                              double offCurrent, double coilR, double switchingTime, int coilStyle,
                                              bool showBox, bool pulldown, int poleCount);
    static std::vector<RelayModel *> getModelList();
    std::string getDescription() const;
    void pickName();
    void dumpXml(XmlElement *root);
    static RelayModel *undumpModelXml(CircuitXMLDeserializer &xml);
    void undumpXml(CircuitXMLDeserializer &xml);
    std::string getEditTitle() override { return "Edit Relay Model"; }
    bool isUserModel() const override { return !(builtIn || readOnly || oldStyle); }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;

    // the app to tell when a model changes (TS: CirSim.theApp.updateModels())
    static SimApp *app;
};
