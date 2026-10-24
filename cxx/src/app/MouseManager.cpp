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

#include "MouseManager.h"

#include "core/Adjustable.h"
#include "core/SimulationManager.h"
#include "elements/RoutedWireElm.h"
#include "elements/ScopeElm.h"
#include "elements/SubcircuitElm.h"

#include <algorithm>
#include <cmath>

#include "CirSim.h"
#include "EditDialog.h"
#include "TypeScrollPopup.h"
#include "core/CircuitElm.h"
#include "core/ElementFactory.h"
#include "core/Graphics.h"
#include "core/Scope.h"
#include "core/ScopeManager.h"
#include "core/JsMath.h"
#include "elements/SwitchElm.h"

int MouseManager::snapGrid(int x) const { return sim->snapGrid(x); }

int MouseManager::inverseTransformX(double x) const {
    return (int) std::floor((x - sim->transform[4]) / sim->transform[0]);
}

int MouseManager::inverseTransformY(double y) const {
    return (int) std::floor((y - sim->transform[5]) / sim->transform[3]);
}

// convert grid coordinates to screen coordinates
int MouseManager::transformX(double x) const {
    return (int) std::floor(x * sim->transform[0] + sim->transform[4]);
}

int MouseManager::transformY(double y) const {
    return (int) std::floor(y * sim->transform[3] + sim->transform[5]);
}

void MouseManager::setMouseElm(CircuitElm *ce) {
    if (ce != mouseElm) {
        if (mouseElm != nullptr)
            mouseElm->setMouseElm(false);
        if (ce != nullptr)
            ce->setMouseElm(true);
        mouseElm = ce;
        for (Adjustable *adj : sim->adjustables)
            adj->setMouseElm(ce);
        sim->enableDisableMenuItems();
    }
}

void MouseManager::clearSelection() {
    for (CircuitElm *ce : *sim->uiElmList)
        ce->setSelected(false);
    sim->enableDisableMenuItems();
}

// need to break this out into a separate routine to handle selection,
// since we don't get mouse move events on mobile
void MouseManager::mouseSelect(double sx, double sy, bool shift) {
    CircuitElm *newMouseElm = nullptr;
    mouseCursorX = sim->mouseCursorX = sx;
    mouseCursorY = sim->mouseCursorY = sy;
    int gx = inverseTransformX(sx);
    int gy = inverseTransformY(sy);
    dragGridX = snapGrid(gx);
    dragGridY = snapGrid(gy);
    dragScreenX = sx;
    dragScreenY = sy;
    draggingPost = -1;

    mousePost = -1;
    sim->scopePlotRoles.clear();

    if (mouseIsOverSplitter(sx, sy)) {
        setMouseElm(nullptr);
        sim->repaint();
        return;
    }

    if (sim->circuitArea.contains(sx, sy)) {
        if (mouseElm != nullptr && mouseElm->getHandleGrabbedClose(gx, gy, POSTGRABSQ, MINPOSTGRABSIZE) >= 0) {
            newMouseElm = mouseElm;
        } else {
            double bestDist = 100000000;
            for (CircuitElm *ce : *sim->uiElmList) {
                if (ce->boundingBox.contains(gx, gy)) {
                    double dist = ce->getMouseDistance(gx, gy);
                    if (dist >= 0 && dist < bestDist) {
                        bestDist = dist;
                        newMouseElm = ce;
                    }
                }
            }
        }
    }
    ScopeManager *sm = sim->scopeManager;
    sm->scopeSelected = -1;
    if (newMouseElm == nullptr) {
        for (int i = 0; i < sm->scopeCount; i++) {
            Scope *s = sm->scopes[i].get();
            if (s->rect.contains(sx, sy)) {
                newMouseElm = s->getElm();
                s->addScopePlotRoles(sim->scopePlotRoles);
                sm->scopeSelected = i;
            }
        }
        // the mouse pointer was not in any of the bounding boxes, but we
        // might still be close to a post
        for (CircuitElm *ce : *sim->uiElmList) {
            if (sim->mouseMode == SimApp::MODE_DRAG_POST) {
                if (ce->getHandleGrabbedClose(gx, gy, POSTGRABSQ, 0) > 0) {
                    newMouseElm = ce;
                    break;
                }
            }
            int jn = ce->getPostCount();
            for (int j = 0; j < jn; j++) {
                Point pt = ce->getPost(j);
                if (Graphics::distanceSq(pt.x, pt.y, gx, gy) < 26) {
                    newMouseElm = ce;
                    mousePost = j;
                    break;
                }
            }
        }
    } else {
        mousePost = -1;
        // look for post close to the mouse pointer
        for (int i = 0; i < newMouseElm->getPostCount(); i++) {
            Point pt = newMouseElm->getPost(i);
            if (Graphics::distanceSq(pt.x, pt.y, gx, gy) < 26)
                mousePost = i;
        }
    }
    sim->repaint();
    setMouseElm(newMouseElm);
    // highlight all elements on the same net when Shift+hovering over a wire
    if (newMouseElm != nullptr && newMouseElm->isRemovableWire() && shift)
        sim->highlightedNode = newMouseElm->getNode(0).get();
    else
        sim->highlightedNode = nullptr;
}

