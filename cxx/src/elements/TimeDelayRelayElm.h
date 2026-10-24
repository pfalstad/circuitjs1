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

class TimeDelayRelayElm : public ChipElm {
public:
    ELM_CLASS(TimeDelayRelayElm)
    double lastTransition = 0;
    bool poweredState = false;
    bool onState = false;
    const double vinResistance = 10e3;
    double resistance = 0;
    double onDelay = 0;
    double offDelay = 0;
    double onResistance = 0;
    double offResistance = 0;

    CHIP_CONSTRUCTORS(TimeDelayRelayElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void reset() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    std::string getChipName() override { return "time delay relay"; }
    void setupPins() override;
    bool nonLinear() override { return true; }
    // Vin/gnd (0,1) are joined by the coil resistance and in/out (2,3) by the contact.
    // ChipElm's default says no pins are connected, which would let the circuit be
    // split into separate matrices across the contact.
    bool getConnection(int n1, int n2) override { return n1 / 2 == n2 / 2; }
    void stamp() override;
    void doStep() override;
    void stepFinished() override;
    void draw(Graphics &g) override;
    bool isDigitalChip() override { return false; }
    int getPostCount() override { return 4; }
    int getVoltageSourceCount() override { return 0; }
    int getDumpType() override { return 414; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
};
