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

class AnalogMuxElm : public ChipElm {
public:
    ELM_CLASS(AnalogMuxElm)
    static constexpr int FLAG_PULLDOWN = 2;
    int selectBitCount = 2;
    int inputCount = 0;
    int outputPin = 0;
    double r_on = 20;
    double r_off = 1e10;
    double threshold = 2.5;

    CHIP_CONSTRUCTORS(AnalogMuxElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    bool hasReset() { return false; }
    std::string getChipName() override { return "Analog Mux"; }
    bool nonLinear() override { return true; }
    int getDumpType() override { return 432; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setupPins() override;
    int getPostCount() override { return inputCount + selectBitCount + 1; }
    int getVoltageSourceCount() override { return 0; }
    bool needsPulldown() { return hasFlag(FLAG_PULLDOWN); }
    void stamp() override;
    void doStep() override;
    void calculateCurrent() override;
    bool getConnection(int n1, int n2) override;
    bool hasGroundConnection(int n1) override { return needsPulldown() && n1 < inputCount; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;

private:
    int selectedInput();
};
