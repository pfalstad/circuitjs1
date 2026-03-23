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

import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.Document;

// contributed by Edward Calver

    class DeMultiplexerElm extends ChipElm {
	final int FLAG_BUS_SELECT = 1<<3;

	// outputMode: 0 = single input, individual outputs (original)
	//             1 = single input, bus output (bit distributor)
	//             2 = bus input, bus outputs
	static final int OUTPUT_MODE_INDIVIDUAL = 0;
	static final int OUTPUT_MODE_BUS_BIT = 1;
	static final int OUTPUT_MODE_BUS_BUS = 2;

	int selectBitCount;
	int outputCount;
	int outputMode;
	int dataBusWidth = 4;
	int inputPin;   // index of first input pin
	int selectPin;  // index of first select pin
	int outputPin;  // index of first output pin

	boolean hasReset() {return false;}
	boolean busSelect() { return hasFlag(FLAG_BUS_SELECT); }

	public DeMultiplexerElm(int xx, int yy) { super(xx, yy); }
	public DeMultiplexerElm(int xa, int ya, int xb, int yb, int f,
			    StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st);
	    try {
		selectBitCount = Integer.parseInt(st.nextToken());
		setupPins();
		allocNodes();
	    } catch (Exception e) {}
	}
	String getChipName() { return "Demultiplexer"; }
	String dump() { return super.dump() + " " + selectBitCount; }

	void dumpXml(Document doc, Element elem) {
	    super.dumpXml(doc, elem);
	    XMLSerializer.dumpAttr(elem, "se", selectBitCount);
	    if (outputMode != 0)
		XMLSerializer.dumpAttr(elem, "om", outputMode);
	    if (dataBusWidth != 4)
		XMLSerializer.dumpAttr(elem, "dw", dataBusWidth);
	}

	void undumpXml(XMLDeserializer xml) {
	    super.undumpXml(xml);
	    selectBitCount = xml.parseIntAttr("se", selectBitCount);
	    outputMode = xml.parseIntAttr("om", 0);
	    dataBusWidth = xml.parseIntAttr("dw", 4);
	    setupPins();
	    allocNodes();
	}

	void setupPins() {
	    if (selectBitCount == 0)
		selectBitCount = 2;
	    outputCount = 1 << selectBitCount;
	    int i, n;

	    if (outputMode == OUTPUT_MODE_BUS_BUS) {
		// bus input / bus outputs mode
		int inputPinCount = dataBusWidth;
		int outputPinCount = outputCount * dataBusWidth;

		sizeX = selectBitCount + 1;
		sizeY = outputCount + 1;
		pins = new Pin[inputPinCount + selectBitCount + outputPinCount];

		// input bus on west side
		inputPin = 0;
		for (i = 0; i < dataBusWidth; i++) {
		    pins[i] = new Pin(0, SIDE_W, "Q");
		    pins[i].busWidth = dataBusWidth;
		    pins[i].busZ = i;
		}

		// select pins on south side
		selectPin = inputPinCount;
		for (i = 0; i < selectBitCount; i++) {
		    n = selectPin + i;
		    if (busSelect()) {
			pins[n] = new Pin(0, SIDE_S, "S");
			pins[n].busWidth = selectBitCount;
			pins[n].busZ = i;
		    } else {
			pins[n] = new Pin(i + 1, SIDE_S, "S" + i);
		    }
		}

		// output bus groups on east side
		outputPin = selectPin + selectBitCount;
		for (int g = 0; g < outputCount; g++) {
		    for (i = 0; i < dataBusWidth; i++) {
			n = outputPin + g * dataBusWidth + i;
			pins[n] = new Pin(g, SIDE_E, "Q" + g);
			pins[n].output = true;
			pins[n].busWidth = dataBusWidth;
			pins[n].busZ = i;
		    }
		}

	    } else if (outputMode == OUTPUT_MODE_BUS_BIT) {
		// single input / bus output (bit distributor)
		sizeX = selectBitCount + 1;
		sizeY = 3;
		pins = new Pin[1 + selectBitCount + outputCount];

		// single input on west side
		inputPin = 0;
		pins[0] = new Pin(0, SIDE_W, "Q");

		// select pins on south side
		selectPin = 1;
		for (i = 0; i < selectBitCount; i++) {
		    n = selectPin + i;
		    if (busSelect()) {
			pins[n] = new Pin(0, SIDE_S, "S");
			pins[n].busWidth = selectBitCount;
			pins[n].busZ = i;
		    } else {
			pins[n] = new Pin(i + 1, SIDE_S, "S" + i);
		    }
		}

		// bus output on east side
		outputPin = selectPin + selectBitCount;
		for (i = 0; i < outputCount; i++) {
		    n = outputPin + i;
		    pins[n] = new Pin(1, SIDE_E, "Q");
		    pins[n].output = true;
		    pins[n].busWidth = outputCount;
		    pins[n].busZ = i;
		}

	    } else {
		// mode 0: single input, individual outputs (original behavior)
		sizeX = 1 + selectBitCount;
		sizeY = 1 + outputCount;
		pins = new Pin[1 + selectBitCount + outputCount];

		// individual output pins on east side
		outputPin = 0;
		for (i = 0; i < outputCount; i++) {
		    pins[i] = new Pin(i, SIDE_E, "Q" + i);
		    pins[i].output = true;
		}

		// select pins on south side
		selectPin = outputCount;
		for (i = 0; i < selectBitCount; i++) {
		    n = selectPin + i;
		    if (busSelect()) {
			pins[n] = new Pin(0, SIDE_S, "S");
			pins[n].busWidth = selectBitCount;
			pins[n].busZ = i;
		    } else {
			pins[n] = new Pin(i, SIDE_S, "S" + i);
		    }
		}

		// single input on west side
		inputPin = outputCount + selectBitCount;
		pins[inputPin] = new Pin(0, SIDE_W, "Q");
	    }

	    allocNodes();
	}

	int getPostCount() {
	    if (outputMode == OUTPUT_MODE_BUS_BUS)
		return dataBusWidth + selectBitCount + outputCount * dataBusWidth;
	    if (outputMode == OUTPUT_MODE_BUS_BIT)
		return 1 + selectBitCount + outputCount;
	    return 1 + selectBitCount + outputCount;
	}

	int getVoltageSourceCount() {
	    if (outputMode == OUTPUT_MODE_BUS_BUS)
		return outputCount * dataBusWidth;
	    return outputCount;
	}

	int readSelectValue() {
	    int sel = 0;
	    for (int i = 0; i < selectBitCount; i++)
		if (pins[selectPin + i].value)
		    sel |= 1 << i;
	    return sel;
	}

	void execute() {
	    int selectedValue = readSelectValue();

	    if (outputMode == OUTPUT_MODE_BUS_BUS) {
		// clear all outputs, then copy input bus to selected output group
		for (int g = 0; g < outputCount; g++)
		    for (int i = 0; i < dataBusWidth; i++)
			pins[outputPin + g * dataBusWidth + i].value = false;
		for (int i = 0; i < dataBusWidth; i++)
		    pins[outputPin + selectedValue * dataBusWidth + i].value = pins[inputPin + i].value;

	    } else if (outputMode == OUTPUT_MODE_BUS_BIT) {
		// clear all output bits, then set selected bit to input value
		for (int i = 0; i < outputCount; i++)
		    pins[outputPin + i].value = false;
		pins[outputPin + selectedValue].value = pins[inputPin].value;

	    } else {
		// mode 0: original behavior
		for (int i = 0; i < outputCount; i++)
		    pins[outputPin + i].value = false;
		pins[outputPin + selectedValue].value = pins[inputPin].value;
	    }
	}

	int getDumpType() { return 185; }
	String getXmlDumpType() { return "dmux"; }

	public EditInfo getChipEditInfo(int n) {
	    if (n == 0)
		return new EditInfo("# of Select Bits", selectBitCount).setDimensionless();
	    if (n == 1) {
		EditInfo ei = new EditInfo("Output Mode", 0, -1, -1);
		ei.choice = new Choice();
		ei.choice.add("Individual Outputs");
		ei.choice.add("Bus Output (Bit Distribute)");
		ei.choice.add("Bus Input/Output");
		ei.choice.select(outputMode);
		return ei;
	    }
	    if (n == 2)
		return EditInfo.createCheckbox("Bus Select", busSelect());
	    if (n == 3 && outputMode == OUTPUT_MODE_BUS_BUS)
		return new EditInfo("Data Bus Width", dataBusWidth, 2, 32).setDimensionless();
	    return null;
	}
	public void setChipEditValue(int n, EditInfo ei) {
	    if (n == 0 && ei.value >= 1 && ei.value <= 6) {
		selectBitCount = (int) ei.value;
		setupPins();
		setPoints();
	    }
	    if (n == 1) {
		outputMode = ei.choice.getSelectedIndex();
		setupPins();
		setPoints();
	    }
	    if (n == 2) {
		flags = ei.changeFlag(flags, FLAG_BUS_SELECT);
		setupPins();
		setPoints();
	    }
	    if (n == 3 && ei.value >= 2) {
		dataBusWidth = (int) ei.value;
		setupPins();
		setPoints();
	    }
	}

    }
