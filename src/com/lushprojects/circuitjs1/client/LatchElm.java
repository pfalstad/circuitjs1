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
    public LatchElm(int xx, int yy) {
	super(xx, yy);
	flags = FLAG_STATE;
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
    int loadPin;
    void setupPins() {
	sizeX = 2;
	sizeY = bits+1;
	pins = new Pin[getPostCount()];
	int i;
	for (i = 0; i != bits; i++)
	    pins[i] = new Pin(bits-1-i, SIDE_W, "I" + i);
	for (i = 0; i != bits; i++) {
	    pins[i+bits] = new Pin(bits-1-i, SIDE_E, "O");
	    pins[i+bits].output = true;
	    pins[i+bits].state = (flags & FLAG_STATE) != 0;
	}
	pins[loadPin = bits*2] = new Pin(bits, SIDE_W, "Ld");
	allocNodes();
    }
    boolean lastLoad = false;
    boolean execute() {
	int i;
	if (pins[loadPin].value && !lastLoad)
	    for (i = 0; i != bits; i++)
		pins[i+bits].value = pins[i].value;
	lastLoad = pins[loadPin].value;
	return true;
    }
    int getVoltageSourceCount() { return bits; }
    int getPostCount() { return bits*2+1; }
    int getDumpType() { return 168; }
    public EditInfo getEditInfo(int n) {
	if (n < 2)
	    return super.getEditInfo(n);
	if (n == 2)
	    return new EditInfo("# of Bits", bits, 1, 1).setDimensionless();
	return null;
    }
    public void setEditValue(int n, EditInfo ei) {
	if (n < 2) {
	    super.setEditValue(n,  ei);
	    return;
	}
	if (n == 2 && ei.value >= 2) {
	    bits = (int)ei.value;
	    setupPins();
	    setPoints();
	}
    }
    
}
    
