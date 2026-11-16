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

#include "StopTriggerElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

StopTriggerElm::StopTriggerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    triggerVoltage = parseFloatStrict(st.nextToken());
    type = parseIntStrict(st.nextToken());
    delay = parseFloatStrict(st.nextToken());
    count = 1;
}

void StopTriggerElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "tv", triggerVoltage);
    CircuitXMLSerializer::dumpAttr(elem, "tp", type);
    CircuitXMLSerializer::dumpAttr(elem, "dl", delay);
    CircuitXMLSerializer::dumpAttr(elem, "ct", count);
    CircuitXMLSerializer::dumpAttr(elem, "rd", requiredDuration);
}

void StopTriggerElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    triggerVoltage = xml.parseDoubleAttr("tv", triggerVoltage);
    type = xml.parseIntAttr("tp", type);
    delay = xml.parseDoubleAttr("dl", delay);
    count = xml.parseIntAttr("ct", 1);
    if (count < 1)
        count = 1;
    requiredDuration = xml.parseDoubleAttr("rd", 0);
}

void StopTriggerElm::reset() {
    triggered = false;
    conditionActive = false;
    durationMet = false;
    triggerCount = 0;
    armed = false;  // must see the condition go false before it can trigger
}

void StopTriggerElm::setPoints() {
    CircuitElm::setPoints();
    lead1 = interpPoint(point1, point2, 1 - 8 / dn);
}

void StopTriggerElm::draw(Graphics &g) {
    g.save();
    bool sel = needsHighlight() || stopped;
    g.setFont(Font("SansSerif", sel ? Font::BOLD : 0, 14));
    g.setColor(sel ? selectColor : whiteColor);
    setBbox(point1, lead1, 0);
    drawLabeledNode(g, Locale::LS("trigger"), point1, lead1);
    setVoltageColor(g, nodes[0]->v);
    if (sel)
        g.setColor(selectColor);
    drawThickLine(g, point1, lead1);
    drawPosts(g);
    g.restore();
}

void StopTriggerElm::stepFinished() {
    stopped = false;
    bool condition = (type == 0 && nodes[0]->v >= triggerVoltage) ||
        (type == 1 && nodes[0]->v <= triggerVoltage);
    if (!condition)
        armed = true;
    // ignore the condition until armed, i.e. only a false->true transition starts it
    if (armed && !conditionActive && condition) {
        conditionActive = true;
        conditionStartTime = sim->t;
        durationMet = false;
    }
    if (conditionActive && condition && !durationMet &&
            sim->t - conditionStartTime >= requiredDuration) {
        durationMet = true;
        triggerCount++;
        if (!triggered && triggerCount >= count) {
            triggered = true;
            triggerTime = sim->t;
        }
    }
    if (conditionActive && !condition)
        conditionActive = false;
    if (triggered && sim->t >= triggerTime + delay) {
        triggered = false;
        triggerCount = 0;
        stopped = true;
        app->setSimRunning(false);
    }
}

void StopTriggerElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "stop trigger";
    arr[1] = "V = " + getVoltageText(nodes[0]->v);
    arr[2] = "Vtrigger = " + getVoltageText(triggerVoltage);
    if (triggered)
        arr[3] = "stopping in " + getUnitText(triggerTime + delay - sim->t, "s");
    else if (stopped)
        arr[3] = "stopped";
    else
        arr[3] = "waiting";
    if (!stopped && count > 1)
        arr[3] += " (" + std::to_string(std::min(triggerCount, count)) + "/" + std::to_string(count) + ")";
}

std::optional<EditInfo> StopTriggerElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Voltage", triggerVoltage).setUnitStep();
    if (n == 1) {
        EditInfo ei("Trigger Type", type, -1, -1);
        ei.choice = Choice();
        ei.choice->add(">=");
        ei.choice->add("<=");
        ei.choice->select(type);
        return ei;
    }
    if (n == 2)
        return EditInfo("Delay (s)", delay);
    if (n == 3)
        return EditInfo("Required Duration (s)", requiredDuration);
    if (n == 4) {
        EditInfo ei("Required Count", count, -1, -1);
        return ei.setDimensionless().setPositive();
    }
    return std::nullopt;
}

void StopTriggerElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        triggerVoltage = ei.value;
    if (n == 1)
        type = ei.choice->getSelectedIndex();
    if (n == 2)
        delay = ei.value;
    if (n == 3) {
        requiredDuration = ei.value;
        if (requiredDuration < 0)
            requiredDuration = 0;
    }
    if (n == 4) {
        count = (int) std::trunc(ei.value);
        if (count < 1)
            count = 1;
    }
}
