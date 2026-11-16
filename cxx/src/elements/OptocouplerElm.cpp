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

#include "OptocouplerElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/DiodeModel.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/StringTokenizer.h"
#include "CCCSElm.h"
#include "ChipElm.h"
#include "DiodeElm.h"
#include "TransistorElm.h"

static const char *modelString = "DiodeElm 6 1\rCCCSElm 1 2 3 4\rNTransistorElm 3 4 5";
static const std::vector<int> modelExternalNodes = {6, 2, 4, 5};

OptocouplerElm::OptocouplerElm(int xx, int yy) : CompositeElm(xx, yy) {
    loadComposite(nullptr, modelString, modelExternalNodes);
    buildCompNodeList();
    allocNodes();
    noDiagonal = true;
    initOptocoupler();
    diode->modelName = "default-optocoupler-led";
    diode->setup();
}

OptocouplerElm::OptocouplerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &)
    : CompositeElm(xa, ya, xb, yb, f) {
    // pass null since we don't need to undump sub-element state from text format
    loadComposite(nullptr, modelString, modelExternalNodes);
    buildCompNodeList();
    allocNodes();
    noDiagonal = true;
    initOptocoupler();
}

void OptocouplerElm::dumpXmlModel(XmlElement *doc) {
    DiodeModel *model = diode->model;
    if (!(model->builtIn || model->dumped))
        model->dumpXml(doc);
}

void OptocouplerElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    dumpXmlModel(doc);
    CompositeElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ctr", ctr);
    CircuitXMLSerializer::dumpAttr(elem, "dmo", diode->modelName);
}

void OptocouplerElm::undumpXml(CircuitXMLDeserializer &xml) {
    CompositeElm::undumpXml(xml);
    ctr = xml.parseDoubleAttr("ctr", ctr);
    // "ix" is set on state-restore calls (from CompositeElm.dumpXmlState); absent on
    // definition/top-level loads where a missing "dmo" should fall back to "default"
    std::string defaultDmo = xml.parseStringAttr("ix", std::nullopt) ? diode->modelName : "default";
    diode->modelName = xml.parseStringAttr("dmo", defaultDmo).value_or(diode->modelName);
    initOptocoupler();
    diode->setup();
}

void OptocouplerElm::initOptocoupler() {
    csize = 2;
    cspc = 8 * 2;
    cspc2 = cspc * 2;
    diode = static_cast<DiodeElm *>(compElmList[0]);
    CCCSElm *cccs = dynamic_cast<CCCSElm *>(compElmList[1]);
    transistor = static_cast<TransistorElm *>(compElmList[2]);

    // from http://www.cel.com/pdf/appnotes/an3017.pdf
    // base expression models a ~100% CTR device; scaled by ctr
    if (cccs != nullptr)
        cccs->setExpr(jsNumberToString(ctr) +
                      "*max(0,min(.0001, select(i-.003, (-80000000000*(i)^5+800000000*(i)^4-3000000*(i)^3+5177.2*(i)^2+"
                      ".2453*(i)-.00005)*1.04/700, (9000000*(i)^5-998113*(i)^4+42174*(i)^3-861.32*(i)^2+9.0836*(i)-"
                      ".0078)*.945/700)))");

    transistor->setBeta(700);
    curCounts.assign(4, 0.0);
}

void OptocouplerElm::reset() {
    CompositeElm::reset();
    curCounts.assign(4, 0.0);
}

void OptocouplerElm::draw(Graphics &g) {
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    drawThickPolygon(g, rectPointsX, rectPointsY, 4);

    for (int i = 0; i != 4; i++) {
        setVoltageColor(g, nodes[i]->v);
        const Point &a = posts[i];
        const Point &b = stubs[i];
        drawThickLine(g, a, b);
        curCounts[i] = updateDotCount(-getCurrentIntoNode(i), curCounts[i]);
        drawDots(g, a, b, curCounts[i]);
    }

    diode->draw(g);
    transistor->draw(g);

    drawPosts(g);

    // draw little arrows
    g.setColor(lightGrayColor);
    int dflip = isFlippedX() ? -1 : 1;
    int sx = stubs[0].x + 2 * dflip;
    int sy = (int) std::trunc((stubs[0].y + stubs[1].y) / 2.);
    for (int i = 0; i != 2; i++) {
        int y = sy + i * 10 - 5;
        Point p1(sx, y);
        Point p2(sx + 20 * dflip, y);
        Polygon p = calcArrow(p1, p2, 5, 2);
        g.fillPolygon(p);
        g.drawLine(sx + 10 * dflip, y, sx + 15 * dflip, y);
    }
}

