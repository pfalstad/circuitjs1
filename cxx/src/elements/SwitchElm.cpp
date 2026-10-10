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

#include "SwitchElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/JsMath.h"
#include <cctype>

SwitchElm::SwitchElm(int xx, int yy, bool mm) : CircuitElm(xx, yy) {
    position = mm ? 1 : 0;
    momentary = mm;
    posCount = 2;
}

SwitchElm::SwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st, bool isLogicInput)
    : CircuitElm(xa, ya, xb, yb, f) {
    std::string str = st.nextToken();
    if (str == "true")
        position = isLogicInput ? 0 : 1;
    else if (str == "false")
        position = isLogicInput ? 1 : 0;
    else
        position = parseIntStrict(str);
    momentary = st.nextToken() == "true";
    posCount = 2;
    if ((flags & FLAG_LABEL) != 0)
        label = st.nextToken();
}

void SwitchElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    if (position != 0)
        CircuitXMLSerializer::dumpAttr(elem, "p", position);
    if (momentary)
        CircuitXMLSerializer::dumpAttr(elem, "mm", momentary);
    if (label)
        CircuitXMLSerializer::dumpAttr(elem, "lab", *label);
    if (keyShortcut)
        CircuitXMLSerializer::dumpAttr(elem, "key", *keyShortcut);
    if (resistance != 0)
        CircuitXMLSerializer::dumpAttr(elem, "r", resistance);
}

void SwitchElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    position = xml.parseIntAttr("p", position);
    momentary = xml.parseBooleanAttr("mm", momentary);
    label = xml.parseStringAttr("lab", label);
    keyShortcut = xml.parseStringAttr("key", keyShortcut);
    resistance = xml.parseDoubleAttr("r", 0);
}

void SwitchElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(32);
    ps = Point();
    ps2 = Point();

    if (useIECSymbol()) {
        extraPoints = newPointArray(7);
        interpPoint(lead1, lead2, extraPoints[0], .5, openhs / 2);
        interpPoint(lead1, lead2, extraPoints[1], .5, 24);
        interpPoint(lead1, lead2, extraPoints[2], .5 - .1, 24);
        interpPoint(lead1, lead2, extraPoints[3], .5 + .1, 24);
        interpPoint(lead1, lead2, extraPoints[4], .5, 19);
        interpPoint(lead1, lead2, extraPoints[5], .5 - .1, 16);
        interpPoint(lead1, lead2, extraPoints[6], .5, 13);
    }
}

void SwitchElm::calculateCurrent() {
    if (position == 1)
        current = 0;
    else if (resistance > 0)
        current = (nodes[0]->v - nodes[1]->v) / resistance;
    else if (parent != nullptr)
        current = (nodes[0]->v - nodes[1]->v) / COMPOSITE_CLOSED_R;
}

void SwitchElm::mouseUp() {
    if (momentary)
        toggle();
}

void SwitchElm::simpleToggle() {
    position++;
    if (position >= posCount)
        position = 0;
}

void SwitchElm::toggle() {
    simpleToggle();
    if (label) {
        for (CircuitElm *o : sim->elmList) {
            SwitchElm *s2 = dynamic_cast<SwitchElm *>(o);
            if (s2 != nullptr && s2 != this && label == s2->label)
                s2->simpleToggle();
        }
    }
}

void SwitchElm::stamp() {
    if (position == 0) {
        if (resistance > 0)
            sim->stampResistor(nodes[0], nodes[1], resistance);
        else if (parent != nullptr)
            sim->stampResistor(nodes[0], nodes[1], COMPOSITE_CLOSED_R);
    }
}

