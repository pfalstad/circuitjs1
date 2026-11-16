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

#include "TriodeElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

TriodeElm::TriodeElm(int xx, int yy) : CircuitElm(xx, yy) {
    mu = 93;
    kg1 = 680;
    flags |= FLAG_DSIGN_FIX;
    setup();
}

TriodeElm::TriodeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CircuitElm(xa, ya, xb, yb, f) {
    mu = parseFloatStrict(st.nextToken());
    kg1 = parseFloatStrict(st.nextToken());
    setup();
}

void TriodeElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "mu", mu);
    CircuitXMLSerializer::dumpAttr(elem, "kg", kg1);
}

void TriodeElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    mu = xml.parseDoubleAttr("mu", mu);
    kg1 = xml.parseDoubleAttr("kg", kg1);
}

void TriodeElm::setPoints() {
    CircuitElm::setPoints();
    int s = ((flags & FLAG_DSIGN_FIX) != 0) ? dsign : 1;
    int flip = ((flags & FLAG_FLIP) != 0) ? -s : s;
    plate = newPointArray(4);
    grid = newPointArray(8);
    cath = newPointArray(4);
    grid[0] = point1;
    int nearw = 8 * flip;
    plate[1] = interpPoint(point1, point2, 1, nearw);
    int farw = 32 * flip;
    plate[0] = interpPoint(point1, point2, 1, farw);
    const int platew = 18;
    interpPoint2(point2, plate[1], plate[2], plate[3], 1, platew);

    circler = 24;
    grid[1] = interpPoint(point1, point2, (dn - circler) / dn, 0);
    for (int i = 0; i != 3; i++) {
        grid[2 + i * 2] = interpPoint(grid[1], point2, (i * 3 + 1) / 4.5, 0);
        grid[3 + i * 2] = interpPoint(grid[1], point2, (i * 3 + 2) / 4.5, 0);
    }
    midgrid = point2;

    int cathw = 16 * flip;
    midcath = interpPoint(point1, point2, 1, -nearw);
    interpPoint2(point2, plate[1], cath[1], cath[2], -1, cathw);
    cath[3] = interpPoint(point2, plate[1], -1.2, -cathw);
    cath[0] = interpPoint(point2, plate[1], (double) -farw / nearw, cathw);
}

void TriodeElm::draw(Graphics &g) {
    g.setColor("#888888");
    drawThickCircle(g, point2.x, point2.y, circler);
    setBbox(point1, plate[0], 16);
    adjustBbox(cath[0].x, cath[1].y, point2.x + circler, point2.y + circler);
    // draw plate
    setVoltageColor(g, nodes[0]->v);
    setPowerColor(g, currentp * (nodes[0]->v - nodes[2]->v));
    drawThickLine(g, plate[0], plate[1]);
    drawThickLine(g, plate[2], plate[3]);
    // draw grid
    setVoltageColor(g, nodes[1]->v);
    setPowerColor(g, currentg * (nodes[1]->v - nodes[2]->v));
    for (int i = 0; i != 8; i += 2)
        drawThickLine(g, grid[i], grid[i + 1]);
    // draw cathode
    setVoltageColor(g, nodes[2]->v);
    setPowerColor(g, 0.0);
    for (int i = 0; i != 3; i++)
        drawThickLine(g, cath[i], cath[i + 1]);
    // draw dots
    curcountp = updateDotCount(currentp, curcountp);
    curcountc = updateDotCount(currentc, curcountc);
    curcountg = updateDotCount(currentg, curcountg);
    if (!isCreating()) {
        drawDots(g, plate[0], midgrid, curcountp);
        drawDots(g, midgrid, midcath, curcountc);
        drawDots(g, midcath, cath[1], addCurCount(curcountc, 8));
        drawDots(g, cath[1], cath[0], addCurCount(curcountc, 8));
        drawDots(g, point1, midgrid, curcountg);
    }
    drawPosts(g);
}

double TriodeElm::getCurrentIntoNode(int n) {
    if (n == 2)
        return currentc;
    if (n == 0)
        return -currentp;
    return -currentg;
}

double TriodeElm::getPower() {
    return (nodes[plateN]->v - nodes[cathN]->v) * currentc +
        (nodes[gridN]->v - nodes[cathN]->v) * currentg;
}