bool MouseManager::doSwitch(int x, int y) {
    if (mouseElm == nullptr || !mouseElm->isSwitchElm())
        return false;
    SwitchElm *se = static_cast<SwitchElm *>(mouseElm);
    if (!se->getSwitchRect().contains(x, y))
        return false;
    se->toggle();
    if (se->momentary)
        heldSwitchElm = se;
    if (!mouseElm->isLogicInputElm())
        sim->needAnalyze();
    return true;
}

void MouseManager::onMouseDown(QMouseEvent *e) {
    sim->stopElm = nullptr;  // if stopped, allow user to select other elements to fix circuit
    double ex = e->position().x(), ey = e->position().y();
    menuX = ex;
    menuY = ey;
    mouseDownTime = sim->currentTimeMillis();
    mouseDownScreenX = ex;
    mouseDownScreenY = ey;
    // maybe someone did copy in another window?
    sim->enablePaste();
    // not left or middle (right-click brings up the context menu instead)
    if (e->button() != Qt::LeftButton && e->button() != Qt::MiddleButton)
        return;
    Qt::KeyboardModifiers mods = e->modifiers();
    bool shift = mods & Qt::ShiftModifier;
    bool alt = mods & Qt::AltModifier;
    // on macOS, Qt reports Cmd as ControlModifier and Ctrl as MetaModifier
    bool ctrlOrMeta = mods & (Qt::ControlModifier | Qt::MetaModifier);

    // set mouseElm in case we are on mobile
    mouseSelect(ex, ey, shift);
    mouseDragging = true;
    didSwitch = false;

    if (mouseWasOverSplitter) {
        tempMouseMode = SimApp::MODE_DRAG_SPLITTER;
        return;
    }
    if (e->button() == Qt::LeftButton) {
        tempMouseMode = sim->mouseMode;
        if (alt && ctrlOrMeta)
            tempMouseMode = SimApp::MODE_DRAG_COLUMN;
        else if (alt && shift)
            tempMouseMode = SimApp::MODE_DRAG_ROW;
        else if (shift)
            tempMouseMode = SimApp::MODE_SELECT;
        else if (alt)
            tempMouseMode = SimApp::MODE_DRAG_ALL;
        else if (ctrlOrMeta)
            tempMouseMode = SimApp::MODE_DRAG_POST;
    } else {
        tempMouseMode = SimApp::MODE_DRAG_ALL;
    }

    if (sim->isReadOnly() && tempMouseMode != SimApp::MODE_DRAG_ALL)
        tempMouseMode = SimApp::MODE_SELECT;

    ScopeManager *sm = sim->scopeManager;
    Scope *wheelScope = nullptr;
    if (sm->scopeSelected != -1 && sm->scopes[sm->scopeSelected]->cursorInSettingsWheel())
        wheelScope = sm->scopes[sm->scopeSelected].get();
    else if (sm->scopeSelected == -1 && mouseElm != nullptr && mouseElm->isScopeElm() &&
             static_cast<ScopeElm *>(mouseElm)->elmScope->cursorInSettingsWheel())
        wheelScope = static_cast<ScopeElm *>(mouseElm)->elmScope.get();
    if (wheelScope != nullptr) {
        if (sim->isReadOnly())
            return;
        clearSelection();
        mouseDragging = false;
        sim->showScopeProperties(wheelScope);
        return;
    }

    // start drag-to-measure if clicking inside a scope
    for (int i = 0; i < sm->scopeCount; i++)
        sm->scopes[i]->mousePressed(ex, ey);
    for (CircuitElm *ce : sim->scopeElmArr)
        static_cast<ScopeElm *>(ce)->elmScope->mousePressed(ex, ey);

    // alt-drag or middle-mouse-drag a scope's selected plot up/down while in manual scale mode
    if (Scope::cursorScope != nullptr && (e->button() == Qt::MiddleButton || (e->button() == Qt::LeftButton && alt)) &&
        Scope::cursorScope->startDragPlotY(ex, ey))
        return;

    int gx = inverseTransformX(ex);
    int gy = inverseTransformY(ey);
    if (doSwitch(gx, gy)) {
        // do this BEFORE we change the mouse mode to MODE_DRAG_POST!  Or else logic inputs
        // will add dots to the whole circuit when we click on them!
        didSwitch = true;
        return;
    }

    // IES - Grab resize handles in select mode if they are far enough apart and you are on top of them
    if (tempMouseMode == SimApp::MODE_SELECT && mouseElm != nullptr && !sim->isReadOnly() &&
        mouseElm->getHandleGrabbedClose(gx, gy, POSTGRABSQ, MINPOSTGRABSIZE) >= 0 && !anySelectedButMouse())
        tempMouseMode = SimApp::MODE_DRAG_POST;

    if (tempMouseMode != SimApp::MODE_SELECT && tempMouseMode != SimApp::MODE_DRAG_SELECTED)
        clearSelection();
    sim->pushUndo();
    initDragGridX = gx;
    initDragGridY = gy;
    dragging = true;
    dragMovedSet.clear();
    dragMovedElms.clear();

    // capture elements for DragRow/DragColumn at mouse-down so we don't
    // pick up new elements as we sweep over them
    if (tempMouseMode == SimApp::MODE_DRAG_ROW || tempMouseMode == SimApp::MODE_DRAG_COLUMN) {
        dragRowColElms.clear();
        dragRowColPosts.clear();
        int sgx = snapGrid(gx);
        int sgy = snapGrid(gy);
        for (CircuitElm *ce : *sim->uiElmList) {
            if (tempMouseMode == SimApp::MODE_DRAG_ROW) {
                if (ce->y == sgy) { dragRowColElms.push_back(ce); dragRowColPosts.push_back(0); }
                if (ce->y2 == sgy) { dragRowColElms.push_back(ce); dragRowColPosts.push_back(1); }
            } else {
                if (ce->x == sgx) { dragRowColElms.push_back(ce); dragRowColPosts.push_back(0); }
                if (ce->x2 == sgx) { dragRowColElms.push_back(ce); dragRowColPosts.push_back(1); }
            }
        }
    }
    if (tempMouseMode != SimApp::MODE_ADD_ELM)
        return;
    int x0 = snapGrid(gx);
    int y0 = snapGrid(gy);
    if (!sim->circuitArea.contains(ex, ey))
        return;
    sim->dragElm = ElementFactory::constructElement(sim->mouseModeStr.toStdString(), x0, y0);
}