void SwitchElm::draw(Graphics &g) {
    int hs1 = (position == 1) ? 0 : 2;
    int hs2 = (position == 1) ? openhs : 2;
    setBbox(point1, point2, openhs);

    draw2Leads(g);

    if (position == 0)
        doDots(g);

    if (!needsHighlight())
        g.setColor(whiteColor);
    interpPoint(lead1, lead2, ps, 0, hs1);
    interpPoint(lead1, lead2, ps2, 1, hs2);

    drawThickLine(g, ps, ps2);

    if (label) {
        g.setColor(needsHighlight() ? selectColor : whiteColor);
        if (std::abs(dy) > std::abs(dx))
            g.drawString(*label, x + 10, (y < y2 ? lead1 : lead2).y - 5);
        else {
            g.save();
            g.setTextAlign(Graphics::ALIGN_CENTER);
            g.drawString(*label, (x + x2) / 2.0, (x2 > x) ? y + 15 : y - 15);
            g.restore();
        }
    }

    if (useIECSymbol()) {
        g.drawLine(extraPoints[2], extraPoints[3]);
        g.setLineDash(3, 3);
        interpPoint(lead1, lead2, extraPoints[0], .5, position == 1 ? openhs / 2 : 2);
        if (momentary)
            g.drawLine(extraPoints[1], extraPoints[0]);
        else {
            g.drawLine(extraPoints[6], extraPoints[0]);
            g.drawLine(extraPoints[1], extraPoints[4]);
        }
        g.setLineDash(0, 0);
        if (!momentary) {
            g.drawLine(extraPoints[4], extraPoints[5]);
            g.drawLine(extraPoints[6], extraPoints[5]);
        }
    }

    drawPosts(g);
}

Rectangle SwitchElm::getSwitchRect() {
    interpPoint(lead1, lead2, ps, 0, openhs);
    int rx = std::min(lead1.x, std::min(lead2.x, ps.x));
    int ry = std::min(lead1.y, std::min(lead2.y, ps.y));
    int w = std::abs(lead2.x - lead1.x) + std::abs(ps.x - lead1.x);
    int h = std::abs(lead2.y - lead1.y) + std::abs(ps.y - lead1.y);
    return Rectangle(rx, ry, w, h);
}

void SwitchElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = momentary ? "push switch (SPST)" : "switch (SPST)";
    if (position == 1) {
        arr[1] = "open";
        arr[2] = "Vd = " + getVoltageDText(getVoltageDiff());
    } else {
        arr[1] = "closed";
        arr[2] = "V = " + getVoltageText(nodes[0]->v);
        arr[3] = "I = " + getCurrentDText(getCurrent());
    }
}

std::optional<EditInfo> SwitchElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("", 0, -1, -1);
        ei.checkbox = Checkbox("Momentary Switch", momentary);
        return ei;
    }
    if (n == 1)
        return EditInfo::createCheckbox("IEC Symbol", useIECSymbol());
    if (n == 2)
        return EditInfo("Label (for linking)", label.value_or(""));
    if (n == 3)
        return getKeyShortcutEditInfo();
    if (n == 4) {
        EditInfo ei("On Resistance (ohms)", resistance);
        ei.setNonNegative();
        return ei;
    }
    return std::nullopt;
}

void SwitchElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        momentary = ei.checkbox->getState();
    if (n == 1) {
        flags = ei.changeFlag(flags, FLAG_IEC);
        setPoints();
    }
    if (n == 2) {
        label = ei.textf->value;
        if (label->empty()) {
            label.reset();
            flags &= ~FLAG_LABEL;
        } else
            flags |= FLAG_LABEL;
    }
    if (n == 3)
        setKeyShortcutEditValue(ei);
    if (n == 4)
        resistance = ei.value;
}

EditInfo SwitchElm::getKeyShortcutEditInfo() {
    return EditInfo("Keyboard Shortcut", keyShortcut.value_or(""));
}

void SwitchElm::setKeyShortcutEditValue(EditInfo &ei) {
    std::string s = ei.textf->value;
    size_t a = s.find_first_not_of(" \t");
    s = (a == std::string::npos) ? "" : s.substr(a, s.find_last_not_of(" \t") - a + 1);
    if (s.empty())
        keyShortcut.reset();
    else
        keyShortcut = std::string(1, (char) std::tolower((unsigned char) s[0]));
}
