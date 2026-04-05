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

import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;

class BusTransceiverElm extends ChipElm {
    int dataBits;
    // pin index offsets
    int aNodes, bNodes, intNodes;
    VoltageSource vSources[];

    public BusTransceiverElm(int xx, int yy) {
	super(xx, yy);
	dataBits = 4;
	setupPins();
    }

    void dumpXml(Document doc, Element elem) {
	super.dumpXml(doc, elem);
	XMLSerializer.dumpAttr(elem, "db", dataBits);
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	dataBits = xml.parseIntAttr("db", dataBits);
	setupPins();
    }

    boolean nonLinear() { return true; }
    boolean allowBus() { return true; }
    String getChipName() { return "Bus Transceiver"; }
    int defaultBitCount() { return 4; }

    void setupPins() {
	if (dataBits == 0)
	    dataBits = 4;
	sizeX = 2;
	int dataY = useBus() ? 1 : dataBits;
	sizeY = dataY + 2;
	bits = dataBits;
	pins = new Pin[getPostCount()];

	// OE (active low) at top-left
	pins[0] = new Pin(0, SIDE_W, "OE");
	pins[0].lineOver = true;

	// DIR at top-right
	pins[1] = new Pin(0, SIDE_E, "DIR");

	aNodes = 2;
	bNodes = 2 + dataBits;
	intNodes = 2 + 2 * dataBits;

	// A pins on left side
	makeBitPins(dataBits, sizeY - dataY, SIDE_W, aNodes, "A", false, false, true);

	// B pins on right side
	makeBitPins(dataBits, sizeY - dataY, SIDE_E, bNodes, "B", false, false, true);

	allocNodes();
    }

    int getPostCount() {
	return 2 + 2 * dataBits;
    }

    // one voltage source and one internal node per bit
    int getVoltageSourceCount() { return dataBits; }
    int getInternalNodeCount() { return dataBits; }

    void setVoltageSource(int j, VoltageSource vs) {
	if (vSources == null || vSources.length != dataBits)
	    vSources = new VoltageSource[dataBits];
	vSources[j] = vs;
	vs.setNodes(CircuitNode.ground, nodes[intNodes + j]);
    }

    boolean getMatrixConnection(int n1, int n2) {
	// each internal node connects to both its A and B pin via resistors
	for (int i = 0; i < dataBits; i++) {
	    if (comparePair(n1, n2, intNodes + i, aNodes + i))
		return true;
	    if (comparePair(n1, n2, intNodes + i, bNodes + i))
		return true;
	}
	return false;
    }

    void stamp() {
	for (int i = 0; i < dataBits; i++) {
	    sim.stampVoltageSource(CircuitNode.ground, nodes[intNodes + i], vSources[i]);
	    sim.stampNonLinear(nodes[intNodes + i]);
	    sim.stampNonLinear(nodes[aNodes + i]);
	    sim.stampNonLinear(nodes[bNodes + i]);
	}
    }

    void doStep() {
	boolean outputEnabled = volts[0] < getThreshold();
	boolean dirAtoB = volts[1] > getThreshold();

	for (int i = 0; i < dataBits; i++) {
	    // read from source side, drive to destination side
	    boolean srcVal;
	    if (dirAtoB)
		srcVal = volts[aNodes + i] > getThreshold();
	    else
		srcVal = volts[bNodes + i] > getThreshold();

	    sim.updateVoltageSource(CircuitNode.ground, nodes[intNodes + i], vSources[i],
		srcVal ? highVoltage : 0);

	    // connect internal node to destination side with low resistance when enabled,
	    // high resistance when disabled.  source side always high resistance.
	    double rDst = outputEnabled ? 1 : 1e10;
	    if (dirAtoB) {
		sim.stampResistor(nodes[intNodes + i], nodes[aNodes + i], 1e8);
		sim.stampResistor(nodes[intNodes + i], nodes[bNodes + i], rDst);
	    } else {
		sim.stampResistor(nodes[intNodes + i], nodes[aNodes + i], rDst);
		sim.stampResistor(nodes[intNodes + i], nodes[bNodes + i], 1e8);
	    }
	}
    }

    void getInfo(String arr[]) {
	arr[0] = "bus transceiver";
	boolean outputEnabled = volts[0] < getThreshold();
	boolean dirAtoB = volts[1] > getThreshold();
	arr[1] = outputEnabled ? (dirAtoB ? "A\u2192B" : "B\u2192A") : "hi-Z";
    }

    public EditInfo getChipEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("# of Bits", dataBits, 1, 1).setDimensionless();
	return super.getChipEditInfo(n);
    }

    public void setChipEditValue(int n, EditInfo ei) {
	if (n == 0) {
	    if (ei.value >= 1 && ei.value <= 16) {
		dataBits = (int) ei.value;
		setupPins();
		setPoints();
	    } else
		ei.setError("must be between 1 and 16");
	}
    }
}