void MouseManager::onMouseMove(QMouseEvent *e) {
    mouseCursorX = sim->mouseCursorX = e->position().x();
    mouseCursorY = sim->mouseCursorY = e->position().y();
    if (mouseDragging) {
        mouseDragged(e);
        return;
    }
    mouseSelect(mouseCursorX, mouseCursorY, e->modifiers() & Qt::ShiftModifier);
}

void MouseManager::mouseDragged(QMouseEvent *e) {
    double ex = e->position().x(), ey = e->position().y();
    if (tempMouseMode == SimApp::MODE_DRAG_SPLITTER) {
        dragSplitter(ey);
        return;
    }
    if (Scope::draggingPlotYScope != nullptr) {
        Scope::draggingPlotYScope->dragPlotY(ey);
        sim->repaint();
        return;
    }
    // mouse was pressed in one of the scopes at the bottom (scopeSelected isn't updated
    // while dragging), so don't drag the element it's plotting
    if (sim->scopeManager->scopeSelected != -1) {
        sim->repaint();
        return;
    }
    int gx = inverseTransformX(ex);
    int gy = inverseTransformY(ey);
    if (!sim->circuitArea.contains(ex, ey)) {
        sim->repaint();
        return;
    }
    if (sim->dragElm != nullptr) {
        sim->dragElm->drag(gx, gy);
        // now that we're actually dragging out a new element, don't leave whatever
        // was hovered before still looking highlighted underneath it
        setMouseElm(nullptr);
    }
    bool success = true;
    bool changed = false;
    switch (tempMouseMode) {
    case SimApp::MODE_DRAG_ALL:
        dragAll(ex, ey);
        break;
    case SimApp::MODE_DRAG_ROW:
        dragRow(snapGrid(gx), snapGrid(gy));
        break;
    case SimApp::MODE_DRAG_COLUMN:
        dragColumn(snapGrid(gx), snapGrid(gy));
        break;
    case SimApp::MODE_DRAG_POST:
        if (mouseElm != nullptr)
            dragPost(snapGrid(gx), snapGrid(gy), e->modifiers() & Qt::ShiftModifier);
        break;
    case SimApp::MODE_SELECT:
        if (mouseElm == nullptr)
            selectArea(gx, gy, e->modifiers() & Qt::ShiftModifier);
        else if (!sim->isReadOnly()) {
            // wait short delay before dragging -- fixes accidental drags on mobile
            if (sim->currentTimeMillis() - mouseDownTime < 150)
                return;
            if (mouseElm->isRoutedWireElm()) {
                tempMouseMode = SimApp::MODE_DRAG_REROUTE;
                static_cast<RoutedWireElm *>(mouseElm)->rerouteVia(snapGrid(gx), snapGrid(gy));
                changed = true;
            } else {
                tempMouseMode = SimApp::MODE_DRAG_SELECTED;
                changed = success = dragSelected(gx, gy);
            }
        }
        break;
    case SimApp::MODE_DRAG_SELECTED:
        changed = success = dragSelected(gx, gy);
        break;
    case SimApp::MODE_DRAG_REROUTE:
        if (mouseElm != nullptr && mouseElm->isRoutedWireElm()) {
            static_cast<RoutedWireElm *>(mouseElm)->rerouteVia(snapGrid(gx), snapGrid(gy));
            changed = true;
        }
        break;
    }
    dragging = true;
    if (success) {
        dragScreenX = ex;
        dragScreenY = ey;
        dragGridX = inverseTransformX(dragScreenX);
        dragGridY = inverseTransformY(dragScreenY);
        if (!(tempMouseMode == SimApp::MODE_DRAG_SELECTED && onlyGraphicsElmsSelected())) {
            dragGridX = snapGrid(dragGridX);
            dragGridY = snapGrid(dragGridY);
        }
    }
    if (changed)
        sim->writeRecoveryToStorage();
    sim->repaint();
}

