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

#include "MotorProtectionSwitchElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/Font.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "RelayCoilElm.h"
#include "RelayContactElm.h"

MotorProtectionSwitchElm::MotorProtectionSwitchElm(int xx, int yy) : CircuitElm(xx, yy) {
    i2t = 6.73;
    resistance = 0.0613;
    label = "";
}

MotorProtectionSwitchElm::MotorProtectionSwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    resistance = parseFloatStrict(st.nextToken());
    i2t = parseFloatStrict(st.nextToken());
    blown = st.nextToken() == "true";
    label = "";
    try {
        label = CustomLogicModel::unescape(st.nextToken());
    } catch (...) {}
}

std::string MotorProtectionSwitchElm::dump() {
    return CircuitElm::dump() + " " + jsNumberToString(resistance) + " " + jsNumberToString(i2t) + " " +
           (blown ? "true" : "false") + " " + CustomLogicModel::escape(label);
}

void MotorProtectionSwitchElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "re", resistance);
    CircuitXMLSerializer::dumpAttr(elem, "i2", i2t);
    CircuitXMLSerializer::dumpAttr(elem, "bl", blown);
    CircuitXMLSerializer::dumpAttr(elem, "la", label);
}

void MotorProtectionSwitchElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    resistance = xml.parseDoubleAttr("re", resistance);
    i2t = xml.parseDoubleAttr("i2", i2t);
    blown = xml.parseBooleanAttr("bl", blown);
    label = xml.parseStringAttr("la", label).value_or(label);
}

void MotorProtectionSwitchElm::reset() {
    CircuitElm::reset();
    for (int i = 0; i != 3; i++)
        heats[i] = currents[i] = 0;
    blown = false;
    setSwitchPositions();
}

void MotorProtectionSwitchElm::setPoints() {
    CircuitElm::setPoints();
    posts.assign(6, Point());
    leads.assign(6, Point());
    for (int i = 0; i != 3; i++) {
        posts[i * 2] = Point(x + i * 48, y);
        posts[i * 2 + 1] = Point(x + i * 48, y + 192);
        leads[i * 2] = Point(x + i * 48, y + 80);
        leads[i * 2 + 1] = Point(x + i * 48, y + 176);
    }
}

