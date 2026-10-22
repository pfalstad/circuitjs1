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

#include "AmmeterElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

AmmeterElm::AmmeterElm(int xx, int yy) : CircuitElm(xx, yy) {
    flags = FLAG_SHOWCURRENT | FLAG_CIRCLE;
    scale = SCALE_AUTO;
}

AmmeterElm::AmmeterElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    scale = SCALE_AUTO;
    meter = parseIntStrict(st.nextToken());
    try {
        scale = parseIntStrict(st.nextToken());
    } catch (...) {}
}

void AmmeterElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "me", meter);
    CircuitXMLSerializer::dumpAttr(elem, "sc", scale);
    if (!label.empty())
        CircuitXMLSerializer::dumpAttr(elem, "lb", label);
}

void AmmeterElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    meter = xml.parseIntAttr("me", meter);
    scale = xml.parseIntAttr("sc", scale);
    label = xml.parseStringAttr("lb", std::string()).value_or("");
}

std::string AmmeterElm::getMeter() {
    switch (meter) {
    case AM_VOL: return "I";
    case AM_RMS: return "Irms";
    }
    return "";
}

void AmmeterElm::setPoints() {
    CircuitElm::setPoints();
    mid = interpPoint(point1, point2, 0.6);
    center = interpPoint(point1, point2, 0.5);
    arrowPoly = calcArrow(point1, mid, 14, 7);
}

void AmmeterElm::stepFinished() {
    count++;
    total += current * current;
    if (current > maxI && increasingI) {
        maxI = current;
        increasingI = true;
        decreasingI = false;
    }
    if (current < maxI && increasingI) {
        lastMaxI = maxI;
        minI = current;
        increasingI = false;
        decreasingI = true;

        total = total / count;
        rmsI = std::sqrt(total);
        if (std::isnan(rmsI))
            rmsI = 0;
        count = 0;
        total = 0;
    }
    if (current < minI && decreasingI) {
        minI = current;
        increasingI = false;
        decreasingI = true;
    }
    if (current > minI && decreasingI) {
        lastMinI = minI;
        maxI = current;
        increasingI = true;
        decreasingI = false;

        total = total / count;
        rmsI = std::sqrt(total);
        if (std::isnan(rmsI))
            rmsI = 0;
        count = 0;
        total = 0;
    }
    if (current == 0) {
        zerocount++;
        if (zerocount > 5) {
            total = 0;
            rmsI = 0;
            maxI = 0;
            minI = 0;
        }
    } else {
        zerocount = 0;
    }
    switch (meter) {
    case AM_VOL: selectedValue = current; break;
    case AM_RMS: selectedValue = rmsI; break;
    }
}

void AmmeterElm::draw(Graphics &g) {
    CircuitElm::draw(g);
    setVoltageColor(g, nodes[0]->v);
    int width = 4;
    if (!drawAsCircle()) {
        drawThickLine(g, point1, point2);
        g.fillPolygon(arrowPoly);
    } else {
        calcLeads(circleSize * 2);
        setVoltageColor(g, nodes[0]->v);
        drawThickLine(g, point1, lead1);
        drawThickLine(g, lead2, point2);

        g.setColor(needsHighlight() ? selectColor : lightGrayColor);
        drawThickCircle(g, center.x, center.y, circleSize);
        drawCenteredText(g, "A", center.x, center.y, true);

        g.setColor(whiteColor);
        g.setFont(unitsFont);
        const int len = circleSize * 2;
        Point plusPoint = interpPoint(point1, point2, (dn / 2 - len / 2 - 4) / dn, -10 * dsign);
        if (y2 > y)
            plusPoint.y += 4;
        if (y > y2)
            plusPoint.y += 3;
        double w = std::floor(g.measureWidth("+"));
        g.drawString("+", plusPoint.x - w / 2, plusPoint.y);
        width = circleSize;
    }

    doDots(g);
    setBbox(point1, point2, width);
    std::string s = "A";
    switch (meter) {
    case AM_VOL: s = getUnitTextWithScale(getCurrent(), "A", scale); break;
    case AM_RMS: s = getUnitTextWithScale(rmsI, "A(rms)", scale); break;
    }

    if (!label.empty())
        s = label + " " + s;
    drawValues(g, s, width);
    drawPosts(g);
}

void AmmeterElm::setVoltageSource(int n, VoltageSource *v) {
    CircuitElm::setVoltageSource(n, v);
    v->setNodes(nodes[0], nodes[1]);
}

void AmmeterElm::stamp() {
    sim->stampVoltageSource(nodes[0], nodes[1], voltSource, 0);
}

void AmmeterElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "Ammeter";
    switch (meter) {
    case AM_VOL: arr[1] = "I = " + getUnitText(current, "A"); break;
    case AM_RMS: arr[1] = "Irms = " + getUnitText(rmsI, "A"); break;
    }
}

std::optional<EditInfo> AmmeterElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Value", selectedValue, -1, -1);
        ei.choice = Choice();
        ei.choice->add("Current");
        ei.choice->add("RMS Current");
        ei.choice->select(meter);
        return ei;
    }
    if (n == 1) {
        EditInfo ei("Scale", 0);
        ei.choice = Choice();
        ei.choice->add("Auto");
        ei.choice->add("A");
        ei.choice->add("mA");
        ei.choice->add(Locale::muString + "A");
        ei.choice->select(scale);
        return ei;
    }
    if (n == 2)
        return EditInfo::createCheckbox("Circular Symbol", drawAsCircle());
    if (n == 3) {
        EditInfo ei("Label", 0, -1, -1);
        ei.text = label;
        return ei;
    }
    return std::nullopt;
}

void AmmeterElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        meter = ei.choice->getSelectedIndex();
    if (n == 1)
        scale = ei.choice->getSelectedIndex();
    if (n == 2)
        flags = ei.changeFlag(flags, FLAG_CIRCLE);
    if (n == 3)
        label = ei.textf ? ei.textf->value : ei.text.value_or("");
}
