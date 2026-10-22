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

// contributed by Edward Calver
class SipoShiftElm : public ChipElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(SipoShiftElm)
    static constexpr int DATA_PIN_INDEX = 2;
    bool clockstate = false;

    CHIP_CONSTRUCTORS(SipoShiftElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 189; }
    std::string getChipName() override { return "SIPO shift register"; }
    bool needsBits() override { return true; }
    int defaultBitCount() override { return 8; }
    void setupPins() override;
    int getPostCount() override { return 2 + bits; }
    int getVoltageSourceCount() override { return bits; }
    void execute() override;
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
