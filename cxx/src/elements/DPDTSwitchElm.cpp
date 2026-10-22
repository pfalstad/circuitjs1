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

#include "DPDTSwitchElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/FindPathInfo.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

DPDTSwitchElm::DPDTSwitchElm(int xx, int yy, bool mm) : SwitchElm(xx, yy, mm) {
    poleCount = 2;
    noDiagonal = true;
}

DPDTSwitchElm::DPDTSwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : SwitchElm(xa, ya, xb, yb, f, st) {
    try {
        poleCount = parseIntStrict(st.nextToken());
    } catch (...) {
        poleCount = 2;
    }
    noDiagonal = true;
}

void DPDTSwitchElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    SwitchElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "po", poleCount);
}

void DPDTSwitchElm::undumpXml(CircuitXMLDeserializer &xml) {
    SwitchElm::undumpXml(xml);
    poleCount = xml.parseIntAttr("po", poleCount);
}

void DPDTSwitchElm::ensureArrays() {
    if ((int) voltageSources.size() != poleCount) {
        voltageSources.assign(poleCount, nullptr);
        currents.assign(poleCount, 0);
        curcounts.assign(poleCount, 0);
    }
}

void DPDTSwitchElm::setPoints() {
    SwitchElm::setPoints();
    calcLeads(32);
    ensureArrays();
    throwPosts = newPointArray(2 * poleCount);
    throwLeads = newPointArray(4 * poleCount);
    poleLeads = newPointArray(poleCount);
    polePosts = newPointArray(poleCount);
    linePoints = newPointArray(2);
    for (int i = 0; i != poleCount; i++) {
        int offset = -i * openhs * 3;
        interpPoint(point1, point2, polePosts[i], 0, offset);
        interpPoint(lead1, lead2, poleLeads[i], 0, offset);
        interpPoint(point1, point2, throwPosts[i * 2], 1, offset - openhs);
        interpPoint(lead1, lead2, throwLeads[i * 4], 1, offset - openhs);
        interpPoint(point1, point2, throwPosts[i * 2 + 1], 1, offset + openhs);
        interpPoint(lead1, lead2, throwLeads[i * 4 + 1], 1, offset + openhs);
        interpPoint(lead1, lead2, throwLeads[i * 4 + 2], 1, offset + openhs * 0.33);
        if (useIECSymbol())
            interpPoint(lead1, lead2, throwLeads[i * 4 + 3], 1.2, offset - openhs * 0.33);
        else
            interpPoint(lead1, lead2, throwLeads[i * 4 + 3], 1, offset - openhs);
    }
}

void DPDTSwitchElm::draw(Graphics &g) {
    setBbox(point1, point2, 1);
    adjustBbox(throwPosts[1], throwPosts[poleCount * 2 - 2]);

    for (int i = 0; i != poleCount; i++) {
        setVoltageColor(g, nodes[i * 3]->v);
        drawThickLine(g, polePosts[i], poleLeads[i]);
        setVoltageColor(g, nodes[i * 3 + 1]->v);
        drawThickLine(g, throwPosts[i * 2], throwLeads[i * 4]);
        if (useIECSymbol())
            drawThickLine(g, throwLeads[i * 4], throwLeads[i * 4 + 2]);
        setVoltageColor(g, nodes[i * 3 + 2]->v);
        drawThickLine(g, throwPosts[i * 2 + 1], throwLeads[i * 4 + 1]);

        // draw line
        if (!needsHighlight())
            g.setColor(lightGrayColor);

        if (i < poleCount - 1) {
            int offset = -i * openhs * 3;
            interpPoint(point1, point2, linePoints[0], 0.5, offset - openhs * (0.5 - position) - 4 * position);
            interpPoint(point1, point2, linePoints[1], 0.5,
                offset - openhs * 3 - openhs * (0.5 - position) + 3 + 8 * (1 - position));
            g.setLineDash(4, 4);
            g.drawLine(linePoints[0], linePoints[1]);
            g.setLineDash(0, 0);
        }

        // draw switch
        if (!needsHighlight())
            g.setColor(whiteColor);
        drawThickLine(g, poleLeads[i], throwLeads[i * 4 + 3 - position * 2]);

        // current
        curcounts[i] = updateDotCount(currents[i], curcounts[i]);
        drawDots(g, polePosts[i], poleLeads[i], curcounts[i]);
        drawDots(g, throwLeads[i * 4 + position], throwPosts[i * 2 + position], curcounts[i]);
    }

    drawPosts(g);
}

