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

#include "../core/CircuitElm.h"

class StopTriggerElm : public CircuitElm {
public:
    ELM_CLASS(StopTriggerElm)
    double triggerVoltage = 1;
    bool triggered = false;
    bool stopped = false;
    bool conditionActive = false;
    bool durationMet = false;
    // armed: we've seen the condition false at least once since reset, so a later
    // true counts as a real transition (edge).  Without this, a condition that is
    // already true when the circuit loads/resets would stop the sim on the first step.
    bool armed = false;
    double delay = 0;
    double triggerTime = 0;
    double requiredDuration = 0;
    double conditionStartTime = 0;
    int type = 0;
    int count = 1;
    int triggerCount = 0;

    StopTriggerElm(int xx, int yy) : CircuitElm(xx, yy) {}
    StopTriggerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void reset() override;
    int getDumpType() override { return 408; }
    int getPostCount() override { return 1; }
    void setPoints() override;
    void draw(Graphics &g) override;
    void stepFinished() override;
    double getVoltageDiff() override { return nodes[0]->v; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