void TriodeElm::doStep() {
    double vs[3] = {nodes[0]->v, nodes[1]->v, nodes[2]->v};
    if (vs[1] > lastv1 + .5)
        vs[1] = lastv1 + .5;
    if (vs[1] < lastv1 - .5)
        vs[1] = lastv1 - .5;
    if (vs[2] > lastv2 + .5)
        vs[2] = lastv2 + .5;
    if (vs[2] < lastv2 - .5)
        vs[2] = lastv2 - .5;
    double vgk = vs[gridN] - vs[cathN];
    double vpk = vs[plateN] - vs[cathN];
    if (std::abs(lastv0 - vs[0]) > .01 ||
        std::abs(lastv1 - vs[1]) > .01 ||
        std::abs(lastv2 - vs[2]) > .01)
        sim->converged = false;
    lastv0 = vs[0];
    lastv1 = vs[1];
    lastv2 = vs[2];
    double ids = 0;
    double gm = 0;
    double Gds = 0;
    double ival = vgk + vpk / mu;
    currentg = 0;
    if (vgk > .01) {
        sim->stampResistor(nodes[gridN], nodes[cathN], gridCurrentR);
        currentg = vgk / gridCurrentR;
    } else
        sim->stampResistor(nodes[gridN], nodes[cathN], 1e8);
    if (ival < 0) {
        Gds = 1e-8;
        ids = vpk * Gds;
    } else {
        ids = jsmath::pow(ival, 1.5) / kg1;
        double q = 1.5 * std::sqrt(ival) / kg1;
        Gds = q;
        gm = q / mu;
    }
    currentp = ids;
    currentc = ids + currentg;
    double rs = -ids + Gds * vpk + gm * vgk;
    sim->stampMatrix(nodes[plateN], nodes[plateN], Gds);
    sim->stampMatrix(nodes[plateN], nodes[cathN], -Gds - gm);
    sim->stampMatrix(nodes[plateN], nodes[gridN], gm);
    sim->stampMatrix(nodes[cathN], nodes[plateN], -Gds);
    sim->stampMatrix(nodes[cathN], nodes[cathN], Gds + gm);
    sim->stampMatrix(nodes[cathN], nodes[gridN], -gm);
    sim->stampRightSide(nodes[plateN], rs);
    sim->stampRightSide(nodes[cathN], -rs);
}

void TriodeElm::stamp() {
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
    sim->stampNonLinear(nodes[2]);
}

void TriodeElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "triode";
    double vac = nodes[plateN]->v - nodes[cathN]->v;
    double vgc = nodes[gridN]->v - nodes[cathN]->v;
    double vag = nodes[plateN]->v - nodes[gridN]->v;
    arr[1] = "Vac = " + getVoltageText(vac);
    arr[2] = "Vgc = " + getVoltageText(vgc);
    arr[3] = "Vag = " + getVoltageText(vag);
    arr[4] = "Ic = " + getUnitText(currentc, "A");
    arr[5] = "Ig = " + getUnitText(currentg, "A");
}

std::optional<EditInfo> TriodeElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("mu", mu, 0, 0).setDimensionless().setPositive();
    if (n == 1)
        return EditInfo("kg1", kg1, 0, 0).setDimensionless().setPositive();
    return std::nullopt;
}

void TriodeElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        mu = ei.value;
    if (n == 1)
        kg1 = ei.value;
}

void TriodeElm::flipX(int c2, int count) {
    if (x == x2)
        flags ^= FLAG_FLIP;
    if ((flags & FLAG_DSIGN_FIX) == 0 && x != x2)
        flags ^= FLAG_FLIP;
    CircuitElm::flipX(c2, count);
}

void TriodeElm::flipY(int c2, int count) {
    if (y == y2)
        flags ^= FLAG_FLIP;
    if ((flags & FLAG_DSIGN_FIX) == 0 && y != y2)
        flags ^= FLAG_FLIP;
    CircuitElm::flipY(c2, count);
}

void TriodeElm::flipXY(int xmy, int count) {
    flags ^= FLAG_FLIP;
    CircuitElm::flipXY(xmy, count);
}