void OptocouplerElm::setPoints() {
    CompositeElm::setPoints();

    // adapted from ChipElm
    int x0 = x + cspc2;
    int y0 = y;
    int xr = x0 - cspc;
    int yr = y0 - cspc / 2;
    const int sizeX = 2;
    const int sizeY = 2;
    int xs = sizeX * cspc2;
    int ys = sizeY * cspc2 - cspc;
    rectPointsX = {xr, xr + xs, xr + xs, xr};
    rectPointsY = {yr, yr, yr + ys, yr + ys};
    setBbox(xr, yr, rectPointsX[2], rectPointsY[2]);
    stubs.assign(4, Point());

    setPin(0, x0, y0, 0, 1, -1, 0, 0, 0);
    setPin(1, x0, y0, 0, 1, -1, 0, 0, 0);
    setPin(2, x0, y0, 0, 1, 1, 0, xs - cspc2, 0);
    setPin(3, x0, y0, 0, 1, 1, 0, xs - cspc2, 0);

    int dflip = isFlippedX() ? -1 : 1;
    diode->setPosition(posts[0].x + 32 * dflip, posts[0].y, posts[1].x + 32 * dflip, posts[1].y);
    stubs[0] = diode->getPost(0);
    stubs[1] = diode->getPost(1);

    int midp = (int) std::trunc((posts[2].y + posts[3].y) / 2.);
    transistor->setFlipped(isFlippedY());
    transistor->setPosition(posts[2].x - 40 * dflip, midp, posts[2].x - 24 * dflip, midp);
    stubs[2] = transistor->getPost(1);
    stubs[3] = transistor->getPost(2);
}

bool OptocouplerElm::isFlippedX() const { return (flags & ChipElm::FLAG_FLIP_X) != 0; }
bool OptocouplerElm::isFlippedY() const { return (flags & ChipElm::FLAG_FLIP_Y) != 0; }

void OptocouplerElm::flipX(int center2, int count) {
    flags ^= ChipElm::FLAG_FLIP_X;
    if (count != 1) {
        int xs = 3 * cspc2;
        x = center2 - x - xs;
        x2 = center2 - x2;
    }
    setPoints();
}

void OptocouplerElm::flipY(int center2, int count) {
    flags ^= ChipElm::FLAG_FLIP_Y;
    if (count != 1) {
        int ys = 1 * cspc2;
        y = center2 - y - ys;
        y2 = center2 - y2;
    }
    setPoints();
}

void OptocouplerElm::setPin(int n, int px, int py, int ddx, int ddy, int dax, int day, int sx, int sy) {
    int pos = n % 2;
    if (isFlippedX()) {
        ddx = -ddx;
        dax = -dax;
        px += cspc2;
        sx = -sx;
    }
    if (isFlippedY()) {
        ddy = -ddy;
        day = -day;
        py += cspc2;
        sy = -sy;
    }
    int xa = px + cspc2 * ddx * pos + sx;
    int ya = py + cspc2 * ddy * pos + sy;
    setPost(n, Point(xa + dax * cspc2, ya + day * cspc2));
    stubs[n] = Point(xa + dax * cspc, ya + day * cspc);
}

void OptocouplerElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "optocoupler";
    arr[1] = "CTR Scale = " + showFormat.format(ctr);
    arr[2] = "Iin = " + getCurrentText(getCurrentIntoNode(0));
    arr[3] = "Iout = " + getCurrentText(getCurrentIntoNode(2));
}

std::optional<EditInfo> OptocouplerElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("CTR Scale", ctr, 0, 0).setDimensionless();
    if (n == 1) {
        EditInfo ei("LED Model", 0, -1, -1);
        models = DiodeModel::getModelList(false);
        ei.choice = Choice();
        for (size_t i = 0; i != models.size(); i++) {
            ei.choice->add(models[i]->getDescription());
            if (models[i] == diode->model)
                ei.choice->select((int) i);
        }
        return ei;
    }
    return std::nullopt;
}

void OptocouplerElm::updateModels() {
    diode->setup();
}

void OptocouplerElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0) {
        ctr = ei.value;
        initOptocoupler();
    }
    if (n == 1) {
        diode->model = models[ei.choice->getSelectedIndex()];
        diode->modelName = diode->model->name;
        diode->setup();
    }
}
