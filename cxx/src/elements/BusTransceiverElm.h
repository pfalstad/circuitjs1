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

class BusTransceiverElm : public ChipElm {
public:
    ELM_CLASS(BusTransceiverElm)
    int dataBits = 0;
    int aNodes = 0;
    int bNodes = 0;
    int intNodes = 0;
    std::vector<VoltageSource *> vSources;

    CHIP_CONSTRUCTORS(BusTransceiverElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    bool nonLinear() override { return true; }
    bool allowBus() override { return true; }
    std::string getChipName() override { return "Bus Transceiver"; }
    int defaultBitCount() override { return 4; }
    void setupPins() override;
    int getPostCount() override { return 2 + 2 * dataBits; }
    int getVoltageSourceCount() override { return dataBits; }
    int getInternalNodeCount() override { return dataBits; }
    void setVoltageSource(int j, VoltageSource *vs) override;
    bool getMatrixConnection(int n1, int n2) override;
    void stamp() override;
    void doStep() override;
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
