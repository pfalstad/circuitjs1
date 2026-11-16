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

#include "TunnelDiodeElm.h"

#include <cmath>

#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/SimulationManager.h"

void TunnelDiodeElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(16);
    cathode = newPointArray(4);
    std::vector<Point> pa = newPointArray(2);
    interpPoint2(lead1, lead2, pa[0], pa[1], 0, hs);
    interpPoint2(lead1, lead2, cathode[0], cathode[1], 1, hs);
    interpPoint2(lead1, lead2, cathode[2], cathode[3], .8, hs);
    poly = createPolygon(pa[0], pa[1], lead2);
}

void TunnelDiodeElm::draw(Graphics &g) {
    setBbox(point1, point2, hs);

    double v1 = nodes[0]->v;
    double v2 = nodes[1]->v;

    draw2Leads(g);

    // draw arrow thingy
    setPowerColor(g, true);
    setVoltageColor(g, v1);
    g.fillPolygon(poly);

    // draw thing arrow is pointing to
    setVoltageColor(g, v2);
    drawThickLine(g, cathode[0], cathode[1]);
    drawThickLine(g, cathode[2], cathode[0]);
    drawThickLine(g, cathode[3], cathode[1]);

    doDots(g);
    drawPosts(g);
}

double TunnelDiodeElm::limitStep(double vnew, double vold) {
    // Prevent voltage changes of more than 1V when iterating.
    if (vnew > vold + 1)
        return vold + 1;
    if (vnew < vold - 1)
        return vold - 1;
    return vnew;
}

void TunnelDiodeElm::stamp() {
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
}

void TunnelDiodeElm::doStep() {
    double voltdiff = nodes[0]->v - nodes[1]->v;
    if (std::abs(voltdiff - lastvoltdiff) > .01)
        sim->converged = false;
    voltdiff = limitStep(voltdiff, lastvoltdiff);
    lastvoltdiff = voltdiff;

    double i0 = piv * jsmath::exp(-pvv);
    double i = pip * jsmath::exp(-pvpp / pvt) * (jsmath::exp(voltdiff / pvt) - 1) +
        pip * (voltdiff / pvp) * jsmath::exp(1 - voltdiff / pvp) +
        piv * jsmath::exp(voltdiff - pvv) - i0;

    double geq = pip * jsmath::exp(-pvpp / pvt) * jsmath::exp(voltdiff / pvt) / pvt +
        pip * jsmath::exp(1 - voltdiff / pvp) / pvp
        - jsmath::exp(1 - voltdiff / pvp) * pip * voltdiff / (pvp * pvp) +
        jsmath::exp(voltdiff - pvv) * piv;
    double nc = i - geq * voltdiff;
    sim->stampConductance(nodes[0], nodes[1], geq);
    sim->stampCurrentSource(nodes[0], nodes[1], nc);
}

void TunnelDiodeElm::calculateCurrent() {
    double voltdiff = nodes[0]->v - nodes[1]->v;
    double i0 = piv * jsmath::exp(-pvv);
    current = pip * jsmath::exp(-pvpp / pvt) * (jsmath::exp(voltdiff / pvt) - 1) +
        pip * (voltdiff / pvp) * jsmath::exp(1 - voltdiff / pvp) +
        piv * jsmath::exp(voltdiff - pvv) - i0;
}

void TunnelDiodeElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "tunnel diode";
    arr[1] = "I = " + getCurrentText(getCurrent());
    arr[2] = "Vd = " + getVoltageText(getVoltageDiff());
    arr[3] = "P = " + getUnitText(getPower(), "W");
}
