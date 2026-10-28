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

// right-click menus: element, scope, and (on empty space) the Draw menu
// (MouseManager.doPopupMenu() and ScopePopupMenu in the TS version)

#include <algorithm>
#include <functional>

#include <QContextMenuEvent>
#include <QMenu>

#include "CirSim.h"
#include "ScopePropertiesDialog.h"
#include "SliderDialog.h"
#include "core/CircuitElm.h"
#include "core/Locale.h"
#include "core/Scope.h"
#include "core/ScopeManager.h"
#include "core/ElementFactory.h"
#include "elements/ScopeElm.h"

static QString LS(const char *s) { return QString::fromStdString(Locale::LS(s)); }

void CirSim::doPopupMenu(const QPoint &globalPos) {
    if (isReadOnly())
        return;
    CircuitElm *menuElm = mouse.getMouseElm();
    ScopeManager *sm = scopeManager;
    sm->menuScope = -1;
    sm->menuPlot = -1;
    QMenu menu(this);

    if (sm->scopeSelected != -1 && sm->scopeSelected < sm->scopeCount) {
        Scope *s = sm->scopes[sm->scopeSelected].get();
        if (!s->canMenu())
            return;
        sm->menuScope = sm->scopeSelected;
        sm->menuPlot = s->selectedPlot;
        addScopePopupItems(menu, s, nullptr);
    } else if (menuElm != nullptr && menuElm->isScopeElm()) {
        ScopeElm *se = static_cast<ScopeElm *>(menuElm);
        Scope *s = se->elmScope.get();
        if (s == nullptr || !s->canMenu())
            return;
        sm->menuPlot = s->selectedPlot;
        addScopePopupItems(menu, s, se);
    } else if (menuElm != nullptr) {
        menu.addAction(LS("Edit..."), this, [this, menuElm] { doEdit(menuElm); })
            ->setEnabled(menuElm->hasProperties());
        menu.addAction(LS("View in New Scope"), this, [this, menuElm] { scopeManager->viewInScope(menuElm); })
            ->setEnabled(menuElm->canViewInScope());
        menu.addAction(LS("View in New Undocked Scope"), this, [this, menuElm] {
            ScopeElm *newScope = static_cast<ScopeElm *>(ElementFactory::create(
                "ScopeElm", snapGrid(menuElm->x + 50), snapGrid(menuElm->y + 50)));
            elmList.push_back(newScope);
            newScope->setScopeElm(menuElm);
            // need to rebuild scopeElmArr
            needAnalyze();
        })->setEnabled(menuElm->canViewInScope());
        QMenu *add = menu.addMenu(LS("Add to Existing Scope"));
        int scopeElmCount = sm->countScopeElms();
        for (int i = 0; i < sm->scopeCount + scopeElmCount; i++) {
            Scope *s = (i < sm->scopeCount) ? sm->scopes[i].get() : sm->getNthScopeElm(i - sm->scopeCount)->elmScope.get();
            if (s == nullptr)
                continue;
            QString label = QString::fromStdString(s->getScopeLabelOrText());
            if (label.isEmpty())
                label = LS("Scope") + " " + QString::number(i + 1);
            add->addAction(label, this, [s, menuElm] { s->addElm(menuElm); });
        }
        add->setEnabled(menuElm->canViewInScope() && sm->scopeCount + scopeElmCount > 0);
        menu.addAction(LS("Cut"), this, [this, menuElm] { doCut(menuElm); });
        menu.addAction(LS("Copy"), this, [this, menuElm] { doCopy(menuElm); });
        menu.addAction(LS("Delete"), this, [this] { pushUndo(); doDelete(); });
        menu.addAction(LS("Duplicate"), this, [this, menuElm] { doDuplicate(menuElm); });
        menu.addAction(LS("Swap Terminals"), this, [this, menuElm] {
            menuElm->flipPosts();
            needAnalyze();
        });
        menu.addAction(LS("Mirror X"), this, [this, menuElm] { mirrorX(menuElm); })->setEnabled(menuElm->canFlipX());
        menu.addAction(LS("Mirror Y"), this, [this, menuElm] { mirrorY(menuElm); })->setEnabled(menuElm->canFlipY());
        menu.addAction(LS("Rotate CCW"), this, [this, menuElm] { rotateCCW(menuElm); })
            ->setEnabled(menuElm->canFlipXY() && menuElm->canFlipY());
        menu.addAction(LS("Rotate CW"), this, [this, menuElm] { rotateCW(menuElm); })
            ->setEnabled(menuElm->canFlipXY() && menuElm->canFlipY());
        menu.addAction(LS("Split Wire Manually"), this, [this, menuElm] {
            pushUndo();
            mouse.doSplit(menuElm);
        })->setEnabled(menuElm->isWireElm());
        menu.addAction(LS("Sliders..."), this, [this, menuElm] { doSliders(menuElm); })
            ->setEnabled(sliderItemEnabled(menuElm));
    } else {
        // nothing under the mouse: the Draw menu
        drawMenu->exec(globalPos);
        return;
    }
    menu.exec(globalPos);
    repaint();
}

