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

#include "ScopeManager.h"

#include "../elements/ScopeElm.h"

#include "CircuitElm.h"
#include "Scope.h"
#include "SimApp.h"
#include "SimulationManager.h"

ScopeManager::ScopeManager(SimApp *s) : sim(s) {
    scopes.resize(20);
    scopeColCount.assign(20, 0);
}

ScopeManager::~ScopeManager() = default;

bool ScopeManager::scopeMenuIsSelected(const Scope *s) const {
    if (scopeMenuSelected < 0)
        return false;
    if (scopeMenuSelected < scopeCount)
        return scopes[scopeMenuSelected].get() == s;
    ScopeElm *se = getNthScopeElm(scopeMenuSelected - scopeCount);
    return se != nullptr && se->elmScope.get() == s;
}

void ScopeManager::timeStep() {
    for (int i = 0; i != scopeCount; i++)
        scopes[i]->timeStep();
    for (CircuitElm *ce : sim->scopeElmArr)
        static_cast<ScopeElm *>(ce)->stepScope();
}

void ScopeManager::setupScopes() {
    // check scopes to make sure the elements still exist, and remove
    // unused scopes/columns
    int pos = -1;
    for (int i = 0; i < scopeCount; i++) {
        if (!scopes[i]) {
            scopeCount = i;
            break;
        }
        if (scopes[i]->needToRemove()) {
            for (int j = i; j < scopeCount; j++)
                scopes[j] = (j + 1 < (int) scopes.size()) ? std::move(scopes[j + 1]) : nullptr;
            scopeCount--;
            i--;
            continue;
        }
        if (scopes[i]->position > pos + 1)
            scopes[i]->position = pos + 1;
        pos = scopes[i]->position;
    }
    while (scopeCount > 0 && (!scopes[scopeCount - 1] || scopes[scopeCount - 1]->getElm() == nullptr))
        scopeCount--;
    int h = (int) (sim->canvasHeight - sim->circuitArea.height);
    pos = 0;
    for (int i = 0; i != scopeCount; i++)
        scopeColCount[i] = 0;
    for (int i = 0; i != scopeCount; i++) {
        pos = std::max(scopes[i]->position, pos);
        scopeColCount[scopes[i]->position]++;
    }
    int colct = pos + 1;
    int iw = SimApp::infoWidth;
    if (colct <= 2)
        iw = iw * 3 / 2;
    int w = (sim->canvasWidth - iw) / colct;
    const int marg = 10;
    if (w < marg * 2)
        w = marg * 2;
    pos = -1;
    int colh = 0;
    int row = 0;
    int speed = 0;
    for (int i = 0; i != scopeCount; i++) {
        Scope &s = *scopes[i];
        if (s.position > pos) {
            pos = s.position;
            colh = h / scopeColCount[pos];
            row = 0;
            speed = s.speed;
        }
        if (s.speed != speed) {
            s.speed = speed;
            s.resetGraph();
        }
        Rectangle r(pos * w, sim->canvasHeight - h + colh * row, w - marg, colh);
        row++;
        if (r.x != s.rect.x || r.y != s.rect.y || r.width != s.rect.width || r.height != s.rect.height)
            s.setRect(r);
    }
    if (oldScopeCount != scopeCount) {
        sim->setCircuitArea();
        oldScopeCount = scopeCount;
    }
}

bool ScopeManager::canDelayWireProcessing() const {
    for (int i = 0; i != scopeCount; i++)
        if (scopes[i]->viewingWire())
            return false;
    for (CircuitElm *ce : sim->elmList)
        if (ce->isScopeElm() && static_cast<ScopeElm *>(ce)->elmScope != nullptr &&
                static_cast<ScopeElm *>(ce)->elmScope->viewingWire())
            return false;
    return true;
}

int ScopeManager::countScopeElms() const {
    int c = 0;
    for (CircuitElm *ce : sim->elmList)
        if (ce->isScopeElm())
            c++;
    return c;
}

ScopeElm *ScopeManager::getNthScopeElm(int n) const {
    for (CircuitElm *ce : sim->elmList) {
        if (ce->isScopeElm()) {
            n--;
            if (n < 0)
                return static_cast<ScopeElm *>(ce);
        }
    }
    return nullptr;
}

