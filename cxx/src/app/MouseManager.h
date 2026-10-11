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

#include <QMouseEvent>
#include <QPointer>
#include <QString>
#include <QWheelEvent>
#include <optional>
#include <vector>

#include "ScrollValuePopup.h"
#include "core/Rectangle.h"

class CirSim;
class CircuitElm;

// mouse handling for the circuit canvas (port of MouseManager.ts)
class MouseManager {
public:
    static constexpr int POSTGRABSQ = 25;
    static constexpr int MINPOSTGRABSIZE = 256;

    explicit MouseManager(CirSim *sim) : sim(sim) {}

    void onMouseDown(QMouseEvent *e);
    void onMouseMove(QMouseEvent *e);
    void onMouseUp(QMouseEvent *e);
    void onMouseOut();
    void onMouseWheel(QWheelEvent *e);
    void onDoubleClick(QMouseEvent *e);

    CircuitElm *getMouseElm() const { return mouseElm; }
    void setMouseElm(CircuitElm *ce);
    void clearMouseElm() { setMouseElm(nullptr); }
    void clearSelection();
    // split the wire under the context menu / cmd-click position
    void doSplit(CircuitElm *ce);
    // where the mouse was last pressed (the context menu's position)
    double menuX = 0, menuY = 0;

    int inverseTransformX(double x) const;
    int inverseTransformY(double y) const;
    int transformX(double x) const;
    int transformY(double y) const;

    void zoomCircuit(double dy, bool fromKeyboard = false);
    void setCircuitScale(double newScale, bool fromKeyboard = false);

    int tempMouseMode = 6;  // SimApp::MODE_SELECT
    int mousePost = -1;
    double mouseCursorX = -1, mouseCursorY = -1;
    std::optional<Rectangle> selectedArea;
    // mouse is over the splitter between the circuit and the scope area
    bool mouseWasOverSplitter = false;
    double wheelSensitivity = 1;

    // ---- Toolbar drag-and-drop ----
    // A press-and-drag on a toolbar icon drops a new element where the mouse is released,
    // instead of just switching the mouse mode the way a plain click does.
    // (positions are global screen coordinates)
    bool isToolbarDragPending() const { return !toolbarDragClass.isEmpty(); }
    bool isToolbarDragActive() const { return toolbarDragActive; }
    void beginToolbarDrag(const QString &className, QPoint pos);
    void cancelToolbarDrag();
    void toolbarDragMove(QPoint pos, bool vertical);
    // returns true if a real drag happened (so the button click should be ignored)
    bool toolbarDragEnd(QPoint pos);
    // re-place the element being dragged, e.g. when shift is pressed/released
    // without any mouse movement
    void toolbarDragOrientationChanged(bool vertical);

private:
    // Split any WireElm (including RoutedWireElm) whose interior contains (px, py).
    // Returns true if any wire was split.
    bool splitWireAt(int px, int py);
    // Split the lead stub of any non-wire element whose lead contains (px, py).
    // Moves the element's post to the split point and inserts a wire for the remainder.
    // Returns true if any lead was split.
    bool splitLeadsAt(int px, int py);
    // Split any wire or element lead whose interior contains (px, py).
    bool splitAt(int px, int py);
    void mouseSelect(double sx, double sy, bool shift);
    void mouseDragged(QMouseEvent *e);
    bool doSwitch(int x, int y);
    void dragAll(double x, double y);
    void dragSplitter(double y);
    bool mouseIsOverSplitter(double x, double y);
    void dragRow(int x, int y);
    void dragColumn(int x, int y);
    bool onlyGraphicsElmsSelected();
    bool dragSelected(int x, int y);
    void dragPost(int x, int y, bool all);
    void selectArea(int x, int y, bool add);
    bool anySelectedButMouse();
    void removeZeroLengthElements();
    // returns the element that was just created, if any
    CircuitElm *endDrag();
    int snapGrid(int x) const;

    CirSim *sim;
    CircuitElm *mouseElm = nullptr;
    CircuitElm *heldSwitchElm = nullptr;
    bool mouseDragging = false;
    bool dragging = false;
    bool didSwitch = false;
    int draggingPost = -1;
    int dragGridX = 0, dragGridY = 0;
    double dragScreenX = 0, dragScreenY = 0;
    int initDragGridX = 0, initDragGridY = 0;
    double mouseDownScreenX = 0, mouseDownScreenY = 0;
    double mouseDownTime = 0;
    double zoomTime = 0;
    // value/type popup opened by the wheel (ScrollValuePopup, TypeScrollPopup)
    QPointer<WheelPopup> wheelPopup;
    std::vector<CircuitElm *> dragRowColElms;
    std::vector<int> dragRowColPosts;

    static constexpr int TOOLBAR_DRAG_THRESHOLD = 6;
    QString toolbarDragClass;
    QPoint toolbarDragStart;
    bool toolbarDragActive = false;
    bool toolbarDragVertical = false;
    int toolbarDragAnchorX = 0, toolbarDragAnchorY = 0;
};
