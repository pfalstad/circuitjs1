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

#include <QContextMenuEvent>
#include <QMenu>

#include "CirSim.h"
#include "SliderDialog.h"
#include "core/CircuitElm.h"
#include "core/Locale.h"
#include "core/Scope.h"
#include "core/ScopeManager.h"

static QString LS(const char *s) { return QString::fromStdString(Locale::LS(s)); }

void CirSim::doPopupMenu(const QPoint &globalPos) {
    CircuitElm *menuElm = mouse.getMouseElm();
    ScopeManager *sm = scopeManager;
    sm->menuScope = -1;
    sm->menuPlot = -1;
    QMenu menu(this);

    if (sm->scopeSelected != -1 && sm->scopeSelected < sm->scopeCount) {
        Scope *s = sm->scopes[sm->scopeSelected].get();
        if (!s->canMenu())
            return;
        int si = sm->scopeSelected;
        sm->menuScope = si;
        sm->menuPlot = s->selectedPlot;
        int plot = s->selectedPlot;
        menu.addAction(LS("Remove Scope"), this, [this, s] { pushUndo(); s->setElm(nullptr); });  // setupScopes() will clean this up
        menu.addAction(LS("Undock Scope"))->setEnabled(false);  // TODO: ScopeElm
        QAction *mx = menu.addAction(LS("Max Scale"), this, [s] { s->maxScaleToggle(); });
        mx->setCheckable(true);
        mx->setChecked(s->maxScale);
        menu.addAction(LS("Stack"), this, [sm, si] { sm->stackScope(si); })->setEnabled(sm->canStackScope(si));
        menu.addAction(LS("Unstack"), this, [sm, si] { sm->unstackScope(si); })->setEnabled(sm->canUnstackScope(si));
        menu.addAction(LS("Combine"), this, [sm, si] { sm->combineScope(si); })->setEnabled(sm->canCombineScope(si));
        menu.addAction(LS("Remove Plot"), this, [s, plot] { s->removePlot(plot); });
        menu.addAction(LS("Reset"), this, [s] { s->resetGraph(true); });
        menu.addAction(LS("Export CSV..."))->setEnabled(false);    // TODO
        menu.addAction(LS("Export Image..."))->setEnabled(false);  // TODO
        menu.addAction(LS("Properties..."))->setEnabled(false);    // TODO: scope properties dialog
    } else if (menuElm != nullptr) {
        menu.addAction(LS("Edit..."), this, [this, menuElm] { doEdit(menuElm); })
            ->setEnabled(menuElm->getEditInfo(0).has_value());
        menu.addAction(LS("View in New Scope"), this, [this, menuElm] { scopeManager->viewInScope(menuElm); })
            ->setEnabled(menuElm->canViewInScope());
        menu.addAction(LS("View in New Undocked Scope"))->setEnabled(false);  // TODO: ScopeElm
        QMenu *add = menu.addMenu(LS("Add to Existing Scope"));
        for (int i = 0; i < sm->scopeCount; i++) {
            Scope *s = sm->scopes[i].get();
            QString label = QString::fromStdString(s->getScopeLabelOrText());
            if (label.isEmpty())
                label = LS("Scope") + " " + QString::number(i + 1);
            add->addAction(label, this, [s, menuElm] { s->addElm(menuElm); });
        }
        add->setEnabled(menuElm->canViewInScope() && sm->scopeCount > 0);
        menu.addAction(LS("Cut"))->setEnabled(false);   // TODO
        menu.addAction(LS("Copy"))->setEnabled(false);  // TODO
        menu.addAction(LS("Delete"), this, [this] { pushUndo(); doDelete(); });
        menu.addAction(LS("Duplicate"))->setEnabled(false);  // TODO
        menu.addAction(LS("Swap Terminals"), this, [this, menuElm] {
            menuElm->flipPosts();
            needAnalyze();
        });
        menu.addAction(LS("Mirror X"))->setEnabled(false);    // TODO
        menu.addAction(LS("Mirror Y"))->setEnabled(false);    // TODO
        menu.addAction(LS("Rotate CCW"))->setEnabled(false);  // TODO
        menu.addAction(LS("Rotate CW"))->setEnabled(false);   // TODO
        menu.addAction(LS("Split Wire Manually"))->setEnabled(false);  // TODO
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

void CirSim::doSliders(CircuitElm *ce) {
    mouse.clearSelection();
    pushUndo();
    SliderDialog dlg(ce, this);
    dlg.exec();
}
