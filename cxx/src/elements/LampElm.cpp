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

#include "LampElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/ScopeConstants.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

using namespace ScopeConstants;

LampElm::LampElm(int xx, int yy) : CircuitElm(xx, yy) {
    temp = roomTemp;
    nom_pow = 100;
    nom_v = 120;
    warmTime = .4;
    coolTime = .4;
    updateResistance();
}

LampElm::LampElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CircuitElm(xa, ya, xb, yb, f) {
    temp = parseFloatStrict(st.nextToken());
    if (std::isnan(temp))
        temp = roomTemp;
    nom_pow = parseFloatStrict(st.nextToken());
    nom_v = parseFloatStrict(st.nextToken());
    warmTime = parseFloatStrict(st.nextToken());
    coolTime = parseFloatStrict(st.nextToken());
    updateResistance();
}

void LampElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "te", temp);
    CircuitXMLSerializer::dumpAttr(elem, "np", nom_pow);
    CircuitXMLSerializer::dumpAttr(elem, "nv", nom_v);
    CircuitXMLSerializer::dumpAttr(elem, "wa", warmTime);
    CircuitXMLSerializer::dumpAttr(elem, "co", coolTime);
}

void LampElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    temp = xml.parseDoubleAttr("te", temp);
    nom_pow = xml.parseDoubleAttr("np", nom_pow);
    nom_v = xml.parseDoubleAttr("nv", nom_v);
    warmTime = xml.parseDoubleAttr("wa", warmTime);
    coolTime = xml.parseDoubleAttr("co", coolTime);
}

void LampElm::reset() {
    CircuitElm::reset();
    temp = roomTemp;
    startIteration();  // set resistance
}

void LampElm::setPoints() {
    CircuitElm::setPoints();
    const int llen = 16;
    calcLeads(llen);
    bulbLead = newPointArray(2);
    filament = newPointArray(2);
    bulbR = 20;
    filament[0] = interpPoint(lead1, lead2, 0, filament_len);
    filament[1] = interpPoint(lead1, lead2, 1, filament_len);
    double br = filament_len - std::sqrt(bulbR * bulbR - llen * llen);
    bulbLead[0] = interpPoint(lead1, lead2, 0, br);
    bulbLead[1] = interpPoint(lead1, lead2, 1, br);
    bulb = interpPoint(filament[0], filament[1], .5);
}

Color LampElm::getTempColor() {
    double t = temp;
    if (t < 1200) {
        int x = (int) std::floor(255 * (t - 800) / 400);
        if (x < 0)
            x = 0;
        return Color(x, 0, 0);
    }
    if (t < 1700) {
        int x = (int) std::floor(255 * (t - 1200) / 500);
        if (x < 0)
            x = 0;
        return Color(255, x, 0);
    }
    if (t < 2400) {
        int x = (int) std::floor(255 * (t - 1700) / 700);
        if (x < 0)
            x = 0;
        return Color(255, 255, x);
    }
    return Color(std::string("#ffffff"));
}

void LampElm::draw(Graphics &g) {
    double v1 = nodes[0]->v;
    double v2 = nodes[1]->v;
    setBbox(point1, point2, 4);
    adjustBbox(bulb.x - bulbR, bulb.y - bulbR,
               bulb.x + bulbR, bulb.y + bulbR);
    draw2Leads(g);
    setPowerColor(g, true);
    g.setColor(getTempColor());
    g.fillOval(bulb.x - bulbR, bulb.y - bulbR, bulbR * 2, bulbR * 2);
    g.setColor(whiteColor);
    drawThickCircle(g, bulb.x, bulb.y, bulbR);
    setVoltageColor(g, v1);
    drawThickLine(g, lead1, filament[0]);
    setVoltageColor(g, v2);
    drawThickLine(g, lead2, filament[1]);
    setVoltageColor(g, (v1 + v2) * .5);
    drawThickLine(g, filament[0], filament[1]);
    updateDotCount();
    if (!isCreating()) {
        drawDots(g, point1, lead1, curcount);
        double cc = addCurCount(curcount, (dn - 16) / 2);
        drawDots(g, lead1, filament[0], cc);
        cc = addCurCount(cc, filament_len);
        drawDots(g, filament[0], filament[1], cc);
        cc = addCurCount(cc, 16);
        drawDots(g, filament[1], lead2, cc);
        cc = addCurCount(cc, filament_len);
        drawDots(g, lead2, point2, curcount);
    }
    drawPosts(g);
}

void LampElm::calculateCurrent() {
    current = (nodes[0]->v - nodes[1]->v) / resistance;
    if (resistance == 0)
        current = 0;
}

void LampElm::stamp() {
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
}

void LampElm::updateResistance() {
    // based on http://www.intusoft.com/nlpdf/nl11.pdf
    double nom_r = nom_v * nom_v / nom_pow;
    // this formula doesn't work for values over 5390
    double tp = (temp > 5390) ? 5390 : temp;
    resistance = nom_r * (1.26104 -
        4.90662 * std::sqrt(17.1839 / tp - 0.00318794) -
        7.8569 / (tp - 187.56));
}

void LampElm::startIteration() {
    updateResistance();
    double cap = 1.57e-4 * nom_pow;
    double capw = cap * warmTime / .4;
    double capc = cap * coolTime / .4;
    temp += getPower() * sim->timeStep / capw;
    double cr = 2600 / nom_pow;
    temp -= sim->timeStep * (temp - roomTemp) / (capc * cr);
}

void LampElm::doStep() {
    sim->stampResistor(nodes[0], nodes[1], resistance);
}

void LampElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "lamp";
    getBasicInfo(arr);
    arr[3] = "R = " + getUnitText(resistance, Locale::ohmString);
    arr[4] = "P = " + getUnitText(getPower(), "W");
    arr[5] = "T = " + jsNumberToString(std::trunc(temp)) + " K";
}

std::optional<EditInfo> LampElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Nominal Power", nom_pow, 0, 0).setPositive();
    if (n == 1)
        return EditInfo("Nominal Voltage", nom_v, 0, 0).setPositive().setUnitStep();
    if (n == 2)
        return EditInfo("Warmup Time (s)", warmTime, 0, 0).setPositive();
    if (n == 3)
        return EditInfo("Cooldown Time (s)", coolTime, 0, 0).setPositive();
    return std::nullopt;
}

void LampElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0)
        nom_pow = ei.value;
    if (n == 1 && ei.value > 0)
        nom_v = ei.value;
    if (n == 2 && ei.value > 0)
        warmTime = ei.value;
    if (n == 3 && ei.value > 0)
        coolTime = ei.value;
}

double LampElm::getScopeValue(int x) {
    return (x == VAL_R) ? resistance : CircuitElm::getScopeValue(x);
}

int LampElm::getScopeUnits(int x) {
    return (x == VAL_R) ? UNITS_OHMS : CircuitElm::getScopeUnits(x);
}

bool LampElm::canShowValueInScope(int x) {
    return x == VAL_R;
}
