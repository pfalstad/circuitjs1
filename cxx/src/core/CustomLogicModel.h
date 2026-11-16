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
class StringTokenizer;
class XmlElement;

class CustomLogicModel : public Editable, public RegistryModel {
public:
    static constexpr int FLAG_SCHMITT = 1;
    // (models are never freed: elements may still use one that's been removed from the registry)
    static ModelRegistry<CustomLogicModel> &registry();
    int flags = 0;
    std::vector<std::string> inputs;
    std::vector<std::string> outputs;
    std::string infoText;
    std::string rules;
    std::vector<std::string> rulesLeft;
    std::vector<std::string> rulesRight;
    bool triState = false;

    CustomLogicModel();
    CustomLogicModel(const CustomLogicModel &copy) = default;

    static CustomLogicModel *getModelWithName(const std::string &name);
    static CustomLogicModel *getModelWithNameOrCopy(const std::string &name, const CustomLogicModel *oldmodel);
    static void undumpModel(StringTokenizer &st);
    void undump(StringTokenizer &st);
    static CustomLogicModel *undumpModelXml(CircuitXMLDeserializer &xml);
    void undumpXml(CircuitXMLDeserializer &xml);
    std::string arrayToList(const std::vector<std::string> &arr);
    std::vector<std::string> listToArray(const std::string &arr);
    std::string getEditTitle() override { return "Edit Custom Logic Model"; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void parseRules(EditInfo *ei);
    void dumpXml(XmlElement *root);

    static std::string escape(const std::string &s);
    static std::string unescape(const std::string &s);

    // the app to tell when a model changes (TS: CirSim.theApp.updateModels())
    static SimApp *app;

private:
    static CustomLogicModel *getModelForLoad(const std::string &name);
};
