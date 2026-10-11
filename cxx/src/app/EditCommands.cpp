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

// Edit menu commands: cut/copy/paste, select all, mirror and rotate
// (CommandManager.ts and MouseManager.enableDisableMenuItems() in the TS version)

#include <QAction>
#include <algorithm>
#include <optional>

#include "CirSim.h"
#include "core/CircuitElm.h"
#include "core/CircuitXMLSerializer.h"
#include "core/CustomLogicModel.h"
#include "core/DiodeModel.h"
#include "core/MosfetModel.h"
#include "core/RelayModel.h"
#include "core/Storage.h"
#include "core/SubcircuitModel.h"
#include "core/TransistorModel.h"
#include "core/XmlDoc.h"

CircuitElm *CirSim::keyMenuElm() {
    // if the mouse is hovering over an element when a shortcut key is pressed, operate on
    // that element.  (When a command comes from the menu bar, the mouse has left the canvas.)
    return mouse.mouseCursorX >= 0 ? mouse.getMouseElm() : nullptr;
}

void CirSim::setMenuSelection(CircuitElm *menuElm) {
    if (menuElm != nullptr) {
        if (menuElm->selected)
            return;
        mouse.clearSelection();
        menuElm->setSelected(true);
    }
}

int CirSim::countSelected() {
    int count = 0;
    for (CircuitElm *ce : elmList)
        if (ce->isSelected())
            count++;
    return count;
}

CirSim::FlipInfo CirSim::prepareFlip(CircuitElm *menuElm) {
    pushUndo();
    setMenuSelection(menuElm);
    int minx = 30000, maxx = -30000;
    int miny = 30000, maxy = -30000;
    int count = countSelected();
    for (CircuitElm *ce : elmList) {
        if (ce->isSelected() || count == 0) {
            minx = std::min(ce->x, std::min(ce->x2, minx));
            maxx = std::max(ce->x, std::max(ce->x2, maxx));
            miny = std::min(ce->y, std::min(ce->y2, miny));
            maxy = std::max(ce->y, std::max(ce->y2, maxy));
        }
    }
    return {(minx + maxx) / 2, (miny + maxy) / 2, count};
}

// mirror horizontally (flip left-right)
void CirSim::mirrorX(CircuitElm *menuElm) {
    FlipInfo fi = prepareFlip(menuElm);
    int center2 = fi.cx * 2;
    for (CircuitElm *ce : elmList)
        if (ce->isSelected() || fi.count == 0)
            ce->flipX(center2, fi.count);
    needAnalyze();
}

// mirror vertically (flip top-bottom)
void CirSim::mirrorY(CircuitElm *menuElm) {
    FlipInfo fi = prepareFlip(menuElm);
    int center2 = fi.cy * 2;
    for (CircuitElm *ce : elmList)
        if (ce->isSelected() || fi.count == 0)
            ce->flipY(center2, fi.count);
    needAnalyze();
}

// rotate 90 degrees counterclockwise: a diagonal flip followed by a vertical flip cancels
// out the mirroring and leaves a pure rotation
void CirSim::rotateCCW(CircuitElm *menuElm) {
    FlipInfo fi = prepareFlip(menuElm);
    int center2 = fi.cy * 2;
    int xmy = snapGrid(fi.cx - fi.cy);
    for (CircuitElm *ce : elmList) {
        if (ce->isSelected() || fi.count == 0) {
            ce->flipXY(xmy, fi.count);
            ce->flipY(center2, fi.count);
        }
    }
    needAnalyze();
}

// rotate 90 degrees clockwise: same two flips as rotateCCW(), in the opposite order,
// giving the opposite rotation direction
void CirSim::rotateCW(CircuitElm *menuElm) {
    FlipInfo fi = prepareFlip(menuElm);
    int center2 = fi.cy * 2;
    int xmy = snapGrid(fi.cx - fi.cy);
    for (CircuitElm *ce : elmList) {
        if (ce->isSelected() || fi.count == 0) {
            ce->flipY(center2, fi.count);
            ce->flipXY(xmy, fi.count);
        }
    }
    needAnalyze();
}

void CirSim::doCut(CircuitElm *menuElm) {
    pushUndo();
    setMenuSelection(menuElm);
    clipboard = copyOfSelectedElms();
    writeClipboardToStorage();
    doDelete();
    enablePaste();
}

void CirSim::writeClipboardToStorage() {
    if (Storage::localStorage)
        Storage::localStorage->setItem("circuitClipboard", clipboard);
}

void CirSim::readClipboardFromStorage() {
    std::optional<std::string> s;
    if (Storage::localStorage)
        s = Storage::localStorage->getItem("circuitClipboard");
    clipboard = s.value_or("");
}

std::string CirSim::copyOfSelectedElms() {
    XmlElement root("cir");

    CustomLogicModel::clearDumpedFlags();
    SubcircuitModel::clearDumpedFlags();
    DiodeModel::clearDumpedFlags();
    TransistorModel::clearDumpedFlags();
    RelayModel::clearDumpedFlags();
    MosfetModel::clearDumpedFlags();

    for (int i = (int) elmList.size() - 1; i >= 0; i--) {
        CircuitElm *ce = elmList[i];
        ce->dumpXmlModel(&root);
        if (ce->isSelected() && !ce->isScopeElm()) {
            // dumpXml() may add a model to the root first, so append the element afterwards
            auto elem = std::make_unique<XmlElement>(ce->getXmlDumpType());
            ce->dumpXml(&root, elem.get());
            ce->dumpXmlState(&root, elem.get());
            root.appendChild(std::move(elem));
        }
    }
    return CircuitXMLSerializer::prettyPrint(&root);
}

