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

import { CirSim } from "./CirSim";
import { CircuitLoader } from "./CircuitLoader";

class UndoItem {
    dump: string;
    scale: number;
    transform4: number;
    transform5: number;

    constructor(sim: CirSim, dump: string) {
        this.dump = dump;
        this.scale = sim.transform[0];
        this.transform4 = sim.transform[4];
        this.transform5 = sim.transform[5];
    }
}

export class UndoManager {
    sim: CirSim;
    undoStack: UndoItem[];
    redoStack: UndoItem[];

    constructor(sim: CirSim) {
        this.sim = sim;
        this.undoStack = [];
        this.redoStack = [];
    }

    pushUndo(): void {
        this.redoStack.length = 0;
        const s = this.sim.dumpCircuit();
        if (this.undoStack.length > 0 &&
                s === this.undoStack[this.undoStack.length - 1].dump)
            return;
        this.undoStack.push(new UndoItem(this.sim, s));
        this.enableUndoRedo();
        this.sim.savedFlag = false;
        this.sim.unsavedChanges = true;
    }

    doUndo(): void {
        if (this.undoStack.length === 0)
            return;
        this.redoStack.push(new UndoItem(this.sim, this.sim.dumpCircuit()));
        const ui = this.undoStack.pop()!;
        this.loadUndoItem(ui);
        this.enableUndoRedo();
    }

    doRedo(): void {
        if (this.redoStack.length === 0)
            return;
        this.undoStack.push(new UndoItem(this.sim, this.sim.dumpCircuit()));
        const ui = this.redoStack.pop()!;
        this.loadUndoItem(ui);
        this.enableUndoRedo();
    }

    loadUndoItem(ui: UndoItem): void {
        this.sim.loader.readCircuit(ui.dump, CircuitLoader.RC_NO_CENTER);
        this.sim.transform[0] = this.sim.transform[3] = ui.scale;
        this.sim.transform[4] = ui.transform4;
        this.sim.transform[5] = ui.transform5;
    }

    doRecover(): void {
        this.pushUndo();
        this.sim.loader.readCircuit(this.sim.recovery!);
        this.sim.allowSave(false);
        this.sim.menus.recoverItem.setEnabled(false);
        this.sim.unsavedChanges = false;
    }

    enableUndoRedo(): void {
        this.sim.menus.redoItem.setEnabled(this.redoStack.length > 0);
        this.sim.menus.undoItem.setEnabled(this.undoStack.length > 0);
    }

    writeRecoveryToStorage(): void {
        CirSim.console("write recovery");
        const stor = window.localStorage;
        if (stor == null)
            return;
        const s = this.sim.dumpCircuit();
        stor.setItem("circuitRecovery", s);
    }

    readRecovery(): void {
        const stor = window.localStorage;
        if (stor == null)
            return;
        this.sim.recovery = stor.getItem("circuitRecovery");
    }
}
