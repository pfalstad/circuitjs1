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

import java.util.HashMap;

import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.TextArea;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;

    class SRAMElm extends ChipElm {
	static final int FLAG_HEX_DISPLAY = 4;
	int addressNodes, dataNodes, internalNodes;
	int addressBits, dataBits;
	HashMap<Integer, Integer> map;
	static String contentsOverride = null;
	TextArea editTextArea;


	public SRAMElm(int xx, int yy) {
	    super(xx, yy);
	    addressBits = dataBits = 4;
	    map = new HashMap<Integer, Integer>();
	    setupPins();
	}

	public SRAMElm(int xa, int ya, int xb, int yb, int f,
			    StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st);
	    map = new HashMap<Integer, Integer>();
	    addressBits = Integer.parseInt(st.nextToken());
	    dataBits    = Integer.parseInt(st.nextToken());
	    setupPins();
	    try {
		// load contents
		// format: addr val(addr) val(addr+1) val(addr+2) ... -1 addr val val ... -1 ... -2
		while (true) {
		    int a = Integer.parseInt(st.nextToken());
		    if (a < 0)
			break;
		    int v = Integer.parseInt(st.nextToken());
		    map.put(a, v);
		    while (true) {
			v = Integer.parseInt(st.nextToken());
			if (v < 0)
			    break;
			map.put(++a, v);
		    }
		}
	    } catch (Exception e) {}
	}

	void dumpXml(Document doc, Element elem) {
	    super.dumpXml(doc, elem);
	    XMLSerializer.dumpAttr(elem, "ab", addressBits);
	    XMLSerializer.dumpAttr(elem, "db", dataBits);
	}
	void dumpXmlState(Document doc, Element elem) {
	    super.dumpXmlState(doc, elem);
	    if (!map.isEmpty())
		elem.appendChild(doc.createTextNode(contentsToString()));
	}
	void undumpXml(XMLDeserializer xml) {
	    super.undumpXml(xml);
	    addressBits = xml.parseIntAttr("ab", addressBits);
	    dataBits = xml.parseIntAttr("db", dataBits);
	    map = new java.util.HashMap<Integer, Integer>();
	    try {
		parseContentsString(xml.parseContents());
	    } catch (Exception e) {}
	    setupPins();
	}

	boolean nonLinear() { return true; }
	boolean allowBus() { return true; }
	String getChipName() { return "Static RAM"; }
	void setupPins() {
	    sizeX = 2;
	    int addrY = useBus() ? 1 : addressBits;
	    int dataY = useBus() ? 1 : dataBits;
	    sizeY = max(addrY, dataY) + 1;
	    bits = addressBits;
	    pins = new Pin[getPostCount()];
	    pins[0] = new Pin(0, SIDE_W, "WE");
	    pins[0].lineOver = true;
	    pins[1] = new Pin(0, SIDE_E, "OE");
	    pins[1].lineOver = true;
	    addressNodes = 2;
	    dataNodes = 2+addressBits;
	    internalNodes = 2+addressBits+dataBits;
	    makeBitPins(addressBits, sizeY-addrY, SIDE_W, addressNodes, "A", false, false, true);
	    makeBitPins(dataBits, sizeY-dataY, SIDE_E, dataNodes, "D", true, false, true);
	    allocNodes();
	}
	int getPostCount() {
	    return 2 + addressBits + dataBits;
	}
	public EditInfo getChipEditInfo(int n) {
            if (n == 0)
                return new EditInfo("# of Address Bits", addressBits, 1, 1).setDimensionless();
            if (n == 1)
                return new EditInfo("# of Data Bits", dataBits, 1, 1).setDimensionless();
            if (n == 2) {
        	EditInfo ei = new EditInfo("Contents", 0);
        	ei.textArea = new TextArea();
        	editTextArea = ei.textArea;
        	ei.textArea.setVisibleLines(5);
        	String s = (contentsOverride != null) ? contentsOverride : contentsToString();
        	contentsOverride = null;
    	    	ei.textArea.setText(s);
    	    	return ei;
            }
            if (n == 3) {
            	EditInfo ei = new EditInfo("", 0, -1, -1);
            	ei.checkbox = new Checkbox("Hex Display", hasFlag(FLAG_HEX_DISPLAY));
            	return ei;
            }
            if (n == 4 && SRAMLoadFile.isSupported()) {
            	EditInfo ei = new EditInfo("", 0, -1, -1);
            	ei.loadFile = new SRAMLoadFile();
            	ei.button = new Button("Load Contents From File");
            	ei.newDialog = true;
            	return ei;
            }
	    return super.getChipEditInfo(n);
	}
	
	String contentsToString() {
	    boolean hex = hasFlag(FLAG_HEX_DISPLAY);
	    String s = "";
	    int maxI = 1<<addressBits;
	    for (int i = 0; i < maxI; i++) {
		Integer val = map.get(i);
		if (val == null)
		    continue;
		s += (hex ? Integer.toHexString(i).toUpperCase() : "" + i) + ": " +
		     (hex ? toHex(val) : "" + val);
		int ct = 1;
		while (true) {
		    val = map.get(++i);
		    if (val == null)
			break;
		    s += " " + (hex ? toHex(val) : "" + val);
		    if (++ct == 8)
			break;
		}
		s += "\n";
	    }
	    return s;
	}

	String toHex(int val) {
	    int mask = (1<<dataBits)-1;
	    String h = Integer.toHexString(val & mask).toUpperCase();
	    return h.length() < 2 ? "0" + h : h;
	}

	void parseContentsString(String s) {
	    map.clear();
	    String lines[] = s.split("\n");
	    for (int i = 0; i != lines.length; i++) {
		try {
		    String line = lines[i];
		    String args[] = line.split(": *");
		    int addr = parseNumber(args[0]);
		    String vals[] = args[1].split(" +");
		    for (int j = 0; j != vals.length; j++) {
			int val = parseNumber(vals[j]);
			map.put(addr++, val);
		    }
		} catch (Exception e) {}
	    }
	}

	int parseNumber(String str) {
	    if (str.startsWith("0x"))
		return Integer.parseInt(str.substring(2), 16);
	    if (str.startsWith("0b"))
		return Integer.parseInt(str.substring(2), 2);
	    if (hasFlag(FLAG_HEX_DISPLAY))
		return Integer.parseInt(str, 16);
	    return Integer.parseInt(str);
	}

	public void setChipEditValue(int n, EditInfo ei) {
	    if (n == 0) {
		if (ei.value >= 2 && ei.value <= 16) {
		    addressBits = (int)ei.value;
		    setupPins();
		    setPoints();
		} else
		    ei.setError("must be between 2 and 16");
	    }
	    if (n == 1) {
		if (ei.value >= 2 && ei.value <= 16) {
		    dataBits = (int)ei.value;
		    setupPins();
		    setPoints();
		} else
		    ei.setError("must be between 2 and 16");
	    }
	    if (n == 2)
		parseContentsString(ei.textArea.getText());
	    if (n == 3) {
		int oldFlags = flags;
		if (editTextArea != null)
		    parseContentsString(editTextArea.getText());
		flags = ei.changeFlag(flags, FLAG_HEX_DISPLAY);
		if (flags != oldFlags) {
		    contentsOverride = contentsToString();
		    ei.newDialog = true;
		}
	    }
	}
	int getVoltageSourceCount() { return dataBits; }
	int getInternalNodeCount() { return dataBits; }
	void setVoltageSource(int j, VoltageSource vs) {
	    super.setVoltageSource(j, vs);
	    vs.setNodes(CircuitNode.ground, nodes[internalNodes+j]);
	}
	boolean getMatrixConnection(int n1, int n2) {
	    // each internal node connects to its corresponding data pin
	    for (int i = 0; i != dataBits; i++)
		if (comparePair(n1, n2, internalNodes+i, dataNodes+i))
		    return true;
	    return false;
	}

	int address;
	
	void stamp() {
	    int i;
	    for (i = 0; i != dataBits; i++) {
		Pin p = pins[i+dataNodes];
		sim.stampVoltageSource(CircuitNode.ground, nodes[internalNodes+i], p.voltSource);
		sim.stampNonLinear(nodes[internalNodes+i]);
		sim.stampNonLinear(nodes[dataNodes+i]);
	    }
	}
	
	void doStep() {
	    int i;
	    boolean writeEnabled = volts[0] < getThreshold();
	    boolean outputEnabled = (volts[1] < getThreshold()) && !writeEnabled;
	    
	    // get address
	    address = 0;
	    for (i = 0; i != addressBits; i++) {
		address |= (volts[addressNodes+i] > getThreshold()) ? 1<<(addressBits-1-i) : 0;
	    }
	    
	    Integer dataObj = map.get(address);
	    int data = (dataObj == null) ? 0 : dataObj;
	    for (i = 0; i != dataBits; i++) {
		Pin p = pins[i+dataNodes];
		sim.updateVoltageSource(CircuitNode.ground, nodes[internalNodes+i], p.voltSource, (data & (1<<(dataBits-1-i))) == 0 ? 0 : highVoltage);
		
		// if output enabled, stamp a small resistor from internal voltage source to data pin.
		// if output disabled, stamp a large pulldown resistor from data pin to ground.
		if (outputEnabled)
		    sim.stampResistor(nodes[internalNodes + i], nodes[dataNodes + i], 1);
		else
		    sim.stampResistor(nodes[dataNodes + i], CircuitNode.ground, 1e8);
	    }
	}
	
	void stepFinished() {
	    int i;
	    int data = 0;
	    boolean writeEnabled = volts[0] < getThreshold();
	    if (!writeEnabled)
		return;
	    
	    // store data in RAM
	    for (i = 0; i != dataBits; i++) {
		data |= (volts[dataNodes+i] > getThreshold()) ? 1<<(dataBits-1-i) : 0;
	    }
	    map.put(address, data);	    
	}
	int getDumpType() { return 413; }
    }
