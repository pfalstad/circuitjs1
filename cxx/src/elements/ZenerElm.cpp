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

#include "ZenerElm.h"

#include "../core/DiodeModel.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/StringTokenizer.h"

std::string ZenerElm::lastZenerModelName = "default-zener";

ZenerElm::ZenerElm(int xx, int yy) : DiodeElm(xx, yy) {
    modelName = lastZenerModelName;
    setup();
}

ZenerElm::ZenerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : DiodeElm(xa, ya, xb, yb, f, st) {
    if ((f & FLAG_MODEL) == 0) {
        double zvoltage = parseFloatStrict(st.nextToken());
        model = DiodeModel::getModelWithParameters(model->fwdrop, zvoltage);
        modelName = model->name;
    }
    setup();
}

void ZenerElm::setPoints() {
    DiodeElm::setPoints();
    calcLeads(16);
    cathode = newPointArray(2);
    wing = newPointArray(2);
    std::vector<Point> pa = newPointArray(2);
    interpPoint2(lead1, lead2, pa[0], pa[1], 0, hs);
    interpPoint2(lead1, lead2, cathode[0], cathode[1], 1, hs);
    interpPoint(cathode[0], cathode[1], wing[0], -0.2, -hs);
    interpPoint(cathode[1], cathode[0], wing[1], -0.2, -hs);
    poly = createPolygon(pa[0], pa[1], lead2);
}

void ZenerElm::draw(Graphics &g) {
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

    // draw wings on cathode
    drawThickLine(g, wing[0], cathode[0]);
    drawThickLine(g, wing[1], cathode[1]);

    doDots(g);
    drawPosts(g);
}

void ZenerElm::getInfo(std::vector<std::string> &arr) {
    DiodeElm::getInfo(arr);
    arr[0] = "Zener diode";
    arr[5] = "Vz = " + getVoltageText(model->breakdownVoltage);
}