Color MotorProtectionSwitchElm::getTempColor(Graphics &g, int num) {
    Color c = getVoltageColor(g, nodes[num * 2]->v);
    double temp = heats[num] / i2t;
    if (temp < 0.3333) {
        double val = temp * 3;
        int x = std::max(0, (int) std::trunc(255 * val));
        return Color((int) (x + (255 - x) * c.getRed() / 255.), (int) ((255 - x) * c.getGreen() / 255.),
                     (int) ((255 - x) * c.getBlue() / 255.));
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

void MotorProtectionSwitchElm::draw(Graphics &g) {
    setBbox(posts[0], posts[5], 6);
    g.save();
    g.translate(x, y);
    const int spx = 48;
    g.setLineDash(4, 4);
    const int squareX = -spx - 12;
    const int squareY = 48 - 12;

    g.setColor(Color::lightGray);
    g.drawLine(squareX + 24 + 4, squareY + 12, 48 * 2 - (blown ? 8 : 0), squareY + 12);
    g.drawLine(squareX + 12, squareY + 24 + 4, squareX + 12, 80 + 48 + 48 / 2);
    g.drawLine(squareX + 12, 80 + 48 + 48 / 2, -spx / 2, 80 + 48 + 48 / 2);
    g.drawLine(squareX + 12, 80 + 48 / 2, -spx / 2, 80 + 48 / 2);
    g.setLineDash(0, 0);

    for (int i = 0; i != 3; i++) {
        setVoltageColor(g, nodes[i * 2]->v);
        g.drawLine(i * spx, 0, i * spx, 32);
        if (blown)
            g.drawLine(i * spx - 4, 32, i * spx + 4, 32);
        int sw = blown ? 16 : 0;
        g.drawLine(i * spx - sw, 32, i * spx, 64);
        g.setLineCap(Graphics::CAP_BUTT);
        g.drawLine(i * spx, 64, i * spx, 80);
        g.drawLine(i * spx - 4, 16 - 4, i * spx + 4, 16 + 4);
        g.drawLine(i * spx + 4, 16 - 4, i * spx - 4, 16 + 4);
        setVoltageColor(g, nodes[i * 2 + 1]->v);
        g.drawLine(i * spx, 176, i * spx, 192);
        g.setLineCap(Graphics::CAP_ROUND);
        g.setColor(getTempColor(g, i));
        g.drawLine(i * spx, 80, i * spx, 96);
        const int q = 12;
        g.drawLine(i * spx - q, 96, i * spx, 96);
        g.drawLine(i * spx - q, 96, i * spx - q, 112);
        g.drawLine(i * spx - q, 112, i * spx, 112);
        g.drawLine(i * spx, 112, i * spx, 128);
        g.setColor(Color::lightGray);
        g.setFont(Font("serif", Font::ITALIC, 30));
        g.setTextBaseline(Graphics::BASELINE_MIDDLE);
        g.setTextAlign(Graphics::ALIGN_CENTER);
        g.drawString("I >", i * spx, 80 + 48 + 48 / 2);
    }
    g.setColor(Color::lightGray);
    for (int i = 0; i != 3; i++)
        g.drawLine(-spx / 2, 80 + 48 * i, 2 * spx + spx / 2, 80 + 48 * i);
    for (int i = 0; i != 4; i++)
        g.drawLine(i * spx - spx / 2, 80, i * spx - spx / 2, 80 + 48 * 2);
    for (int i = 0; i != 3; i++)
        g.drawLine(squareX + 12 * i, squareY, squareX + 12 * i, squareY + 24);
    for (int i = 0; i != 3; i++)
        g.drawLine(squareX, squareY + 12 * i, squareX + 24, squareY + 12 * i);
    g.drawLine(squareX - spx / 2, squareY + 12, squareX, squareY + 12);
    g.drawLine(squareX - spx / 2, squareY, squareX - spx / 2, squareY + 24);
    g.setFont(Font("sans-serif", 0, 12));
    g.setColor(Color::white);
    // (the alignment set above still applies, as in the TS version)
    g.drawString(label, 120, squareY + 12);
    g.restore();

    if (!blown) {
        for (int i = 0; i != 3; i++) {
            curcounts[i] = updateDotCount(currents[i], curcounts[i]);
            drawDots(g, posts[i * 2], leads[i * 2], curcounts[i]);
            drawDots(g, posts[i * 2 + 1], leads[i * 2 + 1], -curcounts[i]);
        }
    }

    setSwitchPositions();
    drawPosts(g);
}

void MotorProtectionSwitchElm::calculateCurrent() {
    for (int i = 0; i != 3; i++)
        currents[i] = (nodes[i * 2]->v - nodes[i * 2 + 1]->v) / (blown ? blownResistance : resistance);
}

void MotorProtectionSwitchElm::stamp() {
    for (int i = 0; i != 6; i++)
        sim->stampNonLinear(nodes[i]);
}

void MotorProtectionSwitchElm::startIteration() {
    bool wasBlown = blown;
    for (int j = 0; j != 3; j++) {
        double i = currents[j];
        double heat = heats[j];
        heat += i * i * sim->timeStep;
        heat -= sim->timeStep * i2t / 3;
        if (heat < 0)
            heat = 0;
        if (heat > i2t)
            blown = true;
        heats[j] = heat;
    }
    if (blown != wasBlown)
        setSwitchPositions();
}

void MotorProtectionSwitchElm::setSwitchPositions() {
    int switchPosition = blown ? 0 : 1;
    for (CircuitElm *ce : sim->elmList)
        if (RelayContactElm *rc = dynamic_cast<RelayContactElm *>(ce))
            if (rc->label == label)
                rc->setContactPosition(switchPosition, RelayCoilElm::TYPE_NORMAL);
}

void MotorProtectionSwitchElm::doStep() {
    for (int i = 0; i != 3; i++)
        sim->stampResistor(nodes[i * 2], nodes[i * 2 + 1], blown ? blownResistance : resistance);
}

void MotorProtectionSwitchElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "motor protection switch";
    getBasicInfo(arr);
    arr[3] = "R = " + getUnitText(resistance, Locale::ohmString);
    arr[4] = "I2t = " + jsNumberToString(i2t);
}

std::optional<EditInfo> MotorProtectionSwitchElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("I2t", i2t, 0, 0).setPositive();
    if (n == 1)
        return EditInfo("On Resistance", resistance, 0, 0).setPositive();
    if (n == 2)
        return EditInfo("Label (for linking)", label);
    return std::nullopt;
}

void MotorProtectionSwitchElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        i2t = ei.value;
    if (n == 1)
        resistance = ei.value;
    if (n == 2)
        label = ei.textf->value;
}
