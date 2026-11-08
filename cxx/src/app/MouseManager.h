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
#include <array>
#include <QPointer>
#include <QString>
#include <QWheelEvent>
#include <map>
#include <optional>
#include <set>
#include <unordered_set>
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
    // re-evaluate hover (e.g. Shift net highlight) when Shift is pressed/released
    void shiftChanged(bool shift);
    void onMouseWheel(QWheelEvent *e);
    void onDoubleClick(QMouseEvent *e);

    CircuitElm *getMouseElm() const { return mouseElm; }
    void setMouseElm(CircuitElm *ce);
    void clearMouseElm() { setMouseElm(nullptr); }
    void clearSelection();
    void clearPostSelection();
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

    // ---- Select/Drag Posts mode ----
    // The user boxes a set of posts, then drags them; elements with one end selected
    // stretch, so this can be used to open up (or close up) space in a circuit.
    using Loc = std::pair<int, int>;
    // locations of the posts that are selected (for drawing and hit testing)
    std::set<Loc> postSelLocs;
    // rigid elements (chips, transistors, text...) that move as a whole
    std::unordered_set<CircuitElm *> postSelRigid;
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

public:
    CircuitElm *heldSwitchElm = nullptr;

private:
    // Split any WireElm (including RoutedWireElm) whose interior contains (px, py).
    // Returns true if any wire was split.
    bool splitWireAt(int px, int py, const std::unordered_set<CircuitElm *> *exclude = nullptr);
    // Split the lead stub of any non-wire element whose lead contains (px, py).
    // Moves the element's post to the split point and inserts a wire for the remainder.
    // Returns true if any lead was split.
    bool splitLeadsAt(int px, int py, const std::unordered_set<CircuitElm *> *exclude = nullptr);
    // Split any wire or element lead whose interior contains (px, py),
    // skipping elements in exclude.
    bool splitAt(int px, int py, const std::unordered_set<CircuitElm *> *exclude = nullptr);
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
    static bool isRigid(CircuitElm *ce);
    static std::vector<std::optional<Loc>> postKeys(CircuitElm *ce);
    void selectPostsArea(int x, int y);
    std::optional<std::vector<int>> handleFollowers(CircuitElm *ce);
    std::optional<std::vector<int>> cachedHandleFollowers(CircuitElm *ce);
    void computePostSelection();
    bool postSelectionHit(int x, int y);
    bool dragPostSelection(int x, int y);
    bool anySelectedButMouse();
    void removeZeroLengthElements();
    // returns the element that was just created, if any
    CircuitElm *endDrag();
    void editCreatedElm(CircuitElm *elm);
    int snapGrid(int x) const;

    CirSim *sim;
    CircuitElm *mouseElm = nullptr;
    bool mouseDragging = false;
    bool dragging = false;
    bool didSwitch = false;
    int draggingPost = -1;
    int dragGridX = 0, dragGridY = 0;
    double dragScreenX = 0, dragScreenY = 0;
    int initDragGridX = 0, initDragGridY = 0;
    double mouseDownScreenX = 0, mouseDownScreenY = 0;
    // has the mouse moved more than a few pixels from mouseDownScreenX/Y at any point
    // during this press?  (a drag that returns to its start point is still not a click)
    bool movedSinceMouseDown = false;
    double mouseDownTime = 0;
    double zoomTime = 0;
    // value/type popup opened by the wheel (ScrollValuePopup, TypeScrollPopup)
    QPointer<WheelPopup> wheelPopup;
    std::vector<CircuitElm *> dragRowColElms;
    std::vector<int> dragRowColPosts;
    // elements moved by dragSelected during the current drag (the set, and the
    // vector in the order they were first moved)
    std::unordered_set<CircuitElm *> dragMovedSet;
    std::vector<CircuitElm *> dragMovedElms;

    // Select/Drag Posts: what to do to each element when the selection is dragged:
    // -1 = move the whole element, 0/1 = move that end only (stretch)
    std::map<CircuitElm *, int> postSelPlan;
    // selection seeds from the rubber band(s); shift-drag adds to these
    std::set<Loc> postSeedLocs, postSeedBaseLocs;
    std::unordered_set<CircuitElm *> postSeedRigid, postSeedBaseRigid;
    // true if the current mouse drag is moving the selected posts (vs. rubber-banding)
    bool postDragActive = false;
    // cached handleFollowers() results, keyed by element, valid while its position is the same
    struct FollowersEntry {
        std::array<int, 4> geom;
        std::optional<std::vector<int>> f;
    };
    std::map<CircuitElm *, FollowersEntry> followersCache;

    static constexpr int TOOLBAR_DRAG_THRESHOLD = 6;
    QString toolbarDragClass;
    QPoint toolbarDragStart;
    bool toolbarDragActive = false;
    bool toolbarDragVertical = false;
    int toolbarDragAnchorX = 0, toolbarDragAnchorY = 0;
};