void MouseManager::dragAll(double x, double y) {
    double ddx = x - dragScreenX;
    double ddy = y - dragScreenY;
    if (ddx == 0 && ddy == 0)
        return;
    sim->transform[4] += ddx;
    sim->transform[5] += ddy;
    dragScreenX = x;
    dragScreenY = y;
}

void MouseManager::dragRow(int, int y) {
    int ddy = y - dragGridY;
    if (ddy == 0)
        return;
    for (size_t i = 0; i < dragRowColElms.size(); i++)
        dragRowColElms[i]->movePoint(dragRowColPosts[i], 0, ddy);
    removeZeroLengthElements();
}

void MouseManager::dragColumn(int x, int) {
    int ddx = x - dragGridX;
    if (ddx == 0)
        return;
    for (size_t i = 0; i < dragRowColElms.size(); i++)
        dragRowColElms[i]->movePoint(dragRowColPosts[i], ddx, 0);
    removeZeroLengthElements();
}

bool MouseManager::onlyGraphicsElmsSelected() {
    if (mouseElm != nullptr && !mouseElm->isGraphicElm())
        return false;
    for (CircuitElm *ce : *sim->uiElmList)
        if (ce->isSelected() && !ce->isGraphicElm())
            return false;
    return true;
}

bool MouseManager::dragSelected(int x, int y) {
    bool me = false;
    if (mouseElm != nullptr && !mouseElm->isSelected())
        mouseElm->setSelected(me = true);

    if (!onlyGraphicsElmsSelected()) {
        x = snapGrid(x);
        y = snapGrid(y);
    }

    int ddx = x - dragGridX;
    int ddy = y - dragGridY;
    if (ddx == 0 && ddy == 0) {
        // don't leave mouseElm selected if we selected it above
        if (me)
            mouseElm->setSelected(false);
        return false;
    }
    bool allowed = true;

    // check if moves are allowed
    for (CircuitElm *ce : *sim->uiElmList) {
        if (ce->isSelected() && !ce->allowMove(ddx, ddy))
            allowed = false;
        if (!allowed)
            break;
    }

    if (allowed) {
        for (CircuitElm *ce : *sim->uiElmList)
            if (ce->isSelected()) {
                ce->move(ddx, ddy);
                if (dragMovedSet.insert(ce).second)
                    dragMovedElms.push_back(ce);
            }
        // move connected routed wires' shared posts
        for (CircuitElm *ce : *sim->uiElmList) {
            if (!ce->isSelected())
                continue;
            auto it = sim->sim->routedWireMap.find(ce);
            if (it == sim->sim->routedWireMap.end())
                continue;
            for (const RoutedWireConnection &conn : it->second)
                if (!conn.wire->isSelected() && conn.wire->getPost(conn.wirePost).z == 0)
                    conn.wire->movePoint(conn.wirePost, ddx, ddy);
        }
        sim->needAnalyze();
    }

    // don't leave mouseElm selected if we selected it above
    if (me)
        mouseElm->setSelected(false);

    return allowed;
}

