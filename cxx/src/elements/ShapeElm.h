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

#include <optional>
#include <string>
#include <vector>

#include "GraphicElm.h"

// Common base for the editable drawing shapes (BoxElm, LineElm): colour, thickness and
// line style, plus a "last used" memory so a new shape copies the one most recently drawn
// or edited.  Snap mode is a session setting shared by all shapes and isn't saved.
// Edit dialog rows: the 3 common rows, the subclass's own rows (getShapeEditInfo), then
// the 2 snap checkboxes.
class ShapeElm : public GraphicElm {
public:
    static constexpr int SNAP_FREE = 0;
    static constexpr int SNAP_GRID = 1;
    static constexpr int SNAP_MID = 2;
    static constexpr int STYLE_SOLID = 0;
    static constexpr int STYLE_DASHED = 1;
    static constexpr int STYLE_DOTTED = 2;
    static constexpr int STYLE_LONG_DASH = 3;
    static constexpr int STYLE_DASH_DOT = 4;
    static constexpr int STYLE_DASH_DOT_DOT = 5;
    static const std::vector<std::string> styleNames;

    // dash/gap patterns for thickness 1-2; they step up every 2 thicknesses (x2 at 3-4,
    // x3 at 5-6...).  Line ends are round, so a near-zero dash draws a round dot.
    static constexpr double DOT = .01;
    static const std::vector<std::vector<double>> dashPatterns;

    // session setting, not saved: snap mode for drawing and moving shapes
    static inline int snap = SNAP_FREE;

    // memory of the last shape drawn or edited, shared by boxes and lines
    static inline std::optional<std::string> lastColor;
    static inline int lastThickness = 1;
    static inline int lastStyle = -1;  // -1 = each shape's own default (box dashed, line solid)

    std::optional<std::string> color;  // none = default gray
    int thickness = 1;
    int lineStyle = 0;
    // set by MouseManager while drawing: Shift held locks a line to 0/45/90 degrees,
    // a box to a square
    bool shiftLock = false;

    ShapeElm(int xx, int yy) : GraphicElm(xx, yy) {}
    ShapeElm(int xa, int ya, int xb, int yb, int f) : GraphicElm(xa, ya, xb, yb, f) {}
    // new shape being drawn (also used when loading, see undumpXml): copy the last one.
    // (TS: the constructor; a C++ constructor can't call defaultStyle())
    void postConstruct(StringTokenizer *st) override;

    virtual int defaultStyle() = 0;

    bool isShapeElm() override { return true; }

    virtual void remember();
    void draggingDone() override { remember(); }

    // ---- snapping and drawing out ----

    int snapCoord(int v);
    // first point of a new shape, from the raw (unsnapped) mouse position
    void placeStart(int xx, int yy);
    void drag(int xx, int yy) override;
    // Shift held while drawing; each shape decides what that means
    virtual void constrain() {}
    // drag one endpoint to a raw mouse position
    void movePostTo(int n, int xx, int yy);
    // ticking a snap checkbox in this shape's dialog snaps this shape too, not just the
    // ones drawn or moved afterwards.  Skipped if it would flatten the shape: a line to a
    // point, or a box to a line.
    void snapPoints();

    // shapes have no posts, but both stored points are resize handles
    int getNumHandles() override { return 2; }
    // show both handles, the grabbed one bigger
    void drawHandles(Graphics &g, const Color &c) override;

    // ---- drawing helpers ----

    // set colour, width and dash for stroking; call endStroke() afterwards
    void beginStroke(Graphics &g);
    void endStroke(Graphics &g);
    Color shapeColor();

    // ---- edit dialog ----

    bool showPropertiesOnCreate() override { return false; }
    virtual int shapeEditCount() { return 0; }
    virtual std::optional<EditInfo> getShapeEditInfo(int n) { return std::nullopt; }
    virtual void setShapeEditValue(int n, EditInfo &ei) {}
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;

    // ---- save/load (attributes left out when they're the default) ----

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;

    void getInfo(std::vector<std::string> &arr) override {}
    int getShortcut() override { return 0; }
};