void ScopeManager::deleteUnusedScopeElms() {
    // Remove any scopeElms for elements that no longer exist
    for (int i = (int) sim->elmList.size() - 1; i >= 0; i--) {
        CircuitElm *ce = sim->elmList[i];
        if (ce->isScopeElm() && static_cast<ScopeElm *>(ce)->elmScope != nullptr &&
                static_cast<ScopeElm *>(ce)->elmScope->needToRemove()) {
            ce->deleteElm();
            sim->elmList.erase(sim->elmList.begin() + i);
            delete ce;

            // need to rebuild scopeElmArr
            sim->analyzeFlag = true;
        }
    }
}

bool ScopeManager::canStackScope(int s) const {
    if (scopeCount < 2)
        return false;
    if (s == 0)
        s = 1;
    if (scopes[s]->position == scopes[s - 1]->position)
        return false;
    return true;
}

bool ScopeManager::canUnstackScope(int s) const {
    if (scopeCount < 2)
        return false;
    if (s == 0)
        s = 1;
    if (scopes[s]->position != scopes[s - 1]->position) {
        // Allow you to unstack by selecting the top scope in the stack
        return s + 1 < scopeCount && scopes[s + 1]->position == scopes[s]->position;
    }
    return true;
}

void ScopeManager::stackScope(int s) {
    if (!canStackScope(s))
        return;
    if (s == 0)
        s = 1;
    scopes[s]->position = scopes[s - 1]->position;
    for (s++; s < scopeCount; s++)
        scopes[s]->position--;
}

void ScopeManager::unstackScope(int s) {
    if (!canUnstackScope(s))
        return;
    if (s == 0)
        s = 1;
    if (scopes[s]->position != scopes[s - 1]->position)  // Allow you to unstack by selecting the top scope in the stack
        s++;
    for (; s < scopeCount; s++)
        scopes[s]->position++;
}

void ScopeManager::combineScope(int s) {
    if (!canCombineScope(s))
        return;
    if (s == 0)
        s = 1;
    scopes[s - 1]->combine(*scopes[s]);
    scopes[s]->setElm(nullptr);
}

void ScopeManager::stackAll() {
    for (int i = 0; i != scopeCount; i++) {
        scopes[i]->position = 0;
        scopes[i]->showMax = scopes[i]->showMin = false;
    }
}

void ScopeManager::unstackAll() {
    for (int i = 0; i != scopeCount; i++) {
        scopes[i]->position = i;
        scopes[i]->showMax = true;
    }
}

void ScopeManager::combineAll() {
    for (int i = scopeCount - 2; i >= 0; i--) {
        scopes[i]->combine(*scopes[i + 1]);
        scopes[i + 1]->setElm(nullptr);
    }
}

void ScopeManager::separateAll() {
    std::vector<std::unique_ptr<Scope>> newscopes(20);
    int ct = 0;
    for (int i = 0; i < scopeCount; i++)
        ct = scopes[i]->separate(newscopes, ct);
    scopes = std::move(newscopes);
    scopeCount = ct;
}

void ScopeManager::addScope(std::unique_ptr<Scope> sc) {
    if (scopeCount >= (int) scopes.size())
        return;
    if (sc->position < 0)
        sc->position = scopeCount;
    scopes[scopeCount++] = std::move(sc);
}

void ScopeManager::clearScopes() {
    for (auto &s : scopes)
        s.reset();
    scopeCount = 0;
}

void ScopeManager::resetGraphs() {
    for (int i = 0; i != scopeCount; i++)
        scopes[i]->resetGraphFull(true);
}

void ScopeManager::viewInScope(CircuitElm *elm) {
    int i;
    for (i = 0; i != scopeCount; i++)
        if (scopes[i]->getElm() == nullptr)
            break;
    if (i == scopeCount) {
        if (scopeCount == (int) scopes.size())
            return;
        scopeCount++;
        scopes[i] = std::make_unique<Scope>(sim, SimulationManager::theSim);
        scopes[i]->position = i;
    }
    scopes[i]->setElm(elm);
    if (i > 0)
        scopes[i]->speed = scopes[i - 1]->speed;
}

void ScopeManager::elementDeleted(const CircuitElm *ce) {
    for (int i = 0; i != scopeCount; i++)
        if (scopes[i])
            scopes[i]->elementDeleted(ce);
    for (CircuitElm *e : sim->elmList)
        if (e->isScopeElm() && static_cast<ScopeElm *>(e)->elmScope != nullptr)
            static_cast<ScopeElm *>(e)->elmScope->elementDeleted(ce);
}