void MouseManager::dragPost(int x, int y, bool all) {
    if (draggingPost == -1) {
        draggingPost = (Graphics::distanceSq(mouseElm->x, mouseElm->y, x, y) >
                        Graphics::distanceSq(mouseElm->x2, mouseElm->y2, x, y)) ? 1 : 0;
    }
    int ddx = x - dragGridX;
    int ddy = y - dragGridY;
    if (ddx == 0 && ddy == 0)
        return;

    if (all) {
        // go through all elms
        for (CircuitElm *e : *sim->uiElmList) {
            int p;
            if (e->x == dragGridX && e->y == dragGridY)
                p = 0;
            else if (e->x2 == dragGridX && e->y2 == dragGridY)
                p = 1;
            else
                continue;
            e->movePoint(p, ddx, ddy);
        }
    } else {
        mouseElm->movePoint(draggingPost, ddx, ddy);
        // move connected routed wires' shared posts
        auto it = sim->sim->routedWireMap.find(mouseElm);
        if (it != sim->sim->routedWireMap.end())
            for (const RoutedWireConnection &conn : it->second)
                if (conn.elmPost == draggingPost && conn.wire->getPost(conn.wirePost).z == 0)
                    conn.wire->movePoint(conn.wirePost, ddx, ddy);
    }
    sim->needAnalyze();
}

void MouseManager::selectArea(int x, int y, bool add) {
    int x1 = std::min(x, initDragGridX);
    int x2 = std::max(x, initDragGridX);
    int y1 = std::min(y, initDragGridY);
    int y2 = std::max(y, initDragGridY);
    selectedArea = Rectangle(x1, y1, x2 - x1, y2 - y1);
    for (CircuitElm *ce : *sim->uiElmList)
        ce->selectRect(*selectedArea, add);
    sim->enableDisableMenuItems();
}

bool MouseManager::anySelectedButMouse() {
    for (CircuitElm *ce : *sim->uiElmList)
        if (ce != mouseElm && ce->selected)
            return true;
    return false;
}

void MouseManager::removeZeroLengthElements() {
    std::vector<CircuitElm *> &list = *sim->uiElmList;
    for (int i = (int) list.size() - 1; i >= 0; i--) {
        CircuitElm *ce = list[i];
        if (ce->x == ce->x2 && ce->y == ce->y2) {
            list.erase(list.begin() + i);
            if (ce == mouseElm)
                mouseElm = nullptr;
            ce->deleteElm();
            delete ce;
        }
    }
    sim->needAnalyze();
}

void MouseManager::dragSplitter(double y) {
    double h = std::max(sim->canvasHeight, 1);
    double &frac = sim->scopeManager->scopeHeightFraction;
    frac = std::clamp(1.0 - y / h, 0.1, 0.9);
    static_cast<SimApp *>(sim)->setCircuitArea();
    sim->repaint();
}

bool MouseManager::mouseIsOverSplitter(double x, double y) {
    bool isOverSplitter = sim->scopeManager->scopeCount != 0 &&
        x >= 0 && x < sim->circuitArea.width &&
        y >= sim->circuitArea.height - 5 && y < sim->circuitArea.height;
    if (isOverSplitter != mouseWasOverSplitter) {
        mouseWasOverSplitter = isOverSplitter;
        sim->setSplitterCursor(isOverSplitter);
    }
    return isOverSplitter;
}

