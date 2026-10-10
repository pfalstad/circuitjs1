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

class LatchElm : public ChipElm {
public:
    ELM_CLASS(LatchElm)
    static constexpr int FLAG_STATE = 2;
    static constexpr int FLAG_NO_EDGE = 4;
    static constexpr int FLAG_RESET = 8;
    static constexpr int FLAG_SET = 16;
    // enable mode stored in bits 5-6: 0=none, 1=one each, 2=two each
    static constexpr int FLAG_ENABLE_MASK = 32 | 64;
    static constexpr int FLAG_ENABLE_SHIFT = 5;
    static constexpr int FLAG_RESET_INVERT = 128;
    bool hasReset() { return (flags & FLAG_RESET) != 0; }
    bool hasSet() { return (flags & FLAG_SET) != 0; }
    bool resetActiveLow() { return (flags & FLAG_RESET_INVERT) != 0; }
    int enableMode() { return (flags & FLAG_ENABLE_MASK) >> FLAG_ENABLE_SHIFT; }
    int inputEnableCount() { return enableMode(); }
    int outputEnableCount() { return enableMode(); }
    bool hasOutputEnable() { return enableMode() > 0; }
    // pin indices, set by setupPins()
    int loadPin = 0, resetPin = 0, setPin = 0, ie1Pin = 0, ie2Pin = 0, oe1Pin = 0, oe2Pin = 0;
    int intNodes = 0;
    std::vector<VoltageSource *> vSources;
    bool lastLoad = false;
    std::vector<bool> outputValues;  // empty until first used

    CHIP_CONSTRUCTORS(LatchElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    std::string getChipName() override { return isEdgeTriggered() ? "Register" : "Latch"; }
    bool needsBits() override { return true; }
    bool allowBus() override { return true; }
    bool isEdgeTriggered() { return (flags & FLAG_NO_EDGE) == 0; }
    bool nonLinear() override { return hasOutputEnable(); }
    void setupPins() override;
    std::vector<bool> &lastOutputValues();
    void restoreOutputValues();
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void reset() override;
    void execute() override;
    void doLoad();
    void startIteration() override;
    void doStep() override;
    void stamp() override;
    int getVoltageSourceCount() override { return bits; }
    int getInternalNodeCount() override { return hasOutputEnable() ? bits : 0; }
    void setVoltageSource(int j, VoltageSource *vs) override;
    bool getMatrixConnection(int n1, int n2) override;
    bool getConnection(int, int) override { return false; }
    bool hasGroundConnection(int n1) override;
    int getPostCount() override;
    int getDumpType() override { return 168; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
