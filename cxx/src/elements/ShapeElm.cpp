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

#include "ShapeElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/SimApp.h"

const std::vector<std::string> ShapeElm::styleNames = {"Solid", "Dashed", "Dotted", "Long Dash", "Dash-Dot",
                                                       "Dash-Dot-Dot"};

const std::vector<std::vector<double>> ShapeElm::dashPatterns = {
    {}, {16, 6}, {DOT, 4}, {32, 10}, {16, 5, DOT, 5}, {16, 5, DOT, 5, DOT, 5}};

void ShapeElm::postConstruct(StringTokenizer *st) {
    GraphicElm::postConstruct(st);
    if (st == nullptr) {
        color = lastColor;
        thickness = lastThickness;
        lineStyle = (lastStyle < 0) ? defaultStyle() : lastStyle;
    } else {
        lineStyle = defaultStyle();
    }
}

void ShapeElm::remember() {
    lastColor = color;
    lastThickness = thickness;
    lastStyle = lineStyle;
}

int ShapeElm::snapCoord(int v) {
    if (snap == SNAP_GRID)
        return app->snapGrid(v);
    if (snap == SNAP_MID) {
        int h = app->gridSize / 2;
        return app->snapGrid(v - h) + h;
    }
    return v;
}

void ShapeElm::placeStart(int xx, int yy) {
    x = x2 = snapCoord(xx);
    y = y2 = snapCoord(yy);
    setBbox(x, y, x2, y2);
}

void ShapeElm::drag(int xx, int yy) {
    x2 = snapCoord(xx);
    y2 = snapCoord(yy);
    if (shiftLock)
        constrain();
}

void ShapeElm::movePostTo(int n, int xx, int yy) {
    xx = snapCoord(xx);
    yy = snapCoord(yy);
    if (n == 0 ? (xx == x2 && yy == y2) : (xx == x && yy == y))
        return;  // don't collapse to zero size
    if (n == 0) {
        x = xx;
        y = yy;
    } else {
        x2 = xx;
        y2 = yy;
    }
    setBbox(x, y, x2, y2);
    setPoints();
}

void ShapeElm::snapPoints() {
    int sx = snapCoord(x), sy = snapCoord(y);
    int sx2 = snapCoord(x2), sy2 = snapCoord(y2);
    if (isBoxElm() ? (sx == sx2 || sy == sy2) : (sx == sx2 && sy == sy2))
        return;
    x = sx;
    y = sy;
    x2 = sx2;
    y2 = sy2;
    setBbox(x, y, x2, y2);
    setPoints();
    app->repaint();
}

void ShapeElm::drawHandles(Graphics &g, const Color &c) {
    g.setColor(c);
    if (lastHandleGrabbed == 0)
        g.fillRect(x - 4, y - 4, 9, 9);
    else
        g.fillRect(x - 3, y - 3, 7, 7);
    if (lastHandleGrabbed == 1)
        g.fillRect(x2 - 4, y2 - 4, 9, 9);
    else
        g.fillRect(x2 - 3, y2 - 3, 7, 7);
}

void ShapeElm::beginStroke(Graphics &g) {
    g.setColor(needsHighlight() ? selectColor : shapeColor());
    g.setLineWidth(thickness);
    const std::vector<double> &p = dashPatterns[lineStyle];
    if (!p.empty()) {
        int step = (thickness + 1) / 2;
        std::vector<double> d;
        for (double v : p)
            d.push_back(v * step);
        g.setLineDashPattern(d);
    }
}

void ShapeElm::endStroke(Graphics &g) {
    g.setLineDash(0, 0);
    g.setLineWidth(1.0);
}

Color ShapeElm::shapeColor() {
    return color ? Color(*color) : Color::GRAY;
}

std::optional<EditInfo> ShapeElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Color", color ? *color : Color::GRAY.getHexValue()).setIsColor();
    if (n == 1)
        return EditInfo("Thickness", thickness, 1, 10).setDimensionless().setUnitStep().disallowSliders();
    if (n == 2) {
        EditInfo ei("Line Style", 0, -1, -1);
        ei.choice.emplace();
        for (const std::string &s : styleNames)
            ei.choice->add(s);
        ei.choice->select(lineStyle);
        return ei;
    }
    n -= 3;
    if (n < shapeEditCount())
        return getShapeEditInfo(n);
    n -= shapeEditCount();
    // neither ticked = free placement.  ticking one also snaps this shape (snapPoints)
    if (n == 0)
        return EditInfo::createCheckbox("Snap to Grid", snap == SNAP_GRID);
    if (n == 1)
        return EditInfo::createCheckbox("Snap to Mid-Grid", snap == SNAP_MID);
    return std::nullopt;
}

static std::string toLower(std::string s) {
    for (char &c : s)
        c = (char) std::tolower((unsigned char) c);
    return s;
}

void ShapeElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        std::string c = ei.textf->value;
        if (toLower(c) == toLower(Color::GRAY.getHexValue()))
            color.reset();
        else
            color = c;
    } else if (n == 1) {
        int t = (int) std::round(ei.value);
        if (t < 1 || t > 10) {
            ei.setError("must be from 1 to 10");
            return;
        }
        thickness = t;
    } else if (n == 2) {
        lineStyle = ei.choice->getSelectedIndex();
    } else if (n - 3 < shapeEditCount()) {
        setShapeEditValue(n - 3, ei);
    } else {
        int k = n - 3 - shapeEditCount();
        int mode = (k == 0) ? SNAP_GRID : SNAP_MID;
        if (ei.checkbox->getState()) {
            snap = mode;
            // (rebuild the dialog to untick the other snap box)
            ei.newDialog = true;
            snapPoints();
        } else if (snap == mode)
            snap = SNAP_FREE;
    }
    remember();
}

void ShapeElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    GraphicElm::dumpXml(doc, elem);
    if (color)
        CircuitXMLSerializer::dumpAttr(elem, "co", *color);
    if (thickness != 1)
        CircuitXMLSerializer::dumpAttr(elem, "th", thickness);
    if (lineStyle != defaultStyle())
        CircuitXMLSerializer::dumpAttr(elem, "ls", lineStyle);
}

void ShapeElm::undumpXml(CircuitXMLDeserializer &xml) {
    GraphicElm::undumpXml(xml);
    // loading goes through the new-shape constructor, which copied the remembered
    // settings; a missing attribute means the default, not the remembered value
    color = xml.parseStringAttr("co", std::nullopt);
    thickness = xml.parseIntAttr("th", 1);
    lineStyle = xml.parseIntAttr("ls", defaultStyle());
}