void MouseManager::onMouseUp(QMouseEvent *e) {
    // click to clear selection (but not on a right-click)
    if (tempMouseMode == SimApp::MODE_SELECT && !selectedArea && e->button() == Qt::LeftButton)
        clearSelection();
    // cmd-click = split wire
    if (tempMouseMode == SimApp::MODE_DRAG_POST && draggingPost == -1)
        doSplit(mouseElm);

    // figure out, before endDrag() clears drag state, whether this mouseup is a plain
    // click (not a drag, not a modified click used for some other gesture) and if so
    // what it landed on, so we can update the (non-modal) property editor accordingly:
    // clicking an element brings up its editor, clicking empty space closes it, and
    // creating a new element (checked after endDrag(), below) brings up its editor too.
    Qt::KeyboardModifiers mods = e->modifiers();
    bool wasPlainClick = e->button() == Qt::LeftButton && !didSwitch &&
        tempMouseMode != SimApp::MODE_DRAG_SPLITTER &&
        !(mods & (Qt::ShiftModifier | Qt::AltModifier | Qt::ControlModifier | Qt::MetaModifier));
    CircuitElm *clickedElm = nullptr;
    bool clickedEmpty = false;
    if (wasPlainClick) {
        double ddx = mouseCursorX - mouseDownScreenX;
        double ddy = mouseCursorY - mouseDownScreenY;
        // (clicking a scope at the bottom is ignored here; it shouldn't bring up the
        // editor for the scope's element, or close the editor)
        if (ddx * ddx + ddy * ddy < 16 && sim->scopeManager->scopeSelected == -1) {
            // didn't move (much) since mousedown, so it's a click, not a drag
            if (mouseElm != nullptr && !mouseElm->isSwitchElm())
                clickedElm = mouseElm;
            else if (mouseElm == nullptr)
                clickedEmpty = true;
        }
    }
    CircuitElm *createdElm = endDrag();
    if (createdElm != nullptr) {
        editCreatedElm(createdElm);
    } else if (clickedElm != nullptr && !sim->isReadOnly() && sim->showPropsOnClick) {
        // (clicking the element whose properties are already showing dismisses them)
        if (sim->editDialog != nullptr && sim->editDialog->elm == clickedElm)
            sim->closeEditDialog();
        else if (clickedElm->hasProperties())
            sim->doEdit(clickedElm);
        else
            sim->closeEditDialog();
    } else if (clickedEmpty) {
        sim->closeEditDialog();
    }
}

void MouseManager::onMouseOut() {
    mouseCursorX = sim->mouseCursorX = -1;
    // if the mouse leaves the canvas while dragging, end the drag now
    if (mouseDragging)
        endDrag();
    // don't leave the last hovered element highlighted after the mouse has left
    mousePost = -1;
    sim->scopePlotRoles.clear();
    setMouseElm(nullptr);
    sim->repaint();
}

CircuitElm *MouseManager::endDrag() {
    mouseDragging = false;
    Scope::dragStartTime = -1;
    Scope::endDragPlotY();
    tempMouseMode = sim->mouseMode;
    selectedArea.reset();
    dragging = false;
    bool circuitChanged = false;
    CircuitElm *createdElm = nullptr;
    // auto-split wires when a post is dragged onto a wire's interior
    if (draggingPost >= 0 && mouseElm != nullptr) {
        Point p = mouseElm->getPost(draggingPost);
        if (splitAt(p.x, p.y))
            circuitChanged = true;
    }
    // auto-split wires/leads that moved elements' posts were dropped onto.
    // Moved elements aren't split themselves, since they moved together.
    if (!dragMovedElms.empty()) {
        std::vector<Point> posts;
        for (CircuitElm *ce : dragMovedElms)
            for (int i = 0; i < ce->getPostCount(); i++)
                posts.push_back(ce->getPost(i));
        for (const Point &p : posts)
            if (splitAt(p.x, p.y, &dragMovedSet))
                circuitChanged = true;
        dragMovedSet.clear();
        dragMovedElms.clear();
    }
    if (heldSwitchElm != nullptr) {
        static_cast<SwitchElm *>(heldSwitchElm)->mouseUp();
        heldSwitchElm = nullptr;
        circuitChanged = true;
    }
    if (sim->dragElm != nullptr) {
        CircuitElm *de = sim->dragElm;
        sim->dragElm = nullptr;
        // if the element is zero size then don't create it
        if (de->creationFailed()) {
            de->deleteElm();
            delete de;
            if (sim->mouseMode == SimApp::MODE_SELECT || sim->mouseMode == SimApp::MODE_DRAG_SELECTED)
                clearSelection();
        } else {
            // auto-split wires at the new element's endpoints before adding it
            splitAt(de->x, de->y);
            splitAt(de->x2, de->y2);
            sim->uiElmList->push_back(de);
            de->draggingDone();
            circuitChanged = true;
            sim->writeRecoveryToStorage();
            createdElm = de;
        }
    }
    if (circuitChanged) {
        sim->needAnalyze();
        sim->pushUndo();
    }
    sim->repaint();
    sim->updateToolbar();
    return createdElm;
}

void MouseManager::onDoubleClick(QMouseEvent *e) {
    // Qt sends this in place of the second press (browsers send both), so treat it as
    // a press too; otherwise quick clicks on switches and logic inputs get lost
    onMouseDown(e);
    // (double-clicking a scope at the bottom shouldn't edit the scope's element)
    if (mouseElm == nullptr || sim->scopeManager->scopeSelected != -1)
        return;
    if (mouseElm->isSubcircuitElm()) {
        // shows its components if it can, otherwise edits it
        if (!static_cast<SubcircuitElm *>(mouseElm)->onDoubleClick() && !sim->isReadOnly())
            sim->doEdit(mouseElm);
        return;
    }
    if (!mouseElm->isSwitchElm() && mouseElm->hasProperties() && !sim->isReadOnly())
        sim->doEdit(mouseElm);
}