double DPDTSwitchElm::getCurrentIntoNode(int n) {
    int t = n / 3;
    int n3 = n % 3;
    if (n3 == 0)
        return -currents[t];
    if (n3 == position + 1)
        return currents[t];
    return 0;
}

void DPDTSwitchElm::setCurrent(VoltageSource *vs, double c) {
    for (int i = 0; i != poleCount; i++)
        if (vs == voltageSources[i])
            currents[i] = c;
}

Rectangle DPDTSwitchElm::getSwitchRect() {
    return Rectangle(poleLeads[0].x, poleLeads[0].y, 0, 0)
        .unite(Rectangle(throwLeads[1].x, throwLeads[1].y, 0, 0))
        .unite(Rectangle(throwLeads[poleCount * 4 - 4].x, throwLeads[poleCount * 4 - 4].y, 0, 0));
}

Point DPDTSwitchElm::getPost(int n) {
    int t = n / 3;
    int n3 = n % 3;
    if (n3 == 0)
        return polePosts[t];
    return throwPosts[t * 2 + n3 - 1];
}

void DPDTSwitchElm::calculateCurrent() {
    if (resistance > 0)
        for (int i = 0; i != poleCount; i++)
            currents[i] = (nodes[i * 3]->v - nodes[i * 3 + 1 + position]->v) / resistance;
}

void DPDTSwitchElm::setVoltageSource(int j, VoltageSource *vs) {
    ensureArrays();
    voltageSources[j] = vs;
    vs->setNodes(nodes[j * 3], nodes[position + 1 + j * 3]);
}

void DPDTSwitchElm::stamp() {
    ensureArrays();
    for (int i = 0; i != poleCount; i++) {
        if (resistance > 0)
            sim->stampResistor(nodes[i * 3], nodes[position + 1 + i * 3], resistance);
        else
            sim->stampVoltageSourceVS(voltageSources[i], 0);
    }
}

bool DPDTSwitchElm::getConnection(int n1, int n2) {
    for (int i = 0; i != poleCount; i++)
        if (comparePair(n1, n2, i * 3, i * 3 + 1 + position))
            return true;
    return false;
}

void DPDTSwitchElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = (poleCount == 2) ? "switch (DPDT)" : "switch (" + std::to_string(poleCount) + "PDT)";
    for (int i = 0; i != poleCount && i + 1 < (int) arr.size(); i++)
        arr[i + 1] = "I" + std::to_string(i + 1) + " = " + getCurrentDText(currents[i]);
}

std::optional<EditInfo> DPDTSwitchElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Poles", poleCount, 2, 10).setDimensionless();
    if (n == 1)
        return EditInfo::createCheckbox("IEC Symbol", useIECSymbol());
    if (n == 2)
        return getKeyShortcutEditInfo();
    if (n == 3) {
        EditInfo ei("On Resistance (ohms)", resistance);
        ei.setNonNegative();
        return ei;
    }
    return std::nullopt;
}

void DPDTSwitchElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 2) {
            poleCount = (int) std::trunc(ei.value);
            allocNodes();
            setPoints();
        } else
            ei.setError("must be >= 2");
    }
    if (n == 1) {
        flags = ei.changeFlag(flags, FLAG_IEC);
        setPoints();
    }
    if (n == 2)
        setKeyShortcutEditValue(ei);
    if (n == 3)
        resistance = ei.value;
}

void DPDTSwitchElm::flip() {
    if (dx == 0)
        x = x2 = x - (int) std::trunc(dpx1 * openhs * 3);
    if (dy == 0)
        y = y2 = y - (int) std::trunc(dpy1 * openhs * 3);
    position = 1 - position;
}

void DPDTSwitchElm::flipX(int c2, int count) {
    flip();
    SwitchElm::flipX(c2, count);
}

void DPDTSwitchElm::flipY(int c2, int count) {
    flip();
    SwitchElm::flipY(c2, count);
}

void DPDTSwitchElm::flipXY(int c2, int count) {
    flip();
    SwitchElm::flipXY(c2, count);
}

bool DPDTSwitchElm::validate() {
    if (resistance > 0)
        return true;
    for (int i = 0; i != poleCount; i++) {
        FindPathInfo fpi(FindPathInfo::VOLTAGE, this, getNode(i * 3), sim);
        if (fpi.findPath(getNode(i * 3 + 1 + position))) {
            //sim->stop("Voltage source/wire loop with no resistance!", this);
            resistance = .001;
            return false;
        }
    }
    return true;
}
