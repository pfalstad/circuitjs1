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
#include <string>
#include <vector>

class CirSim;

struct UndoItem {
    std::string dump;
    double scale, transform4, transform5;
    UndoItem(CirSim *sim, std::string dump);
};

class UndoManager {
public:
    explicit UndoManager(CirSim *sim) : sim(sim) {}

    std::vector<UndoItem> undoStack;
    std::vector<UndoItem> redoStack;

    void pushUndo();
    void doUndo();
    void doRedo();
    void loadUndoItem(const UndoItem &ui);
    void enableUndoRedo();
    // TODO: recovery (the TS version keeps the last circuit in localStorage)

private:
    CirSim *sim;
};