void MouseManager::onMouseWheel(QWheelEvent *e) {
    double norm = WheelPopup::normalizeWheelDelta(e);

    // the rest of a trackpad scroll gesture may still come here after a popup opens
    if (wheelPopup != nullptr && wheelPopup->isShowing()) {
        wheelPopup->doDeltaY(norm);
        return;
    }

    // once we start zooming, don't allow other uses of mouse wheel for a while
    // so we don't accidentally edit a resistor value while zooming
    bool zoomOnly = sim->currentTimeMillis() < zoomTime + 1000;
    if (sim->isReadOnly() || !sim->options.mouseWheelEdit)
        zoomOnly = true;

    ScopeManager *sm = sim->scopeManager;
    QPoint globalPos = e->globalPosition().toPoint();
    if (!zoomOnly && mouseElm != nullptr && !sim->modalDialogIsShowing() && sm->scopeSelected == -1 &&
        (mouseElm->isResistorElm() || mouseElm->isCapacitorElm() || mouseElm->isInductorElm())) {
        wheelPopup = new ScrollValuePopup(globalPos, norm, mouseElm, sim);
    } else if (!zoomOnly && mouseElm != nullptr && (mouseElm->isMosfetElm() || mouseElm->isTransistorElm())) {
        wheelPopup = new TypeScrollPopup(globalPos, norm, mouseElm, sim);
    } else if (!zoomOnly && mouseElm != nullptr && mouseElm->onMouseWheel(norm)) {
        // (the element's slider moved)
    } else if (sm->scopeSelected != -1 && sm->scopeSelected < sm->scopeCount) {
        sm->scopes[sm->scopeSelected]->onMouseWheel(norm, wheelSensitivity);
    } else {
        mouseCursorX = sim->mouseCursorX = e->position().x();
        mouseCursorY = sim->mouseCursorY = e->position().y();
        zoomCircuit(-norm * wheelSensitivity, false);
        zoomTime = sim->currentTimeMillis();
    }
    sim->repaint();
}

void MouseManager::zoomCircuit(double dy, bool fromKeyboard) {
    double oldScale = sim->transform[0];
    double val = dy * 0.01;
    double newScale = std::max(oldScale + val, 0.2);
    newScale = std::min(newScale, 2.5);
    if (newScale == oldScale)
        return;
    setCircuitScale(newScale, fromKeyboard);
}

void MouseManager::setCircuitScale(double newScale, bool fromKeyboard) {
    double constX = !fromKeyboard ? mouseCursorX : sim->circuitArea.width / 2;
    double constY = !fromKeyboard ? mouseCursorY : sim->circuitArea.height / 2;
    int cx = inverseTransformX(constX);
    int cy = inverseTransformY(constY);
    sim->transform[0] = sim->transform[3] = newScale;

    // adjust translation to keep center of screen constant
    // inverse transform = (x-t4)/t0
    sim->transform[4] = constX - cx * newScale;
    sim->transform[5] = constY - cy * newScale;
}

void MouseManager::doSplit(CircuitElm *ce) {
    if (ce == nullptr || !ce->isWireElm())
        return;
    int px = snapGrid(inverseTransformX(menuX));
    int py = snapGrid(inverseTransformY(menuY));
    if (splitWireAt(px, py))
        sim->needAnalyze();
}

bool MouseManager::splitWireAt(int px, int py, const std::unordered_set<CircuitElm *> *exclude) {
    bool split = false;
    std::vector<CircuitElm *> &list = *sim->uiElmList;
    for (int i = (int) list.size() - 1; i >= 0; i--) {
        CircuitElm *ce = list[i];
        if (!ce->isWireElm() || (exclude != nullptr && exclude->count(ce)))
            continue;
        WireElm *we = static_cast<WireElm *>(ce);
        if (!we->pointOnWireInterior(px, py))
            continue;
        WireElm *newWire = we->split(px, py);
        if (newWire != nullptr) {
            list.push_back(newWire);
            split = true;
        }
    }
    return split;
}

bool MouseManager::splitLeadsAt(int px, int py, const std::unordered_set<CircuitElm *> *exclude) {
    bool split = false;
    std::vector<CircuitElm *> &list = *sim->uiElmList;
    for (int i = (int) list.size() - 1; i >= 0; i--) {
        CircuitElm *ce = list[i];
        if (ce->isWireElm() || (exclude != nullptr && exclude->count(ce)))
            continue;
        int post = ce->getLeadPost(px, py);
        if (post < 0)
            continue;
        int ox = (post == 0) ? ce->x : ce->x2;
        int oy = (post == 0) ? ce->y : ce->y2;
        ce->movePoint(post, px - ox, py - oy);
        CircuitElm *w = ElementFactory::constructElement("WireElm", px, py);
        w->drag(ox, oy);
        list.push_back(w);
        split = true;
    }
    return split;
}

