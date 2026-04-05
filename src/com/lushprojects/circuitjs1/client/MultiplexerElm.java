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

    class MultiplexerElm extends ChipElm {
	final int FLAG_INVERTED_OUTPUT = 1<<1;
	final int FLAG_STROBE = 1<<2;
	final int FLAG_BUS_SELECT = 1<<3;

	// inputMode: 0 = individual inputs/single output (original)
	//            1 = bus input/single output (bit selector)
	//            2 = bus input/bus output
	static final int INPUT_MODE_INDIVIDUAL = 0;
	static final int INPUT_MODE_BUS_BIT = 1;
	static final int INPUT_MODE_BUS_BUS = 2;

	int selectBitCount;
	int outputCount;
	int inputMode;
	int dataBusWidth = 4;
	int strobe;
	int outputPin;  // index of first output pin
	int selectPin;  // index of first select pin

	boolean hasReset() {return false;}
	boolean busSelect() { return hasFlag(FLAG_BUS_SELECT); }

	public MultiplexerElm(int xx, int yy) {
	    super(xx, yy);
	    selectBitCount = 2;
	    setupPins();
	}
	public MultiplexerElm(int xa, int ya, int xb, int yb, int f,
			    StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st);
	    selectBitCount = 2;
	    try {
		selectBitCount = Integer.parseInt(st.nextToken());
	    } catch (Exception e) {}
	    setupPins();
	}
	String getChipName() { return "Multiplexer"; }

	void dumpXml(Document doc, Element elem) {
	    super.dumpXml(doc, elem);
	    XMLSerializer.dumpAttr(elem, "se", selectBitCount);
	    if (inputMode != 0)
		XMLSerializer.dumpAttr(elem, "im", inputMode);
	    if (dataBusWidth != 4)
		XMLSerializer.dumpAttr(elem, "dw", dataBusWidth);
	}

	void undumpXml(XMLDeserializer xml) {
	    super.undumpXml(xml);
	    selectBitCount = xml.parseIntAttr("se", selectBitCount);
	    inputMode = xml.parseIntAttr("im", 0);
	    dataBusWidth = xml.parseIntAttr("dw", 4);
	    setupPins();
	}

	void setupPins() {
	    outputCount = 1 << selectBitCount;
	    int i, n;

	    if (inputMode == INPUT_MODE_BUS_BUS) {
		// bus input / bus output mode
		int inputPinCount = outputCount * dataBusWidth;
		int outputPinCount = dataBusWidth;
		int invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? dataBusWidth : 0;
		int strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;

		sizeX = selectBitCount + 1;
		sizeY = outputCount + 1;
		pins = new Pin[inputPinCount + selectBitCount + outputPinCount + invertedCount + strobeCount];

		// input bus groups on west side
		for (int g = 0; g < outputCount; g++) {
		    for (i = 0; i < dataBusWidth; i++) {
			n = g * dataBusWidth + i;
			pins[n] = new Pin(g, SIDE_W, "I" + g);
			pins[n].busWidth = dataBusWidth;
			pins[n].busZ = i;
		    }
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

		// output bus on east side
		outputPin = selectPin + selectBitCount;
		for (i = 0; i < dataBusWidth; i++) {
		    n = outputPin + i;
		    pins[n] = new Pin(0, SIDE_E, "Q");
		    pins[n].output = true;
		    pins[n].busWidth = dataBusWidth;
		    pins[n].busZ = i;
		}

		// inverted output bus
		if (hasFlag(FLAG_INVERTED_OUTPUT)) {
		    for (i = 0; i < dataBusWidth; i++) {
			n = outputPin + dataBusWidth + i;
			pins[n] = new Pin(1, SIDE_E, "Q");
			pins[n].lineOver = true;
			pins[n].output = true;
			pins[n].bubble = (i == 0);
			pins[n].busWidth = dataBusWidth;
			pins[n].busZ = i;
		    }
		}

		// strobe
		if (hasFlag(FLAG_STROBE)) {
		    n = outputPin + dataBusWidth + invertedCount;
		    pins[n] = new Pin(0, SIDE_S, "STR");
		    strobe = n;
		} else
		    strobe = -1;

	    } else if (inputMode == INPUT_MODE_BUS_BIT) {
		// bus input / single output (bit selector)
		sizeX = selectBitCount + 1;
		sizeY = 3;
		int strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;
		int invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? 1 : 0;
		pins = new Pin[outputCount + selectBitCount + 1 + invertedCount + strobeCount];

		// bus input pins: all at same position
		for (i = 0; i < outputCount; i++) {
		    pins[i] = new Pin(0, SIDE_W, "I");
		    pins[i].busWidth = outputCount;
		    pins[i].busZ = i;
		}

		// select pins
		selectPin = outputCount;
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

		// output
		n = selectPin + selectBitCount;
		pins[n] = new Pin(0, SIDE_E, "Q");
		pins[n].output = true;
		outputPin = n;

		if (hasFlag(FLAG_INVERTED_OUTPUT)) {
		    n++;
		    pins[n] = new Pin(1, SIDE_E, "Q");
		    pins[n].lineOver = true;
		    pins[n].output = true;
		    pins[n].bubble = true;
		}
		if (hasFlag(FLAG_STROBE)) {
		    n++;
		    pins[n] = new Pin(0, SIDE_S, "STR");
		    strobe = n;
		} else
		    strobe = -1;

	    } else {
		// mode 0: individual inputs / single output (original behavior)
		sizeX = selectBitCount + 1;
		sizeY = outputCount + 1;
		int strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;
		int invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? 1 : 0;
		pins = new Pin[outputCount + selectBitCount + 1 + invertedCount + strobeCount];

		for (i = 0; i < outputCount; i++)
		    pins[i] = new Pin(i, SIDE_W, "I" + i);

		selectPin = outputCount;
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

		n = selectPin + selectBitCount;
		pins[n] = new Pin(0, SIDE_E, "Q");
		pins[n].output = true;
		outputPin = n;
		if (hasFlag(FLAG_INVERTED_OUTPUT)) {
		    n++;
		    pins[n] = new Pin(1, SIDE_E, "Q");
		    pins[n].lineOver = true;
		    pins[n].output = true;
		    pins[n].bubble = true;
		}
		if (hasFlag(FLAG_STROBE)) {
		    n++;
		    pins[n] = new Pin(0, SIDE_S, "STR");
		    strobe = n;
		} else
		    strobe = -1;
	    }

	    allocNodes();
	}

	int getPostCount() {
	    int invertedCount, strobeCount;
	    if (inputMode == INPUT_MODE_BUS_BUS) {
		invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? dataBusWidth : 0;
		strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;
		return outputCount * dataBusWidth + selectBitCount + dataBusWidth + invertedCount + strobeCount;
	    }
	    invertedCount = hasFlag(FLAG_INVERTED_OUTPUT) ? 1 : 0;
	    strobeCount = hasFlag(FLAG_STROBE) ? 1 : 0;
	    return outputCount + selectBitCount + 1 + invertedCount + strobeCount;
	}

	int getVoltageSourceCount() {
	    if (inputMode == INPUT_MODE_BUS_BUS) {
		int count = dataBusWidth;
		if (hasFlag(FLAG_INVERTED_OUTPUT))
		    count += dataBusWidth;
		return count;
	    }
	    return hasFlag(FLAG_INVERTED_OUTPUT) ? 2 : 1;
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

	    if (inputMode == INPUT_MODE_BUS_BUS) {
		boolean strobed = (strobe != -1 && pins[strobe].value);
		for (int i = 0; i < dataBusWidth; i++) {
		    boolean val = strobed ? false : pins[selectedValue * dataBusWidth + i].value;
		    pins[outputPin + i].value = val;
		}
		if (hasFlag(FLAG_INVERTED_OUTPUT)) {
		    for (int i = 0; i < dataBusWidth; i++)
			pins[outputPin + dataBusWidth + i].value = !pins[outputPin + i].value;
		}
	    } else {
		// mode 0 and 1: same logic — pin[selectedValue] is the right input
		boolean val = pins[selectedValue].value;
		if (strobe != -1 && pins[strobe].value)
		    val = false;
		pins[outputPin].value = val;
		if (hasFlag(FLAG_INVERTED_OUTPUT))
		    pins[outputPin + 1].value = !val;
	    }
	}

	int getDumpType() { return 184; }
	String getXmlDumpType() { return "mux"; }

        public EditInfo getChipEditInfo(int n) {
            if (n == 0)
                return new EditInfo("# of Select Bits", selectBitCount, 1, 8).
                    setDimensionless();
            if (n == 1)
        	return EditInfo.createCheckbox("Inverted Output", hasFlag(FLAG_INVERTED_OUTPUT));
            if (n == 2)
        	return EditInfo.createCheckbox("Strobe Pin", hasFlag(FLAG_STROBE));
            if (n == 3) {
        	EditInfo ei = new EditInfo("Input Mode", 0, -1, -1);
        	ei.choice = new Choice();
        	ei.choice.add("Individual Inputs");
        	ei.choice.add("Bus Input (Bit Select)");
        	ei.choice.add("Bus Input/Output");
        	ei.choice.select(inputMode);
        	return ei;
            }
            if (n == 4)
        	return EditInfo.createCheckbox("Bus Select", busSelect());
            if (n == 5 && inputMode == INPUT_MODE_BUS_BUS)
        	return new EditInfo("Data Bus Width", dataBusWidth, 2, 32).setDimensionless();
            return null;
        }

        public void setChipEditValue(int n, EditInfo ei) {
            if (n == 0) {
                if (ei.value >= 1 && ei.value <= 6) {
                    selectBitCount = (int) ei.value;
                    setupPins();
                    setPoints();
                } else
                    ei.setError("must be between 1 and 6");
                return;
            }
            if (n == 1) {
        	flags = ei.changeFlag(flags, FLAG_INVERTED_OUTPUT);
                setupPins();
                setPoints();
                return;
            }
            if (n == 2) {
        	flags = ei.changeFlag(flags, FLAG_STROBE);
                setupPins();
                setPoints();
                return;
            }
            if (n == 3) {
        	inputMode = ei.choice.getSelectedIndex();
        	setupPins();
        	setPoints();
        	return;
            }
            if (n == 4) {
        	flags = ei.changeFlag(flags, FLAG_BUS_SELECT);
        	setupPins();
        	setPoints();
        	return;
            }
            if (n == 5) {
        	if (ei.value >= 2) {
        	    dataBusWidth = (int) ei.value;
        	    setupPins();
        	    setPoints();
        	} else
        	    ei.setError("must be >= 2");
        	return;
            }
        }

    }
