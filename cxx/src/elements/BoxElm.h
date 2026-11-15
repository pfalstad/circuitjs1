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

#include "ShapeElm.h"

class BoxElm : public ShapeElm {
public:
    ELM_CLASS(BoxElm)
    int opacity = 0;  // fill, 0-100%; 0 = no fill
    int cornerRadius = 0;

    // box-only memory of the last box drawn or edited
    static inline int lastOpacity = 0;
    static inline int lastCornerRadius = 0;

    BoxElm(int xx, int yy);
    BoxElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    void postConstruct(StringTokenizer *st) override;

    int getDumpType() override { return 'b'; }
    int defaultStyle() override { return STYLE_DASHED; }
    bool isBoxElm() override { return true; }
    void remember() override;
    bool creationFailed() override { return std::abs(x2 - x) < 32 || std::abs(y2 - y) < 32; }
    // Shift: square, using the longer side
    void constrain() override;
    // used by CircuitElm::sortBoxes()
    double area() { return (double) std::abs(x2 - x) * std::abs(y2 - y); }
    void draw(Graphics &g) override;
    // rectangle outline with rounded corners (arcs, so it survives SVG export)
    static void boxPath(Graphics &g, double bx, double by, double bw, double bh, double r);
    int shapeEditCount() override { return 2; }
    std::optional<EditInfo> getShapeEditInfo(int n) override;
    void setShapeEditValue(int n, EditInfo &ei) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    // only the edges count, so whatever is inside the box can still be picked
    double getMouseDistance(int gx, int gy) override;
    void selectRect(const Rectangle &r, bool add) override;
};