bool MouseManager::splitAt(int px, int py, const std::unordered_set<CircuitElm *> *exclude) {
    bool a = splitWireAt(px, py, exclude);
    bool b = splitLeadsAt(px, py, exclude);
    return a || b;
}

void MouseManager::beginToolbarDrag(const QString &className, QPoint pos) {
    if (sim->isReadOnly() || sim->modalDialogIsShowing())
        return;
    toolbarDragClass = className;
    toolbarDragStart = pos;
    toolbarDragActive = false;
    toolbarDragVertical = false;
}

void MouseManager::cancelToolbarDrag() {
    if (sim->dragElm != nullptr) {
        sim->dragElm->deleteElm();
        delete sim->dragElm;
        sim->dragElm = nullptr;
    }
    toolbarDragClass.clear();
    toolbarDragActive = false;
    tempMouseMode = sim->mouseMode;
    dragging = false;
    sim->repaint();
}

void MouseManager::toolbarDragOrientationChanged(bool vertical) {
    if (toolbarDragClass.isEmpty() || sim->dragElm == nullptr)
        return;
    toolbarDragVertical = vertical;
    sim->dragElm->dragPlace(toolbarDragAnchorX, toolbarDragAnchorY, toolbarDragVertical);
    sim->repaint();
}

void MouseManager::toolbarDragMove(QPoint pos, bool vertical) {
    if (toolbarDragClass.isEmpty())
        return;
    if (!toolbarDragActive) {
        QPoint d = pos - toolbarDragStart;
        if (d.x() * d.x() + d.y() * d.y() < TOOLBAR_DRAG_THRESHOLD * TOOLBAR_DRAG_THRESHOLD)
            return;
        toolbarDragActive = true;
        sim->pushUndo();
    }
    QPoint c = sim->canvasWidget()->mapFromGlobal(pos);
    if (!sim->canvasWidget()->rect().contains(c) || !sim->circuitArea.contains(c.x(), c.y())) {
        if (sim->dragElm != nullptr)
            sim->repaint();
        return;
    }
    toolbarDragAnchorX = snapGrid(inverseTransformX(c.x()));
    toolbarDragAnchorY = snapGrid(inverseTransformY(c.y()));
    toolbarDragVertical = vertical;
    if (sim->dragElm == nullptr) {
        sim->dragElm = ElementFactory::constructElement(toolbarDragClass.toStdString(),
                                                        toolbarDragAnchorX, toolbarDragAnchorY);
        tempMouseMode = SimApp::MODE_ADD_ELM;
        dragging = true;
    }
    // (re)place the element at the anchor point; gives it a fixed default length/
    // orientation since there's no drag-to-size gesture on the circuit area here
    if (sim->dragElm != nullptr)
        sim->dragElm->dragPlace(toolbarDragAnchorX, toolbarDragAnchorY, toolbarDragVertical);
    sim->repaint();
}

bool MouseManager::toolbarDragEnd(QPoint) {
    if (toolbarDragClass.isEmpty())
        return false;
    bool wasActive = toolbarDragActive;
    toolbarDragClass.clear();
    toolbarDragActive = false;
    if (!wasActive)
        return false;  // no real drag happened; let the normal click switch modes as before
    CircuitElm *createdElm = nullptr;
    if (sim->dragElm != nullptr) {
        CircuitElm *de = sim->dragElm;
        sim->dragElm = nullptr;
        if (de->creationFailed()) {
            de->deleteElm();
            delete de;
        } else {
            splitAt(de->x, de->y);
            splitAt(de->x2, de->y2);
            sim->uiElmList->push_back(de);
            de->draggingDone();
            sim->writeRecoveryToStorage();
            sim->needAnalyze();
            sim->pushUndo();
            createdElm = de;
        }
    }
    tempMouseMode = sim->mouseMode;
    dragging = false;
    sim->updateToolbar();
    sim->repaint();
    if (createdElm != nullptr)
        editCreatedElm(createdElm);
    return true;
}

// automatically bring up the property editor for a newly-created element,
// or close the editor for some other element if this one doesn't want it
void MouseManager::editCreatedElm(CircuitElm *elm) {
    if (elm->showPropertiesOnCreate() && sim->showPropsOnCreate && !sim->isReadOnly())
        sim->doEdit(elm);
    else
        sim->closeEditDialog();
}