// the scope popup menu (ScopePopupMenu in the TS version), for a docked scope (se null, and
// ScopeManager.menuScope says which) or an undocked one (se)
void CirSim::addScopePopupItems(QMenu &menu, Scope *s, ScopeElm *se) {
    ScopeManager *sm = scopeManager;
    bool floating = se != nullptr;
    int si = sm->menuScope;
    int plot = sm->menuPlot;
    // every item pushes an undo state first and removes scope elements left with nothing to show
    auto act = [this, sm](std::function<void()> fn) {
        return [this, sm, fn] {
            pushUndo();
            fn();
            sm->deleteUnusedScopeElms();
            needAnalyze();
        };
    };
    menu.addAction(LS("Remove Scope"), this, act([s] { s->setElm(nullptr); }));  // setupScopes() will clean this up
    if (floating) {
        menu.addAction(LS("Dock Scope"), this, act([this, sm, se] {
            if (sm->scopeCount == (int) sm->scopes.size())
                return;
            std::unique_ptr<Scope> sc = se->takeElmScope();
            sc->position = sm->scopeCount;
            sm->addScope(std::move(sc));
            // remove the floating scope element itself.  (doDelete() would miss it, since
            // it's not the mouse element once the mouse leaves the canvas for the menu,
            // and would delete any selected elements)
            auto it = std::find(elmList.begin(), elmList.end(), se);
            if (it != elmList.end()) {
                if (mouse.getMouseElm() == se)
                    mouse.setMouseElm(nullptr);
                se->deleteElm();
                elmList.erase(it);
                delete se;
            }
        }));
    } else {
        menu.addAction(LS("Undock Scope"), this, act([this, sm, s, si] {
            CircuitElm *elm = s->getElm();
            if (elm == nullptr)
                return;
            ScopeElm *newScope = static_cast<ScopeElm *>(ElementFactory::create(
                "ScopeElm", snapGrid(elm->x + 50), snapGrid(elm->y + 50)));
            elmList.push_back(newScope);
            newScope->setElmScope(std::move(sm->scopes[si]));
            // remove scope from list.  setupScopes() will fix the positions
            for (int i = si; i < sm->scopeCount; i++)
                sm->scopes[i] = (i + 1 < (int) sm->scopes.size()) ? std::move(sm->scopes[i + 1]) : nullptr;
            sm->scopeCount--;
        }));
    }
    QAction *mx = menu.addAction(LS("Max Scale"), this, act([s] { s->maxScaleToggle(); }));
    mx->setCheckable(true);
    mx->setChecked(s->maxScale);
    if (!floating) {
        menu.addAction(LS("Stack"), this, act([sm, si] { sm->stackScope(si); }))->setEnabled(sm->canStackScope(si));
        menu.addAction(LS("Unstack"), this, act([sm, si] { sm->unstackScope(si); }))->setEnabled(sm->canUnstackScope(si));
        menu.addAction(LS("Combine"), this, act([sm, si] { sm->combineScope(si); }))->setEnabled(sm->canCombineScope(si));
    }
    menu.addAction(LS("Remove Plot"), this, act([s, plot] { s->removePlot(plot); }));
    menu.addAction(LS("Reset"), this, act([s] { s->resetGraph(true); }));
    menu.addAction(LS("Export CSV..."), this, [this, s] { exportScopeCSV(s); });
    menu.addAction(LS("Export Image..."), this, [this, s] { exportScopeImage(s); });
    menu.addAction(LS("Properties..."), this, [this, s] { showScopeProperties(s); });
}

// check if the user can create sliders for this element
bool CirSim::sliderItemEnabled(CircuitElm *elm) {
    // prevent confusion
    if (elm->isVarRailElm() || elm->isPotElm())
        return false;

    for (int i = 0;; i++) {
        std::optional<EditInfo> ei = elm->getEditInfo(i);
        if (!ei)
            return false;
        if (ei->canCreateAdjustable())
            return true;
    }
}

void CirSim::showScopeProperties(Scope *s) {
    ScopePropertiesDialog dlg(this, s);
    dlg.exec();
    repaint();
}

void CirSim::doSliders(CircuitElm *ce) {
    mouse.clearSelection();
    pushUndo();
    SliderDialog dlg(ce, this);
    dlg.exec();
}
