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

#include <memory>
#include <vector>

class CircuitElm;
class Scope;
class ScopeElm;
class SimApp;

// the scopes docked along the bottom of the window
class ScopeManager {
public:
    explicit ScopeManager(SimApp *sim);
    ~ScopeManager();

    SimApp *sim;
    std::vector<std::unique_ptr<Scope>> scopes;
    int scopeCount = 0;
    std::vector<int> scopeColCount;
    int scopeSelected = -1;
    int scopeMenuSelected = -1;
    int menuScope = -1;
    int menuPlot = -1;
    double scopeHeightFraction = 0.2;
    int oldScopeCount = -1;

    bool scopeMenuIsSelected(const Scope *s) const;
    void timeStep();
    void setupScopes();
    // we need to calculate wire currents for every iteration if someone is viewing a wire in the
    // scope.  Otherwise we can do it only once per frame.
    bool canDelayWireProcessing() const;
    int countScopeElms() const;
    ScopeElm *getNthScopeElm(int n) const;
    void deleteUnusedScopeElms();
    bool canStackScope(int s) const;
    bool canCombineScope(int s) const { return scopeCount >= 2; }
    bool canUnstackScope(int s) const;
    void stackScope(int s);
    void unstackScope(int s);
    void combineScope(int s);
    void stackAll();
    void unstackAll();
    void combineAll();
    void separateAll();
    void addScope(std::unique_ptr<Scope> sc);
    void clearScopes();
    void resetGraphs();
    // put elm in the first empty scope slot, or a new one ("View in New Scope")
    void viewInScope(CircuitElm *elm);
    void elementDeleted(const CircuitElm *ce);
};
