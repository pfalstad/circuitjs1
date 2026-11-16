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

class StringTokenizer;
class CircuitXMLDeserializer;
class SimApp;
class XmlElement;

// Models are never freed: elements may still use one that's been removed from the registry.
class MosfetModel : public Editable, public RegistryModel {
public:
    static ModelRegistry<MosfetModel> &registry();

    static constexpr int FLAG_JFET = 1;

    int flags = 0;
    std::optional<std::string> description;
    double threshold = 0;  // Vt: threshold voltage (V)
    double beta = 0;       // transconductance parameter (A/V^2)
    double lambda = 0;     // channel-length modulation (1/V), 0=ideal
    double capGS = 0;      // Cgs: gate-source capacitance (F), 0=disabled
    double capGD = 0;      // Cgd: gate-drain capacitance (F), 0=disabled

    // these describe how parts using this model are drawn/simulated; they were formerly
    // per-element (or, worse, circuit-wide) flags, but they really describe the physical
    // part, e.g. whether it exposes a 4th body terminal or has a body diode, so they belong
    // on the model.  Not used for JFETs (isJfet() true), which never show the bulk/body.
    bool showBulk = false;
    bool digitalSymbol = false;        // draw as a simple digital-logic symbol (only if !showBulk)
    bool bodyDiode = false;            // simulate the parasitic body diode (only if showBulk)
    bool bodyTerminal = false;         // expose the body as a 4th terminal (only if bodyDiode)
    bool showBodyDiodeSymbol = false;  // draw the body diode symbol (only if bodyDiode)

    bool readOnly = false;
    bool builtIn = false;
    bool internal = false;
    // true if this model was synthesized from an old circuit file's inline per-element
    // vt/beta values rather than picked/created by the user; see DiodeModel.oldStyle
    bool oldStyle = false;

    MosfetModel();
    MosfetModel(const MosfetModel &copy);
    MosfetModel(const std::string &d, double vt, double b);

    // is this a model meant for use by JfetElm (vs. MosfetElm)?  JFETs and MOSFETs share this
    // one model class since the only real difference between them is which default parameter
    // values make sense; this flag is just used to filter the model-picker dropdown per element type.
    bool isJfet() const { return (flags & FLAG_JFET) != 0; }
    MosfetModel *setJfet() { flags |= FLAG_JFET; return this; }

    static MosfetModel *getModelWithName(const std::string &name);
    static MosfetModel *getModelWithNameOrCopy(const std::string &name, MosfetModel *oldmodel, bool jfet);
    static void createModelMap();
    static void addDefaultModel(const std::string &name, MosfetModel *dm);
    static MosfetModel *getDefaultModel(bool jfet);
    // Find (or create) a model matching the given legacy per-element vt/beta and drawing/behavior
    // flags, for backward compatibility with old circuit files that stored these inline per
    // element instead of by model name.
    static MosfetModel *getModelWithParameters(double vt, double beta, bool jfet, bool showBulk, bool bodyDiode,
                                               bool bodyTerminal, bool digitalSymbol, bool showBodyDiodeSymbol);
    // jfet selects whether to return models meant for JfetElm or for MosfetElm
    static std::vector<MosfetModel *> getModelList(bool jfet);
    std::string getDescription() const;
    static MosfetModel *undumpModel(StringTokenizer &st);
    void undump(StringTokenizer &st);
    void dumpXml(XmlElement *root);
    static MosfetModel *undumpModelXml(CircuitXMLDeserializer &xml);
    void undumpXml(CircuitXMLDeserializer &xml);
    std::string getDialogTitle() { return std::string("Edit ") + (isJfet() ? "JFET" : "MOSFET") + " Model"; }
    std::string getEditTitle() override { return "Edit MOSFET Model"; }
    bool isUserModel() const override { return !(builtIn || internal || readOnly || oldStyle); }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void pickName();

    // the app to tell when a model changes (TS: CirSim.theApp.updateModels())
    static SimApp *app;
};
