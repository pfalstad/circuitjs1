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

#include "ScopeElm.h"

#include <algorithm>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/Graphics.h"
#include "../core/Scope.h"
#include "../core/SimApp.h"
#include "../core/StringTokenizer.h"
#include "../core/XmlDoc.h"

ScopeElm::ScopeElm(int xx, int yy) : CircuitElm(xx, yy) {
    noDiagonal = false;
    x2 = x + 128;
    y2 = y + 64;
    elmScope = std::make_unique<Scope>(app, sim);
    setPoints();
}

ScopeElm::ScopeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CircuitElm(xa, ya, xb, yb, f) {
    noDiagonal = false;
    std::string sStr = st.nextToken();
    StringTokenizer sst(sStr, "_");
    elmScope = std::make_unique<Scope>(app, sim);
    elmScope->undump(sst);
    setPoints();
    elmScope->resetGraph();
}

ScopeElm::~ScopeElm() = default;

void ScopeElm::setScopeElm(CircuitElm *e) {
    elmScope->setElm(e);
    elmScope->resetGraph();
}

void ScopeElm::setScopeRect() {
    int i1 = app->transformX(std::min(x, x2));
    int i2 = app->transformX(std::max(x, x2));
    int j1 = app->transformY(std::min(y, y2));
    int j2 = app->transformY(std::max(y, y2));
    Rectangle r(i1, j1, i2 - i1, j2 - j1);
    const Rectangle &sr = elmScope->rect;
    if (r.x != sr.x || r.y != sr.y || r.width != sr.width || r.height != sr.height)
        elmScope->setRect(r);
}

void ScopeElm::setPoints() {
    CircuitElm::setPoints();
    if (elmScope)
        setScopeRect();
}

void ScopeElm::setElmScope(std::unique_ptr<Scope> s) {
    elmScope = std::move(s);
}

void ScopeElm::stepScope() {
    if (elmScope)
        elmScope->timeStep();
}

void ScopeElm::reset() {
    CircuitElm::reset();
    if (elmScope)
        elmScope->resetGraphFull(true);
}

void ScopeElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    elmScope->dumpXml(elem);
}

void ScopeElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    for (const XmlElement *child : xml.getChildElements()) {
        if (child->tagName == "o") {
            xml.parseChildElement(child);
            elmScope->undumpXml(xml);
            break;
        }
    }
    elmScope->resetGraph();
}

void ScopeElm::draw(Graphics &g) {
    g.setColor(needsHighlight() ? selectColor : whiteColor);
    g.saveState();
    // draw in screen coordinates, like the docked scopes
    g.scale(1 / app->transform[0], 1 / app->transform[3]);
    g.translate(-app->transform[4], -app->transform[5]);

    setScopeRect();
    elmScope->position = -1;
    elmScope->draw(g);
    g.restoreState();
    setBbox(point1, point2, 0);
    drawPosts(g);
}

void ScopeElm::selectScope(double mx, double my) {
    elmScope->selectScope(mx, my);
}
