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

#include "RelayContactElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "RelayCoilElm.h"

RelayContactElm::RelayContactElm(int xx, int yy) : CircuitElm(xx, yy) {
    noDiagonal = true;
    r_on = 0.05;
    r_off = 1e6;
    label = "label";
    flags |= FLAG_IEC;
}

RelayContactElm::RelayContactElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    label = CustomLogicModel::unescape(st.nextToken());
    r_on = parseFloatStrict(st.nextToken());
    r_off = parseFloatStrict(st.nextToken());
    try {
        i_position = parseIntStrict(st.nextToken());
    } catch (...) {}
    noDiagonal = true;
}

void RelayContactElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "lb", label);
    CircuitXMLSerializer::dumpAttr(elem, "ron", r_on);
    CircuitXMLSerializer::dumpAttr(elem, "roff", r_off);
    CircuitXMLSerializer::dumpAttr(elem, "ip", i_position);
}

void RelayContactElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    label = xml.parseStringAttr("lb", label).value_or(label);
    r_on = xml.parseDoubleAttr("ron", r_on);
    r_off = xml.parseDoubleAttr("roff", r_off);
    i_position = xml.parseIntAttr("ip", i_position);
    noDiagonal = true;
    allocNodes();
}

void RelayContactElm::draw(Graphics &g) {
    for (int i = 0; i != 2; i++) {
        setVoltageColor(g, nodes[nSwitch0 + i]->v);
        drawThickLine(g, swposts[i], swpoles[i]);
    }
    interpPoint(swpoles[1], swpoles[2], ptSwitch, i_position);
    g.setColor(Color::lightGray);
    drawThickLine(g, swpoles[0], ptSwitch);

    g.setColor(needsHighlight() ? selectColor : whiteColor);
    if (x == x2)
        g.drawString(label, x + 10, swpoles[y < y2 ? 0 : 1].y - 5);
    else {
        g.save();
        g.setTextAlign(Graphics::ALIGN_CENTER);
        g.drawString(label, std::trunc((x + x2) / 2.), y + 15);
        g.restore();
    }

    if (useIECSymbol() && (type == RelayCoilElm::TYPE_ON_DELAY || type == RelayCoilElm::TYPE_OFF_DELAY)) {
        g.setColor(Color::lightGray);
        interpPoint(lead1, lead2, extraPoints[0], 0.5 - 2 / 32., i_position == 1 ? openhs / 2. : 0);
        interpPoint(lead1, lead2, extraPoints[1], 0.5 + 2 / 32., i_position == 1 ? openhs / 2. : 0);
        g.drawLine(extraPoints[0], extraPoints[2]);
        g.drawLine(extraPoints[1], extraPoints[3]);
        g.beginPath();
        double ang = -jsmath::atan2(-dy * dsign, dx * dsign);
        int ds = 22 * dsign;
        if (type == RelayCoilElm::TYPE_OFF_DELAY) {
            interpPoint(lead1, lead2, extraPoints[4], 0.5, ds + 6 * dsign);
            g.arc(extraPoints[4].x, extraPoints[4].y, 6, -M_PI / 8 + ang + M_PI, M_PI * 9 / 8 + ang + M_PI, true);
        } else {
            interpPoint(lead1, lead2, extraPoints[4], 0.5, ds - 5 * dsign);
            g.arc(extraPoints[4].x, extraPoints[4].y, 6, -M_PI / 8 + ang, M_PI * 9 / 8 + ang, true);
        }
        g.stroke();
    }

    switchCurCount = updateDotCount(switchCurrent, switchCurCount);
    drawDots(g, swposts[0], swpoles[0], switchCurCount);
    if (i_position == 0)
        drawDots(g, swpoles[i_position + 1], swposts[i_position + 1], switchCurCount);
    drawPosts(g);
    setBbox(point1, point2, openhs);
}

double RelayContactElm::getCurrentIntoNode(int n) {
    if (n == 0)
        return -switchCurrent;
    if (n == 1 + i_position)
        return switchCurrent;
    return 0;
}

void RelayContactElm::setPoints() {
    CircuitElm::setPoints();
    allocNodes();
    openhs = dsign * 16;
    calcLeads(32);
    swposts = newPointArray(3);
    swpoles = newPointArray(3);
    interpPoint(lead1, lead2, swpoles[0], 0, 0);
    interpPoint(lead1, lead2, swpoles[1], 1, 0);
    interpPoint(lead1, lead2, swpoles[2], 1, openhs);
    interpPoint(point1, point2, swposts[0], 0, 0);
    interpPoint(point1, point2, swposts[1], 1, 0);
    interpPoint(point1, point2, swposts[2], 1, openhs);
    ptSwitch = Point();
    if (useIECSymbol()) {
        extraPoints = newPointArray(5);
        int ds = 22 * dsign;
        interpPoint(lead1, lead2, extraPoints[2], 0.5 - 2 / 32., ds);
        interpPoint(lead1, lead2, extraPoints[3], 0.5 + 2 / 32., ds);
    }
}

void RelayContactElm::setContactPosition(int i_position_, int type_) {
    i_position = isNormallyClosed() ? (1 - i_position_) : i_position_;
    type = type_;
}

void RelayContactElm::reset() {
    CircuitElm::reset();
    switchCurrent = switchCurCount = 0;
    i_position = 0;
}

void RelayContactElm::stamp() {
    sim->stampNonLinear(nodes[nSwitch0]);
    sim->stampNonLinear(nodes[nSwitch1]);
}

void RelayContactElm::doStep() {
    sim->stampResistor(nodes[nSwitch0], nodes[nSwitch1], i_position == 0 ? r_on : r_off);
}

void RelayContactElm::calculateCurrent() {
    if (i_position == 1)
        switchCurrent = 0;
    else
        switchCurrent = (nodes[nSwitch0]->v - nodes[nSwitch1 + i_position]->v) / r_on;
}

void RelayContactElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = Locale::LS("relay");
    if (i_position == 0)
        arr[0] += " (" + Locale::LS("off") + ")";
    else if (i_position == 1)
        arr[0] += " (" + Locale::LS("on") + ")";
    arr[1] = "I = " + getCurrentDText(switchCurrent);
}

std::optional<EditInfo> RelayContactElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("On Resistance (ohms)", r_on, 0, 0).setPositive();
    if (n == 1)
        return EditInfo("Off Resistance (ohms)", r_off, 0, 0).setPositive();
    if (n == 2)
        return EditInfo("Label (for linking)", label);
    if (n == 3)
        return EditInfo::createCheckbox("Normally Closed", isNormallyClosed());
    if (n == 4)
        return EditInfo::createCheckbox("IEC Symbol", useIECSymbol());
    return std::nullopt;
}

void RelayContactElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0) r_on = ei.value;
    if (n == 1 && ei.value > 0) r_off = ei.value;
    if (n == 2) label = ei.textf->value;
    if (n == 3) flags = ei.changeFlag(flags, FLAG_NORMALLY_CLOSED);
    if (n == 4) {
        flags = ei.changeFlag(flags, FLAG_IEC);
        setPoints();
    }
}
