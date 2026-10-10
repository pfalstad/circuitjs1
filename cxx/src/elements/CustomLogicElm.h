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

#include "ChipElm.h"

class CustomLogicModel;

class CustomLogicElm : public ChipElm {
public:
    ELM_CLASS(CustomLogicElm)
    std::optional<std::string> modelName;
    int postCount = 0;
    int inputCount = 0;
    int outputCount = 0;
    CustomLogicModel *model = nullptr;
    std::vector<bool> lastValues;
    std::vector<bool> patternValues = std::vector<bool>(26, false);
    std::vector<bool> highImpedance;
    static std::string lastModelName;

    CHIP_CONSTRUCTORS(CustomLogicElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void updateModels() override;
    void setupPins() override;
    int getPostCount() override { return postCount; }
    int getVoltageSourceCount() override { return outputCount; }
    // keep track of whether we have any tri-state outputs.  if not, then we can simplify things quite a bit, making the simulation faster
    bool hasTriState();
    bool nonLinear() override { return hasTriState(); }
    // for tri-state outputs, we need an internal node to connect a voltage source to, and then connect a resistor from there to the output.
    // we do this for all outputs if any of them are tri-state
    int getInternalNodeCount() override { return hasTriState() ? outputCount : 0; }
    bool getMatrixConnection(int n1, int n2) override;
    void stamp() override;
    void doStep() override;
    void execute() override;
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    int getDumpType() override { return 208; }
    std::string getXmlDumpType() override { return "cl"; }
    std::string getElmType() override { return "custom logic"; }
    void getInfo(std::vector<std::string> &arr) override;
};
