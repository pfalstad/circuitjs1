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

class LatchElm extends ChipElm {
    final int FLAG_STATE = 2;
    final int FLAG_NO_EDGE = 4;
    final int FLAG_RESET = 8;
    final int FLAG_SET = 16;
    boolean hasReset() { return (flags & FLAG_RESET) != 0; }
    boolean hasSet() { return (flags & FLAG_SET) != 0; }
    public LatchElm(int xx, int yy) {
	super(xx, yy);
	flags |= FLAG_STATE;
	setupPins();
    }
    public LatchElm(int xa, int ya, int xb, int yb, int f,
		    StringTokenizer st) {
	super(xa, ya, xb, yb, f, st);

	// add FLAG_STATE flag to old latches so their state gets saved
	if ((flags & FLAG_STATE) == 0) {
	    flags |= FLAG_STATE;
	    setupPins();
	}
    }
    String getChipName() { return "Latch"; }
    boolean needsBits() { return true; }
    boolean allowBus() { return true; }
    boolean isEdgeTriggered() { return (flags & FLAG_NO_EDGE) == 0; }
    int loadPin, resetPin, setPin;
    void setupPins() {
	sizeX = 2;
	int extraPins = (hasReset() ? 1 : 0) + (hasSet() ? 1 : 0);
	int bitsY = useBus() ? 1 : bits;
	sizeY = bitsY+1+extraPins;
	pins = new Pin[getPostCount()];
	makeBitPins(bits, 0, SIDE_W, 0, "I", false, false, false);
	makeBitPins(bits, 0, SIDE_E, bits, "O", true, (flags & FLAG_STATE) != 0, false);
	int pinIndex = bits*2;
	pins[loadPin = pinIndex++] = new Pin(bitsY, SIDE_W, "Ld");
	if (hasReset())
	    pins[resetPin = pinIndex++] = new Pin(bitsY+1, SIDE_W, "R");
	if (hasSet())
	    pins[setPin = pinIndex++] = new Pin(bitsY + 1 + (hasReset() ? 1 : 0), SIDE_W, "S");
	allocNodes();
    }
    boolean lastLoad = false;
    void execute() {
	int i;
	if (hasSet() && pins[setPin].value) {
	    for (i = 0; i != bits; i++)
		pins[i+bits].value = true;
	    lastLoad = pins[loadPin].value;
	    return;
	}
	if (hasReset() && pins[resetPin].value) {
	    for (i = 0; i != bits; i++)
		pins[i+bits].value = false;
	    lastLoad = pins[loadPin].value;
	    return;
	}
	if (pins[loadPin].value && (!isEdgeTriggered() || !lastLoad))
	    for (i = 0; i != bits; i++)
		pins[i+bits].value = pins[i].value;
	lastLoad = pins[loadPin].value;
    }
    int getVoltageSourceCount() { return bits; }
    int getPostCount() {
	return bits*2+1 + (hasReset() ? 1 : 0) + (hasSet() ? 1 : 0);
    }
    int getDumpType() { return 168; }
    public EditInfo getChipEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("# of Bits", bits, 1, 1).setDimensionless();
	if (n == 1)
	    return EditInfo.createCheckbox("Edge Triggered", isEdgeTriggered());
	if (n == 2)
	    return EditInfo.createCheckbox("Reset Pin", hasReset());
	if (n == 3)
	    return EditInfo.createCheckbox("Set Pin", hasSet());
	return null;
    }
    public void setChipEditValue(int n, EditInfo ei) {
	if (n == 0 && ei.value >= 2 && bits != (int)ei.value) {
	    bits = (int)ei.value;
	    setupPins();
	    setPoints();
	}
	if (n == 1)
	    flags = ei.changeFlagInverted(flags, FLAG_NO_EDGE);
	if (n == 2) {
	    flags = ei.changeFlag(flags, FLAG_RESET);
	    setupPins();
	    allocNodes();
	    setPoints();
	}
	if (n == 3) {
	    flags = ei.changeFlag(flags, FLAG_SET);
	    setupPins();
	    allocNodes();
	    setPoints();
	}
    }

}

