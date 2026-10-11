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

#include "FuseElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

FuseElm::FuseElm(int xx, int yy) : CircuitElm(xx, yy) {
    // from https://m.littelfuse.com/~/media/electronics/datasheets/fuses/littelfuse_fuse_218_datasheet.pdf.pdf
    i2t = 6.73;
    resistance = 0.0613;
}

FuseElm::FuseElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CircuitElm(xa, ya, xb, yb, f) {
    resistance = parseFloatStrict(st.nextToken());
    i2t = parseFloatStrict(st.nextToken());
    heat = parseFloatStrict(st.nextToken());
    blown = st.nextToken() == "true";
}

std::string FuseElm::dump() {
    return CircuitElm::dump() + " " + jsNumberToString(resistance) + " " + jsNumberToString(i2t) + " " +
        jsNumberToString(heat) + " " + (blown ? "true" : "false");
}

void FuseElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "re", resistance);
    CircuitXMLSerializer::dumpAttr(elem, "i2", i2t);
    CircuitXMLSerializer::dumpAttr(elem, "he", heat);
    CircuitXMLSerializer::dumpAttr(elem, "bl", blown);
}

void FuseElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    resistance = xml.parseDoubleAttr("re", resistance);
    i2t = xml.parseDoubleAttr("i2", i2t);
    heat = xml.parseDoubleAttr("he", heat);
    blown = xml.parseBooleanAttr("bl", blown);
}

void FuseElm::reset() {
    CircuitElm::reset();
    heat = 0;
    blown = false;
}

void FuseElm::setPoints() {
    CircuitElm::setPoints();
    int llen = isIECSymbol() ? 32 : 16;
    calcLeads(llen);
}

Color FuseElm::getTempColor(Graphics &g) {
    Color c = getVoltageColor(g, nodes[0]->v);
    double temp = heat / i2t;
    if (temp < 0.3333) {
        double val = temp * 3;
        int x = std::max(0, (int) std::trunc(255 * val));
        return Color(x + (255 - x) * c.getRed() / 255, (255 - x) * c.getGreen() / 255, (255 - x) * c.getBlue() / 255);
    }
    if (temp < 0.6667) {
        int x = std::max(0, (int) std::trunc((temp - 0.3333) * 3 * 255));
        return Color(255, x, 0);
    }
    if (temp < 1) {
        int x = std::max(0, (int) std::trunc((temp - 0.6666) * 3 * 255));
        return Color(255, 255, x);
    }
    return Color::white;
}

void FuseElm::draw(Graphics &g) {
    const int hs = 6;
    setBbox(point1, point2, hs);
    draw2Leads(g);

    double len = distance(lead1, lead2);
    g.saveState();
    g.setLineWidth(3.0);
    g.transform(
        (lead2.x - lead1.x) / len, (lead2.y - lead1.y) / len,
        -(lead2.y - lead1.y) / len, (lead2.x - lead1.x) / len,
        lead1.x, lead1.y);
    g.setColor(getTempColor(g));
    if (!isIECSymbol()) {
        if (!blown) {
            const int segments = 16;
            g.beginPath();
            g.moveTo(0, 0);
            for (int i = 0; i <= segments; i++)
                g.lineTo(i * len / segments, hs * jsmath::sin(i * pi * 2 / segments));
            g.stroke();
        }
    } else {
        if (!blown) {
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(len, 0);
            g.stroke();
            g.strokeRect(0, -hs, len, 2.0 * hs);
        }
    }
    g.restoreState();
    doDots(g);
    drawPosts(g);
}

void FuseElm::calculateCurrent() {
    current = (nodes[0]->v - nodes[1]->v) / (blown ? blownResistance : resistance);
}

void FuseElm::stamp() {
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
}

void FuseElm::startIteration() {
    double i = getCurrent();

    // accumulate heat
    heat += i * i * sim->timeStep;

    // dissipate heat.  we assume the fuse can dissipate its entire i2t in 3 seconds
    heat -= sim->timeStep * i2t / 3;

    if (heat < 0)
        heat = 0;
    if (heat > i2t)
        blown = true;
}

void FuseElm::doStep() {
    sim->stampResistor(nodes[0], nodes[1], blown ? blownResistance : resistance);
}

void FuseElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = blown ? "fuse (blown)" : "fuse";
    getBasicInfo(arr);
    arr[3] = "R = " + getUnitText(resistance, Locale::ohmString);
    arr[4] = "I2t = " + jsNumberToString(i2t);
    if (!blown)
        arr[5] = jsNumberToString(std::trunc(heat * 100 / i2t)) + "% " + Locale::LS("melted");
}

std::optional<EditInfo> FuseElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("I2t", i2t, 0, 0).setPositive();
    if (n == 1)
        return EditInfo("Resistance", resistance, 0, 0).setPositive();
    if (n == 2)
        return EditInfo::createCheckbox("IEC Symbol", isIECSymbol());
    return std::nullopt;
}

void FuseElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        i2t = ei.value;
    if (n == 1)
        resistance = ei.value;
    if (n == 2) {
        flags = ei.changeFlag(flags, FLAG_IEC_SYMBOL);
        setPoints();
    }
}
