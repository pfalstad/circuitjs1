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

class MonostableElm : public ChipElm {
public:
    ELM_CLASS(MonostableElm)
    static constexpr int FLAG_INVERT_TRIGGER = 2;
    bool prevInputValue = false;
    bool retriggerable = false;
    bool triggered = false;
    double lastRisingEdge = 0;
    double delay = 0.01;
    bool invertTrigger() { return (flags & FLAG_INVERT_TRIGGER) != 0; }

    CHIP_CONSTRUCTORS(MonostableElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    std::string getChipName() override { return "Monostable"; }
    void setupPins() override;
    void reset() override;
    int getPostCount() override { return 3; }
    int getVoltageSourceCount() override { return 2; }
    void execute() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 194; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    // TODO: addJSMethods (getPeriod/setPeriod)
};
