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
    // enable mode stored in bits 5-6: 0=none, 1=one each, 2=two each
    final int FLAG_ENABLE_MASK = 32 | 64;
    final int FLAG_ENABLE_SHIFT = 5;

    boolean hasReset() { return (flags & FLAG_RESET) != 0; }
    boolean hasSet() { return (flags & FLAG_SET) != 0; }
    int enableMode() { return (flags & FLAG_ENABLE_MASK) >> FLAG_ENABLE_SHIFT; }
    int inputEnableCount() { return enableMode(); }
    int outputEnableCount() { return enableMode(); }
    boolean hasOutputEnable() { return enableMode() > 0; }

    int loadPin, resetPin, setPin;
    int ie1Pin, ie2Pin, oe1Pin, oe2Pin;
    int intNodes;
    VoltageSource vSources[];

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
    boolean nonLinear() { return hasOutputEnable(); }

    void setupPins() {
	sizeX = 2;
	int ieCount = inputEnableCount();
	int oeCount = outputEnableCount();
	int extraLeftPins = (hasReset() ? 1 : 0) + (hasSet() ? 1 : 0) + ieCount;
	int extraRightPins = oeCount;
	int bitsY = useBus() ? 1 : bits;
	sizeY = max(bitsY + 1 + extraLeftPins, bitsY + extraRightPins);
	pins = new Pin[getPostCount()];
	makeBitPins(bits, 0, SIDE_W, 0, "I", false, false, false);
	makeBitPins(bits, 0, SIDE_E, bits, "O", !hasOutputEnable(), (flags & FLAG_STATE) != 0, false);
	int pinIndex = bits * 2;
	int leftPos = bitsY;
	int rightPos = bitsY;

	pins[loadPin = pinIndex++] = new Pin(leftPos++, SIDE_W, "Ld");
	if (hasReset())
	    pins[resetPin = pinIndex++] = new Pin(leftPos++, SIDE_W, "R");
	if (hasSet())
	    pins[setPin = pinIndex++] = new Pin(leftPos++, SIDE_W, "S");
	rightPos = leftPos;
	if (ieCount >= 1) {
	    pins[ie1Pin = pinIndex++] = new Pin(leftPos++, SIDE_W, "IE");
	    pins[ie1Pin].lineOver = true;
	}
	if (ieCount >= 2) {
	    pins[ie2Pin = pinIndex++] = new Pin(leftPos++, SIDE_W, "IE");
	    pins[ie2Pin].lineOver = true;
	}
	if (oeCount >= 1) {
	    pins[oe1Pin = pinIndex++] = new Pin(rightPos++, SIDE_E, "OE");
	    pins[oe1Pin].lineOver = true;
	}
	if (oeCount >= 2) {
	    pins[oe2Pin = pinIndex++] = new Pin(rightPos++, SIDE_E, "OE");
	    pins[oe2Pin].lineOver = true;
	}
	intNodes = pinIndex;
	allocNodes();
    }

    boolean lastLoad = false;
    boolean outputValues[];

    boolean[] lastOutputValues() {
	if (outputValues == null)
	    outputValues = new boolean[bits];
	return outputValues;
    }

    // execute() is used by ChipElm.doStep() when there's no output enable.
    // when output enable is present, we override doStep() entirely.
    void execute() {
	doLoad();
	for (int i = 0; i != bits; i++)
	    pins[i + bits].value = lastOutputValues()[i];
    }

    // shared load logic
    void doLoad() {
	if (hasSet() && pins[setPin].value) {
	    for (int i = 0; i != bits; i++)
		outputValues[i] = true;
	    lastLoad = pins[loadPin].value;
	    return;
	}
	if (hasReset() && pins[resetPin].value) {
	    for (int i = 0; i != bits; i++)
		outputValues[i] = false;
	    lastLoad = pins[loadPin].value;
	    return;
	}
	boolean inputEnabled = true;
	if (inputEnableCount() >= 1 && pins[ie1Pin].value)
	    inputEnabled = false;
	if (inputEnableCount() >= 2 && pins[ie2Pin].value)
	    inputEnabled = false;
	if (inputEnabled && pins[loadPin].value && (!isEdgeTriggered() || !lastLoad))
	    for (int i = 0; i != bits; i++)
		outputValues[i] = pins[i].value;
	lastLoad = pins[loadPin].value;
    }

    void doStep() {
	if (!hasOutputEnable()) {
	    super.doStep();
	    return;
	}

	// read inputs
	for (int i = 0; i < getPostCount(); i++) {
	    Pin p = pins[i];
	    if (!p.output)
		p.value = volts[i] > getThreshold();
	}

	doLoad();

	boolean outputEnabled = true;
	if (outputEnableCount() >= 1 && pins[oe1Pin].value)
	    outputEnabled = false;
	if (outputEnableCount() >= 2 && pins[oe2Pin].value)
	    outputEnabled = false;

	for (int i = 0; i < bits; i++) {
	    double v = lastOutputValues()[i] ? highVoltage : 0;
	    sim.updateVoltageSource(CircuitNode.ground, nodes[intNodes + i], vSources[i], v);
	    if (outputEnabled)
		sim.stampResistor(nodes[intNodes + i], nodes[bits + i], 1);
	    else
		sim.stampResistor(nodes[bits + i], CircuitNode.ground, 1e8);
	}
    }

    void stamp() {
	if (!hasOutputEnable()) {
	    super.stamp();
	    return;
	}
	for (int i = 0; i < bits; i++) {
	    sim.stampVoltageSource(CircuitNode.ground, nodes[intNodes + i], vSources[i]);
	    sim.stampNonLinear(nodes[intNodes + i]);
	    sim.stampNonLinear(nodes[bits + i]);
	}
    }

    int getVoltageSourceCount() { return bits; }

    int getInternalNodeCount() {
	return hasOutputEnable() ? bits : 0;
    }

    void setVoltageSource(int j, VoltageSource vs) {
	if (hasOutputEnable()) {
	    if (vSources == null || vSources.length != bits)
		vSources = new VoltageSource[bits];
	    vSources[j] = vs;
	    vs.setNodes(CircuitNode.ground, nodes[intNodes + j]);
	} else {
	    super.setVoltageSource(j, vs);
	}
    }

    boolean getMatrixConnection(int n1, int n2) {
	if (hasOutputEnable()) {
	    for (int i = 0; i < bits; i++)
		if (comparePair(n1, n2, intNodes + i, bits + i))
		    return true;
	}
	return false;
    }

    boolean getConnection(int n1, int n2) { return false; }
    boolean hasGroundConnection(int n1) {
	if (hasOutputEnable())
	    return (n1 >= bits && n1 < bits * 2);
	return pins[n1].output;
    }

    int getPostCount() {
	return bits * 2 + 1
	    + (hasReset() ? 1 : 0) + (hasSet() ? 1 : 0)
	    + inputEnableCount() + outputEnableCount();
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
	if (n == 4) {
	    EditInfo ei = new EditInfo("Enable Pins", 0);
	    ei.choice = new Choice();
	    ei.choice.add("None");
	    ei.choice.add("1 Input/Output Enable");
	    ei.choice.add("2 Input/Output Enables");
	    ei.choice.select(enableMode());
	    return ei;
	}
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
	if (n == 4) {
	    int mode = ei.choice.getSelectedIndex();
	    flags = (flags & ~FLAG_ENABLE_MASK) | (mode << FLAG_ENABLE_SHIFT);
	    setupPins();
	    allocNodes();
	    setPoints();
	}
    }

}
