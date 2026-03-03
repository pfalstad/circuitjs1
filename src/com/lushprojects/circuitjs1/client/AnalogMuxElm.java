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

class AnalogMuxElm extends ChipElm {
    int selectBitCount;
    int inputCount;
    int outputPin;
    double r_on, r_off, threshold;

    public AnalogMuxElm(int xx, int yy) {
	super(xx, yy);
	selectBitCount = 2;
	r_on = 20;
	r_off = 1e10;
	threshold = 2.5;
	setupPins();
    }
    public AnalogMuxElm(int xa, int ya, int xb, int yb, int f,
		    StringTokenizer st) {
	super(xa, ya, xb, yb, f, st);
	selectBitCount = 2;
	r_on = 20;
	r_off = 1e10;
	threshold = 2.5;
	try {
	    selectBitCount = Integer.parseInt(st.nextToken());
	    r_on = new Double(st.nextToken()).doubleValue();
	    r_off = new Double(st.nextToken()).doubleValue();
	    threshold = new Double(st.nextToken()).doubleValue();
	} catch (Exception e) {}
	setupPins();
    }

    boolean hasReset() { return false; }
    String getChipName() { return "Analog Mux"; }
    boolean nonLinear() { return true; }
    int getDumpType() { return 432; }

    String dump() {
	return super.dump() + " " + selectBitCount + " " + r_on + " " + r_off + " " + threshold;
    }

    void setupPins() {
	inputCount = 1 << selectBitCount;
	sizeX = selectBitCount + 1;
	sizeY = inputCount + 1;

	pins = new Pin[getPostCount()];
	int i;
	for (i = 0; i != inputCount; i++)
	    pins[i] = new Pin(i, SIDE_W, "I" + i);
	for (i = 0; i != selectBitCount; i++)
	    pins[inputCount + i] = new Pin(i + 1, SIDE_S, "S" + i);
	outputPin = inputCount + selectBitCount;
	pins[outputPin] = new Pin(0, SIDE_E, "Z");
	allocNodes();
    }

    int getPostCount() {
	return inputCount + selectBitCount + 1;
    }

    // No voltage sources -- purely resistive connections
    int getVoltageSourceCount() { return 0; }

    void stamp() {
	int i;
	// mark all data nodes as nonlinear (selected input changes dynamically)
	for (i = 0; i != inputCount; i++)
	    sim.stampNonLinear(nodes[i]);
	sim.stampNonLinear(nodes[outputPin]);
    }

    void doStep() {
	// read select pins to determine which input is active
	int selectedInput = 0;
	for (int i = 0; i != selectBitCount; i++)
	    if (volts[inputCount + i] > threshold)
		selectedInput |= 1 << i;

	// stamp r_on between output and selected input, r_off to others
	for (int i = 0; i != inputCount; i++) {
	    double r = (i == selectedInput) ? r_on : r_off;
	    sim.stampResistor(nodes[i], nodes[outputPin], r);
	}
    }

    void calculateCurrent() {
	int selectedInput = 0;
	for (int i = 0; i != selectBitCount; i++)
	    if (volts[inputCount + i] > threshold)
		selectedInput |= 1 << i;
	double outputCurrent = 0;
	for (int i = 0; i != inputCount; i++) {
	    double r = (i == selectedInput) ? r_on : r_off;
	    double c = (volts[i] - volts[outputPin]) / r;
	    pins[i].current = -c;
	    outputCurrent += c;
	}
	pins[outputPin].current = outputCurrent;
	// select pins carry no current
	for (int i = 0; i != selectBitCount; i++)
	    pins[inputCount + i].current = 0;
    }

    boolean getConnection(int n1, int n2) {
	// select pins are not connected to anything
	if (n1 >= inputCount && n1 < outputPin)
	    return false;
	if (n2 >= inputCount && n2 < outputPin)
	    return false;
	return true;
    }

    void getInfo(String arr[]) {
	arr[0] = "analog multiplexer";
	int selectedInput = 0;
	for (int i = 0; i != selectBitCount; i++)
	    if (volts[inputCount + i] > threshold)
		selectedInput |= 1 << i;
	arr[1] = "selected: I" + selectedInput;
	arr[2] = "Vout = " + getVoltageText(volts[outputPin]);
    }

    public EditInfo getChipEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("# of Select Bits", selectBitCount, 1, 8).setDimensionless();
	if (n == 1)
	    return new EditInfo("On Resistance (ohms)", r_on, 0, 0);
	if (n == 2)
	    return new EditInfo("Off Resistance (ohms)", r_off, 0, 0);
	if (n == 3)
	    return new EditInfo("Threshold Voltage", threshold, 0, 0);
	return super.getChipEditInfo(n);
    }

    public void setChipEditValue(int n, EditInfo ei) {
	if (n == 0 && ei.value >= 1 && ei.value <= 6) {
	    selectBitCount = (int) ei.value;
	    setupPins();
	    setPoints();
	    return;
	}
	if (n == 1 && ei.value > 0)
	    r_on = ei.value;
	if (n == 2 && ei.value > 0)
	    r_off = ei.value;
	if (n == 3)
	    threshold = ei.value;
	super.setChipEditValue(n, ei);
    }
}
