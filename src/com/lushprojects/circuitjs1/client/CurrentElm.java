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

class CurrentElm extends CircuitElm {
	static final int FLAG_VOLTAGE_LIMIT = 1;
	double currentValue;
	double maxVoltage = 1e8;
	double lastVoltDiff;
	boolean broken;
	public CurrentElm(int xx, int yy) {
	    super(xx, yy);
	    currentValue = .01;
	}
	public CurrentElm(int xa, int ya, int xb, int yb, int f,
		   StringTokenizer st) {
	    super(xa, ya, xb, yb, f);
	    try {
		currentValue = new Double(st.nextToken()).doubleValue();
		maxVoltage = new Double(st.nextToken()).doubleValue();
	    } catch (Exception e) {}
	    if (currentValue == 0)
		currentValue = .01;
	}
	boolean isVoltageLimited() { return (flags & FLAG_VOLTAGE_LIMIT) != 0; }
	boolean nonLinear() { return isVoltageLimited(); }
	void reset() {
	    super.reset();
	    lastVoltDiff = 0;
	}
	String dump() {
	    return super.dump() + " " + currentValue + " " + maxVoltage;
	}

	void dumpXml(Document doc, Element elem) {
	    super.dumpXml(doc, elem);
	    XMLSerializer.dumpAttr(elem, "cu", currentValue);
	    if (isVoltageLimited())
		XMLSerializer.dumpAttr(elem, "mv", maxVoltage);
	}

	void undumpXml(XMLDeserializer xml) {
	    super.undumpXml(xml);
	    currentValue = xml.parseDoubleAttr("cu", currentValue);
	    maxVoltage = xml.parseDoubleAttr("mv", maxVoltage);
	}
	int getDumpType() { return 'i'; }
	
	Polygon arrow;
	Point ashaft1, ashaft2, center;
	void setPoints() {
	    super.setPoints();
	    calcLeads(26);
	    ashaft1 = interpPoint(lead1, lead2, .25);
	    ashaft2 = interpPoint(lead1, lead2, .6);
	    center = interpPoint(lead1, lead2, .5);
	    Point p2 = interpPoint(lead1, lead2, .75);
	    arrow = calcArrow(center, p2, 4, 4);
	}
	void draw(Graphics g) {
	    int cr = 12;
	    draw2Leads(g);
	    setVoltageColor(g, (volts[0]+volts[1])/2);
	    setPowerColor(g, false);
	    
	    drawThickCircle(g, center.x, center.y, cr);
	    drawThickLine(g, ashaft1, ashaft2);

	    g.fillPolygon(arrow);
	    setBbox(point1, point2, cr);
	    doDots(g);
	    if (showValues() && current != 0) {
		String s = getShortUnitText(current, "A");
		if (dx == 0 || dy == 0)
		    drawValues(g, s, cr);
	    }
	    drawPosts(g);
	}
	
	// analyzeCircuit determines if current source has a path or if it's broken
	void setBroken(boolean b) {
	    broken = b;
	}
	
	// we defer stamping current sources until we can tell if they have a current path or not
	void stamp() {
	    if (broken) {
		// no current path; stamping a current source would cause a matrix error.
		sim.stampResistor(nodes[0], nodes[1], 1e8);
		current = 0;
	    } else if (isVoltageLimited()) {
		// voltage-limited mode: stamp as nonlinear, doStep() will handle it
		sim.stampNonLinear(nodes[0]);
		sim.stampNonLinear(nodes[1]);
	    } else {
		// ok to stamp a current source
		sim.stampCurrentSource(nodes[0], nodes[1], currentValue);
		current = currentValue;
	    }
	}

	void doStep() {
	    if (!isVoltageLimited() || broken)
		return;
	    double vd = volts[1] - volts[0];
	    if (Math.abs(lastVoltDiff - vd) > .01)
		sim.converged = false;
	    lastVoltDiff = vd;

	    double absVd = Math.abs(vd);
	    if (absVd <= maxVoltage) {
		// within compliance: act as ideal current source
		sim.stampResistor(nodes[0], nodes[1], 1e8);
		sim.stampCurrentSource(nodes[0], nodes[1], currentValue);
		current = currentValue;
	    } else {
		// beyond compliance: act as high-impedance (open circuit)
		sim.stampResistor(nodes[0], nodes[1], 1e8);
		current = vd / 1e8;
	    }
	}
	
	public EditInfo getEditInfo(int n) {
	    if (n == 0)
		return new EditInfo("Current (A)", currentValue, 0, .1);
	    if (n == 1) {
		EditInfo ei = new EditInfo("", 0, -1, -1);
		ei.checkbox = new Checkbox("Voltage Limited",
		    isVoltageLimited());
		return ei;
	    }
	    if (n == 2 && isVoltageLimited())
		return new EditInfo("Max Voltage (V)", maxVoltage, 0, 0);
	    return null;
	}
	public void setEditValue(int n, EditInfo ei) {
	    if (n == 0)
		currentValue = ei.value;
	    if (n == 1) {
		flags = ei.changeFlag(flags, FLAG_VOLTAGE_LIMIT);
		ei.newDialog = true;
	    }
	    if (n == 2 && ei.value > 0)
		maxVoltage = ei.value;
	}
	void getInfo(String arr[]) {
	    arr[0] = "current source";
	    int i = getBasicInfo(arr);
            arr[i++] = "P = " + getUnitText(getPower(), "W");
	    if (isVoltageLimited())
		arr[i++] = "Vmax = " + getVoltageText(maxVoltage);
	}
	double getVoltageDiff() {
	    return volts[1] - volts[0];
	}
	double getPower() { return -getVoltageDiff()*current; }
    }
