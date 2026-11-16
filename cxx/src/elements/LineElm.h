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

#pragma once

#include <cmath>

#include "ShapeElm.h"

class Polygon;

class LineElm : public ShapeElm {
public:
    ELM_CLASS(LineElm)
    static constexpr int ARROW_NONE = 0;
    static constexpr int ARROW_END = 1;
    static constexpr int ARROW_START = 2;
    static constexpr int ARROW_BOTH = 3;
    int arrows = 0;

    // line-only memory of the last line drawn or edited
    static inline int lastArrows = 0;

    LineElm(int xx, int yy);
    LineElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    void postConstruct(StringTokenizer *st) override;

    int getDumpType() override { return 423; }
    int defaultStyle() override { return STYLE_SOLID; }
    void remember() override;
    bool creationFailed() override { return std::hypot(x - x2, y - y2) < 16; }
    // Shift: lock to the nearest 0/45/90 degrees from the start point
    void constrain() override;
    void draw(Graphics &g) override;
    // filled arrowhead with its tip at (tx,ty), pointing away from (fx,fy)
    static Polygon arrowHead(double fx, double fy, double tx, double ty, double len, double alen);
    int shapeEditCount() override { return 1; }
    std::optional<EditInfo> getShapeEditInfo(int n) override;
    void setShapeEditValue(int n, EditInfo &ei) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    double getMouseDistance(int gx, int gy) override;
};
