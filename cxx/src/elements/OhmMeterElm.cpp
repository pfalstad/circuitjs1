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

#include "OhmMeterElm.h"

#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/ScopeConstants.h"

using namespace ScopeConstants;

void OhmMeterElm::setPoints() {
    CurrentElm::setPoints();
    calcLeads(26);
}

void OhmMeterElm::draw(Graphics &g) {
    const int cr = 12;
    draw2Leads(g);
    setVoltageColor(g, (nodes[0]->v + nodes[1]->v) / 2);
    setPowerColor(g, false);

    drawThickCircle(g, center.x, center.y, cr);
    drawCenteredText(g, Locale::ohmString, center.x, center.y, true);

    setBbox(point1, point2, cr);
    doDots(g);
    if (showValues() && current != 0) {
        std::string s = getShortUnitText(getVoltageDiff() / current, Locale::ohmString);
        if (dx == 0 || dy == 0)
            drawValues(g, s, cr);
    }
    drawPosts(g);
}

double OhmMeterElm::getScopeValue(int x) {
    return (x == VAL_R) ? getVoltageDiff() / current : CurrentElm::getScopeValue(x);
}

int OhmMeterElm::getScopeUnits(int x) {
    return (x == VAL_R) ? UNITS_OHMS : CurrentElm::getScopeUnits(x);
}

bool OhmMeterElm::canShowValueInScope(int x) {
    return x == VAL_R;
}

void OhmMeterElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "ohmmeter";
    if (current == 0)
        arr[1] = "R = ∞";
    else
        arr[1] = "R = " + getUnitText(getVoltageDiff() / current, Locale::ohmString);
}
