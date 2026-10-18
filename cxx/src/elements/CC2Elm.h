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

class CC2Elm : public ChipElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(CC2Elm)
    double gain = 1;

    CHIP_CONSTRUCTORS(CC2Elm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    std::string getChipName() override { return "CC2"; }
    void setupPins() override;
    std::string getElmType() override { return "CCII"; }
    void getInfo(std::vector<std::string> &arr) override;
    bool isDigitalChip() override { return false; }
    void stamp() override;
    void calculateCurrent() override;
    int getPostCount() override { return 3; }
    int getVoltageSourceCount() override { return 1; }
    int getDumpType() override { return 179; }
    bool getMatrixConnection(int, int) override { return true; }
};
