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

UndoItem::UndoItem(CirSim *sim, std::string d)
    : dump(std::move(d)), scale(sim->transform[0]), transform4(sim->transform[4]), transform5(sim->transform[5]) {}

void UndoManager::pushUndo() {
    redoStack.clear();
    std::string s = sim->dumpCircuit();
    if (!undoStack.empty() && s == undoStack.back().dump)
        return;
    undoStack.emplace_back(sim, std::move(s));
    enableUndoRedo();
    sim->unsavedChanges = true;
}

void UndoManager::doUndo() {
    if (undoStack.empty())
        return;
    redoStack.emplace_back(sim, sim->dumpCircuit());
    UndoItem ui = std::move(undoStack.back());
    undoStack.pop_back();
    loadUndoItem(ui);
    enableUndoRedo();
}

void UndoManager::doRedo() {
    if (redoStack.empty())
        return;
    undoStack.emplace_back(sim, sim->dumpCircuit());
    UndoItem ui = std::move(redoStack.back());
    redoStack.pop_back();
    loadUndoItem(ui);
    enableUndoRedo();
}

void UndoManager::loadUndoItem(const UndoItem &ui) {
    sim->readCircuit(ui.dump, CircuitLoader::RC_NO_CENTER);
    sim->transform[0] = sim->transform[3] = ui.scale;
    sim->transform[4] = ui.transform4;
    sim->transform[5] = ui.transform5;
}

void UndoManager::enableUndoRedo() {
    sim->enableUndoRedo(!undoStack.empty(), !redoStack.empty());
}
