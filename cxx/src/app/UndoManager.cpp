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

#include "UndoManager.h"
#include "CirSim.h"
#include "core/ModelRegistry.h"

UndoItem::UndoItem(CirSim *sim, std::string d)
    : dump(std::move(d)), scale(sim->transform[0]), transform4(sim->transform[4]), transform5(sim->transform[5]) {}

void UndoManager::pushUndo() {
    redoStack.clear();
    std::string s = sim->dumpCircuit();
    // (moving a sidebar slider isn't an undoable change)
    if (!undoStack.empty() && CirSim::withoutSliders(s) == CirSim::withoutSliders(undoStack.back().dump))
        return;
    undoStack.emplace_back(sim, std::move(s));
    enableUndoRedo();
    sim->unsavedChanges = true;
}

void UndoManager::doUndo() {
    undoOrRedo(undoStack, redoStack);
}

void UndoManager::doRedo() {
    undoOrRedo(redoStack, undoStack);
}

// load the top state of the from stack, pushing the current state onto the other stack
void UndoManager::undoOrRedo(std::vector<UndoItem> &from, std::vector<UndoItem> &to) {
    std::string dump = sim->dumpCircuit();
    // skip states identical to the current one (edits push the state after the change too),
    // so undo doesn't appear to do nothing
    std::string cur = CirSim::withoutSliders(dump);
    while (!from.empty() && CirSim::withoutSliders(from.back().dump) == cur)
        from.pop_back();
    if (!from.empty()) {
        to.emplace_back(sim, std::move(dump));
        UndoItem ui = std::move(from.back());
        from.pop_back();
        loadUndoItem(ui);
    }
    enableUndoRedo();
}

void UndoManager::loadUndoItem(const UndoItem &ui) {
    // undo restores local models' definitions but leaves global models alone (see
    // ModelRegistryBase::loadingUndoState())
    ModelRegistryBase::loadingUndoState() = true;
    try {
        sim->readCircuit(ui.dump, CircuitLoader::RC_NO_CENTER | CircuitLoader::RC_KEEP_MODELS);
    } catch (...) {
        ModelRegistryBase::loadingUndoState() = false;
        throw;
    }
    ModelRegistryBase::loadingUndoState() = false;
    sim->transform[0] = sim->transform[3] = ui.scale;
    sim->transform[4] = ui.transform4;
    sim->transform[5] = ui.transform5;
}

void UndoManager::enableUndoRedo() {
    sim->enableUndoRedo(!undoStack.empty(), !redoStack.empty());
}
