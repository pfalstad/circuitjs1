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

class BusSplitterElm extends ChipElm {
    public BusSplitterElm(int xx, int yy) {
	super(xx, yy);
    }
    public BusSplitterElm(int xa, int ya, int xb, int yb, int f,
			   StringTokenizer st) {
	super(xa, ya, xb, yb, f, st);
    }
    String getChipName() { return "Bus Splitter"; }
    boolean needsBits() { return true; }

    void setupPins() {
	sizeX = 2;
	sizeY = bits;
	currents = new double[bits];
	pins = new Pin[getPostCount()];

	// bus side: all pins at same position
	for (int i = 0; i != bits; i++) {
	    int ii = i;
	    pins[ii] = new Pin(0, SIDE_W, "Bus");
	    pins[ii].busWidth = bits;
	    pins[ii].busZ = i;
	}

	// individual side: one pin per bit
	for (int i = 0; i != bits; i++) {
	    int ii = i + bits;
	    pins[ii] = new Pin(bits-1-i, SIDE_E, "" + i);
	}
    }

    double[] currents;

    int getPostCount() { return bits * 2; }
    int getBusWidth() { return bits; }
    int getVoltageSourceCount() { return 0; }

    boolean getConnection(int n1, int n2) {
	// bus pin i connects to individual pin i+bits
	return Math.abs(n1 - n2) == bits;
    }

    boolean isWireEquivalent() { return true; }
    boolean isRemovableWire() { return true; }

    Point getConnectedPost(int n) {
	// bus bit n connects to individual pin n+bits
	return getPost(n + bits);
    }

    double getCurrentIntoNode(int n) {
	if (n < bits)
	    return -currents[n];
	return currents[n - bits];
    }

    void setWireCurrent(int bit, double c) {
	currents[bit] = c;
	pins[bit + bits].current = c;
	// update total bus current on pin 0 (the only bus-side pin that gets drawn)
	double total = 0;
	for (int i = 0; i < bits; i++)
	    total += currents[i];
	pins[0].current = -total;
    }

    int getDumpType() { return 433; }
    String getXmlDumpType() { return "bs"; }

    public EditInfo getChipEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("# of Bits", bits, 1, 1).setDimensionless();
	return null;
    }
    public void setChipEditValue(int n, EditInfo ei) {
	if (n == 0) {
	    if (ei.value >= 2) {
		bits = (int) ei.value;
		setupPins();
		setPoints();
	    } else
		ei.setError("must be >= 2");
	}
    }
}
