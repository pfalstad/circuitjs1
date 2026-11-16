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

#include "AnalogSwitch2Elm.h"

#include "../core/CircuitNode.h"
#include "../core/Graphics.h"
#include "../core/SimulationManager.h"

void AnalogSwitch2Elm::setPoints() {
    AnalogSwitchElm::setPoints();
    calcLeads(32);
    adjustLeadsToGrid(isFlippedX(), isFlippedY());
    swposts = newPointArray(2);
    swpoles = newPointArray(2);
    labelPts = newPointArray(2);
    interpPoint2(lead1, lead2, swpoles[0], swpoles[1], 1, openhs);
    interpPoint2(point1, point2, swposts[0], swposts[1], 1, openhs);
    interpPoint2(point1, point2, labelPts[0], labelPts[1], 1 - 10 / dn, openhs + (openhs > 0 ? 10 : -10));
    ctlPoint = interpPoint(lead1, lead2, 0.5, openhs);
}

void AnalogSwitch2Elm::draw(Graphics &g) {
    setBbox(point1, point2, openhs);

    // draw first lead
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1);

    // draw second lead
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, swpoles[0], swposts[0]);

    // draw third lead
    setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, swpoles[1], swposts[1]);

    // draw switch arm
    g.setColor(lightGrayColor);
    int position = open ? 1 : 0;
    drawThickLine(g, lead1, swpoles[position]);

    updateDotCount();
    drawDots(g, point1, lead1, curcount);
    drawDots(g, swpoles[position], swposts[position], curcount);
    drawPosts(g);

    // label the two throw terminals when selected. At rest (control
    // below threshold) swposts[1] is connected, i.e. NC, and swposts[0]
    // is NO -- unless FLAG_INVERT ("Swap NO/NC") swaps that.
    if (needsHighlight()) {
        bool inverted = hasFlag(FLAG_INVERT);
        g.setColor(selectColor);
        drawCenteredText(g, inverted ? "NC" : "NO", labelPts[0].x, labelPts[0].y, true);
        drawCenteredText(g, inverted ? "NO" : "NC", labelPts[1].x, labelPts[1].y, true);
    }
}

Point AnalogSwitch2Elm::getPost(int n) {
    if (n == 0)
        return point1;
    if (n == 3)
        return ctlPoint;
    return swposts[n - 1];
}

void AnalogSwitch2Elm::calculateCurrent() {
    current = open ? (nodes[0]->v - nodes[2]->v) / r_on : (nodes[0]->v - nodes[1]->v) / r_on;
}

void AnalogSwitch2Elm::stamp() {
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
    sim->stampNonLinear(nodes[2]);
    if (needsPulldown()) {
        sim->stampResistor(nodes[1], CircuitNode::ground, r_off);
        sim->stampResistor(nodes[2], CircuitNode::ground, r_off);
    }
}

void AnalogSwitch2Elm::doStep() {
    open = nodes[3]->v < threshold;
    if (hasFlag(FLAG_INVERT))
        open = !open;
    if (open) {
        sim->stampResistor(nodes[0], nodes[2], r_on);
        if (!needsPulldown())
            sim->stampResistor(nodes[0], nodes[1], r_off);
    } else {
        sim->stampResistor(nodes[0], nodes[1], r_on);
        if (!needsPulldown())
            sim->stampResistor(nodes[0], nodes[2], r_off);
    }
}

void AnalogSwitch2Elm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "analog switch (SPDT)";
    arr[1] = "I = " + getCurrentDText(getCurrent());
}

// for SPDT the switch is never fully open, so "Normally closed" doesn't
// apply; the flag instead swaps which throw terminal is NO vs NC
std::optional<EditInfo> AnalogSwitch2Elm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo::createCheckbox("Swap NO/NC", hasFlag(FLAG_INVERT));
    return AnalogSwitchElm::getEditInfo(n);
}

void AnalogSwitch2Elm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        flags = ei.checkbox->getState() ? (flags | FLAG_INVERT) : (flags & ~FLAG_INVERT);
        return;
    }
    AnalogSwitchElm::setEditValue(n, ei);
}

double AnalogSwitch2Elm::getCurrentIntoNode(int n) {
    if (n == 0)
        return -current;
    int position = open ? 1 : 0;
    if (n == position + 1)
        return current;
    return 0;
}
