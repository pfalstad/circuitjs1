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

#include "ResistorElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/JsMath.h"

ResistorElm::ResistorElm(int xx, int yy) : CircuitElm(xx, yy) {
    resistance = 1000;
}

ResistorElm::ResistorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    resistance = parseFloatStrict(st.nextToken());
}

std::string ResistorElm::dump() {
    return CircuitElm::dump() + " " + jsNumberToString(resistance);
}

void ResistorElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "r", resistance);
}

void ResistorElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    resistance = xml.parseDoubleAttr("r", resistance);
}

void ResistorElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(32);
}

void ResistorElm::calculateCurrent() {
    current = (nodes[0]->v - nodes[1]->v) / resistance;
}

void ResistorElm::stamp() {
    sim->stampResistor(nodes[0], nodes[1], resistance);
}

void ResistorElm::draw(Graphics &g) {
    double hs = 6;
    double v1 = nodes[0]->v;
    double v2 = nodes[1]->v;
    setBbox(point1, point2, hs);
    draw2Leads(g);

    double len = distance(lead1, lead2);
    g.saveState();
    g.setLineWidth(3.0);
    g.transform((lead2.x - lead1.x) / len, (lead2.y - lead1.y) / len,
                -(lead2.y - lead1.y) / len, (lead2.x - lead1.x) / len, lead1.x, lead1.y);
    if (app->options.volts)
        g.setStrokeGradient(0, 0, len, 0, getVoltageColor(g, v1), getVoltageColor(g, v2));
    else
        setPowerColor(g, true);
    if (dn < 30)
        hs = 2;
    if (!showEuroResistors()) {
        g.beginPath();
        g.moveTo(0, 0);
        for (int i = 0; i < 4; i++) {
            g.lineTo((1 + 4 * i) * len / 16, hs);
            g.lineTo((3 + 4 * i) * len / 16, -hs);
        }
        g.lineTo(len, 0);
        g.stroke();
    } else {
        g.strokeRect(0, -hs, len, 2.0 * hs);
    }
    g.restoreState();
    if (showValues()) {
        std::string s = getShortUnitText(resistance, showOhmSymbol() ? Locale::ohmString : "");
        drawValues(g, s, hs + 2);
    }
    doDots(g);
    drawPosts(g);
}

void ResistorElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "resistor";
    getBasicInfo(arr);
    arr[3] = "R = " + getUnitText(resistance, Locale::ohmString);
    arr[4] = "P = " + getUnitText(getPower(), "W");
}

std::string ResistorElm::getScopeText(int) {
    return Locale::LS("resistor") + ", " + getUnitText(resistance, Locale::ohmString);
}

std::optional<EditInfo> ResistorElm::getEditInfo(int n) {
    // ohmString doesn't work here on linux
    if (n == 0)
        return EditInfo("Resistance (ohms)", resistance, 0, 0);
    return std::nullopt;
}

void ResistorElm::setEditValue(int n, EditInfo &ei) {
    resistance = (ei.value <= 0) ? 1e-9 : ei.value;
}
