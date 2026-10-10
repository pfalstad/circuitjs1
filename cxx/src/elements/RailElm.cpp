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

#include "RailElm.h"

#include "../core/FindPathInfo.h"
#include "../core/SimulationManager.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/JsMath.h"

void RailElm::setPoints() {
    VoltageElm::setPoints();
    lead1 = interpPoint(point1, point2, 1 - circleSize / dn);
}

void RailElm::setVoltageSource(int n, VoltageSource *v) {
    CircuitElm::setVoltageSource(n, v);
    if (internalResistance > 0)
        v->setNodes(CircuitNode::ground, nodes[1]);
    else
        v->setNodes(CircuitNode::ground, nodes[0]);
}

void RailElm::stamp() {
    const NodeRef &vsNode = internalResistance > 0 ? nodes[1] : nodes[0];
    if (waveform == WF_DC)
        sim->stampVoltageSource(CircuitNode::ground, vsNode, voltSource, getVoltage());
    else
        sim->stampVoltageSource(CircuitNode::ground, vsNode, voltSource);
    if (internalResistance > 0)
        sim->stampResistor(nodes[1], nodes[0], internalResistance);
}

void RailElm::doStep() {
    const NodeRef &vsNode = internalResistance > 0 ? nodes[1] : nodes[0];
    if (waveform != WF_DC)
        sim->updateVoltageSource(CircuitNode::ground, vsNode, voltSource, getVoltage());
}

bool RailElm::validateRailNode(int n) {
    FindPathInfo fpi(FindPathInfo::VOLTAGE, this, getNode(n), sim);
    if (fpi.findPath(CircuitNode::ground)) {
        internalResistance = .001;
        return false;
    }
    return true;
}

void RailElm::draw(Graphics &g) {
    std::optional<std::string> rt = getRailText();
    double w = !rt ? circleSize : g.measureWidth(*rt) / 2;
    if (w > dn * .8)
        w = dn * .8;
    lead1 = interpPoint(point1, point2, 1 - w / dn);
    setBbox(point1, point2, circleSize);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1);
    drawRail(g);
    drawPosts(g);
    curcount = updateDotCount(-current, curcount);
    if (!isCreating())
        drawDots(g, point1, lead1, curcount);
}

void RailElm::drawRail(Graphics &g) {
    if (waveform == WF_SQUARE && (flags & FLAG_CLOCK) != 0)
        drawRailText(g, "CLK");
    else if (waveform == WF_DC || waveform == WF_VAR) {
        g.setColor(needsHighlight() ? selectColor : whiteColor);
        setPowerColor(g, false);
        double v = getVoltage();
        std::string s;
        if (std::abs(v) < 1)
            s = showFormat.format(v) + " V";
        else
            s = getShortUnitText(v, "V");
        if (getVoltage() > 0)
            s = "+" + s;
        drawLabeledNode(g, s, point1, lead1);
    } else {
        drawWaveform(g, point2);
    }
}

void RailElm::drawRailText(Graphics &g, const std::string &s) {
    g.setColor(needsHighlight() ? selectColor : whiteColor);
    setPowerColor(g, false);
    drawLabeledNode(g, s, point1, lead1);
}
