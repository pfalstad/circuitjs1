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

class ROMElm extends SRAMElm {

    public ROMElm(int xx, int yy) {
	super(xx, yy);
    }

    public ROMElm(int xa, int ya, int xb, int yb, int f,
		  StringTokenizer st) {
	super(xa, ya, xb, yb, f, st);
    }

    String getChipName() { return "ROM"; }
    int getDumpType() { return 436; }

    // no WE pin; just OE + address + data
    void setupPins() {
	if (addressBits == 0)
	    addressBits = dataBits = 4;
	sizeX = 2;
	int addrY = useBus() ? 1 : addressBits;
	int dataY = useBus() ? 1 : dataBits;
	sizeY = max(addrY, dataY) + 1;
	bits = addressBits;
	pins = new Pin[getPostCount()];

	// OE (active low) at top-left
	pins[0] = new Pin(0, SIDE_W, "OE");
	pins[0].lineOver = true;

	addressNodes = 1;
	dataNodes = 1 + addressBits;
	internalNodes = 1 + addressBits + dataBits;

	makeBitPins(addressBits, sizeY - addrY, SIDE_W, addressNodes, "A", false, false, true);
	makeBitPins(dataBits, sizeY - dataY, SIDE_E, dataNodes, "D", true, false, true);
	allocNodes();
    }

    int getPostCount() {
	return 1 + addressBits + dataBits;
    }

    void doStep() {
	int i;
	boolean outputEnabled = volts[0] < getThreshold();

	// get address
	address = 0;
	for (i = 0; i != addressBits; i++)
	    address |= (volts[addressNodes + i] > getThreshold()) ? 1 << (addressBits - 1 - i) : 0;

	Integer dataObj = map.get(address);
	int data = (dataObj == null) ? 0 : dataObj;
	for (i = 0; i != dataBits; i++) {
	    Pin p = pins[i + dataNodes];
	    sim.updateVoltageSource(CircuitNode.ground, nodes[internalNodes + i], p.voltSource,
		(data & (1 << (dataBits - 1 - i))) == 0 ? 0 : highVoltage);

	    // if output enabled, stamp a small resistor from internal voltage source to data pin.
	    // if output disabled, stamp a large pulldown resistor from data pin to ground.
	    if (outputEnabled)
		sim.stampResistor(nodes[internalNodes + i], nodes[dataNodes + i], 1);
	    else
		sim.stampResistor(nodes[dataNodes + i], CircuitNode.ground, 1e8);
	}
    }

    // no writing
    void stepFinished() {}
}
