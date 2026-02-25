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

package com.lushprojects.circuitjs1.client;

import java.util.Vector;
import com.google.gwt.storage.client.Storage;

public class UndoManager {

    CirSim sim;
    Vector<UndoItem> undoStack, redoStack;

    UndoManager(CirSim sim) {
	this.sim = sim;
	undoStack = new Vector<UndoItem>();
	redoStack = new Vector<UndoItem>();
    }

    class UndoItem {
	public String dump;
	public double scale, transform4, transform5;
	UndoItem(String d) {
	    dump = d;
	    scale = sim.transform[0];
	    transform4 = sim.transform[4];
	    transform5 = sim.transform[5];
	}
    }

    void pushUndo() {
    	redoStack.removeAllElements();
    	String s = sim.dumpCircuit();
    	if (undoStack.size() > 0 &&
    			s.compareTo(undoStack.lastElement().dump) == 0)
    	    return;
    	undoStack.add(new UndoItem(s));
    	enableUndoRedo();
    	sim.savedFlag = false;
    }

    void doUndo() {
    	if (undoStack.size() == 0)
    		return;
    	redoStack.add(new UndoItem(sim.dumpCircuit()));
    	UndoItem ui = undoStack.remove(undoStack.size()-1);
    	loadUndoItem(ui);
    	enableUndoRedo();
    }

    void doRedo() {
    	if (redoStack.size() == 0)
    		return;
    	undoStack.add(new UndoItem(sim.dumpCircuit()));
    	UndoItem ui = redoStack.remove(redoStack.size()-1);
    	loadUndoItem(ui);
    	enableUndoRedo();
    }

    void loadUndoItem(UndoItem ui) {
	sim.loader.readCircuit(ui.dump, CircuitLoader.RC_NO_CENTER);
	sim.transform[0] = sim.transform[3] = ui.scale;
	sim.transform[4] = ui.transform4;
	sim.transform[5] = ui.transform5;
    }

    void doRecover() {
	pushUndo();
	sim.loader.readCircuit(sim.recovery);
	sim.allowSave(false);
	sim.menus.recoverItem.setEnabled(false);
    }

    void enableUndoRedo() {
    	sim.menus.redoItem.setEnabled(redoStack.size() > 0);
    	sim.menus.undoItem.setEnabled(undoStack.size() > 0);
    }

    void writeRecoveryToStorage() {
	sim.console("write recovery");
    	Storage stor = Storage.getLocalStorageIfSupported();
    	if (stor == null)
    		return;
    	String s = sim.dumpCircuit();
    	stor.setItem("circuitRecovery", s);
    }

    void readRecovery() {
	Storage stor = Storage.getLocalStorageIfSupported();
	if (stor == null)
		return;
	sim.recovery = stor.getItem("circuitRecovery");
    }
}