void CirSim::doCopy(CircuitElm *menuElm) {
    bool clearSel = (menuElm != nullptr && !menuElm->selected);
    setMenuSelection(menuElm);
    clipboard = copyOfSelectedElms();
    if (clearSel)
        mouse.clearSelection();
    writeClipboardToStorage();
    enablePaste();
}

void CirSim::enablePaste() {
    if (clipboard.empty())
        readClipboardFromStorage();
    if (pasteItem)
        pasteItem->setEnabled(!clipboard.empty());
}

void CirSim::doDuplicate(CircuitElm *menuElm) {
    setMenuSelection(menuElm);
    std::string s = copyOfSelectedElms();
    doPaste(&s);
}

void CirSim::doPaste(const std::string *dump) {
    pushUndo();
    mouse.clearSelection();

    // get old bounding box
    std::optional<Rectangle> oldbb;
    for (CircuitElm *ce : elmList) {
        const Rectangle &bb = ce->getBoundingBox();
        oldbb = oldbb ? oldbb->unite(bb) : bb;
    }

    // add new items
    int oldsz = (int) elmList.size();
    int flags = CircuitLoader::RC_RETAIN;

    // don't recenter circuit if we're going to paste in place because that will change the transform
    // in fact, don't ever recenter circuit, unless old circuit was empty
    if (oldsz > 0)
        flags |= CircuitLoader::RC_NO_CENTER;

    if (dump != nullptr)
        loader->readCircuit(*dump, flags);
    else {
        readClipboardFromStorage();
        loader->readCircuit(clipboard, flags);
    }
    if ((flags & CircuitLoader::RC_NO_CENTER) == 0)
        needCenter = true;

    // select new items and get their bounding box
    std::optional<Rectangle> newbb;
    for (int i = oldsz; i != (int) elmList.size(); i++) {
        CircuitElm *ce = elmList[i];
        ce->setPoints();
        ce->setSelected(true);
        const Rectangle &bb = ce->getBoundingBox();
        newbb = newbb ? newbb->unite(bb) : bb;
    }

    if (oldbb && newbb) {
        // find a place on the edge for new items
        int dx = 0, dy = 0;
        double spacew = circuitArea.width - oldbb->width - newbb->width;
        double spaceh = circuitArea.height - oldbb->height - newbb->height;

        if (!oldbb->intersects(*newbb)) {
            // old coordinates may be really far away so move them to same origin as current circuit
            dx = snapGrid((int) (oldbb->x - newbb->x));
            dy = snapGrid((int) (oldbb->y - newbb->y));
        }

        if (spacew > spaceh)
            dx = snapGrid((int) (oldbb->x + oldbb->width - newbb->x + gridSize));
        else
            dy = snapGrid((int) (oldbb->y + oldbb->height - newbb->y + gridSize));

        // move new items near the mouse if possible
        if (mouse.mouseCursorX > 0 && circuitArea.contains(mouse.mouseCursorX, mouse.mouseCursorY)) {
            int gx = mouse.inverseTransformX(mouse.mouseCursorX);
            int gy = mouse.inverseTransformY(mouse.mouseCursorY);
            int mdx = snapGrid((int) (gx - (newbb->x + newbb->width / 2)));
            int mdy = snapGrid((int) (gy - (newbb->y + newbb->height / 2)));
            int i;
            for (i = oldsz; i != (int) elmList.size(); i++)
                if (!elmList[i]->allowMove(mdx, mdy))
                    break;
            if (i == (int) elmList.size()) {
                dx = mdx;
                dy = mdy;
            }
        }

        // move the new items
        for (int i = oldsz; i != (int) elmList.size(); i++)
            elmList[i]->move(dx, dy);
    }
    needAnalyze();
    writeRecoveryToStorage();
}

void CirSim::doSelectAll() {
    for (CircuitElm *ce : *uiElmList)
        ce->setSelected(true);
    enableDisableMenuItems();
}

void CirSim::enableDisableMenuItems() {
    if (cutItem == nullptr)
        return;
    bool canFlipX = true;
    bool canFlipY = true;
    bool canFlipXY = true;
    int selCount = countSelected();
    for (CircuitElm *elm : *uiElmList) {
        if (elm->isSelected() || selCount == 0) {
            if (!elm->canFlipX()) canFlipX = false;
            if (!elm->canFlipY()) canFlipY = false;
            if (!elm->canFlipXY()) canFlipXY = false;
        }
    }
    // shortcut keys act on the element under the mouse, so allow them then too
    bool canCopy = selCount > 0 || keyMenuElm() != nullptr;
    cutItem->setEnabled(canCopy);
    copyItem->setEnabled(canCopy);
    rotateCCWItem->setEnabled(canFlipXY && canFlipY);
    rotateCWItem->setEnabled(canFlipXY && canFlipY);
    mirrorXItem->setEnabled(canFlipX);
    mirrorYItem->setEnabled(canFlipY);
}
