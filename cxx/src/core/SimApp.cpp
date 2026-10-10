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

#include "SimApp.h"

#include "CircuitElm.h"
#include "ScopeManager.h"

SimApp::~SimApp() {
    deleteAllElms();
}

void SimApp::updateModels() {
    for (CircuitElm *ce : elmList)
        ce->updateModels();
}

void SimApp::deleteAllElms() {
    for (CircuitElm *ce : elmList) {
        ce->deleteElm();
        delete ce;
    }
    elmList.clear();
}

void SimApp::onTimeStep() {
    if (scopeManager != nullptr)
        scopeManager->timeStep();
}

bool SimApp::canDelayWireProcessing() {
    return scopeManager != nullptr && scopeManager->canDelayWireProcessing();
}

void SimApp::elementDeleted(CircuitElm *ce) {
    if (scopeManager != nullptr)
        scopeManager->elementDeleted(ce);
}
