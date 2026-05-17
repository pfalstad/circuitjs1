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
	double currentValue;
	// Compliance voltage. 0 = unlimited (ideal current source).
	double maxVoltage;
	double lastVoltDiff;
	boolean broken;
	public CurrentElm(int xx, int yy) {
	    super(xx, yy);
	    currentValue = .01;
	    maxVoltage = 0;
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
	boolean isVoltageLimited() { return maxVoltage > 0; }
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
	    if (maxVoltage > 0)
		XMLSerializer.dumpAttr(elem, "mv", maxVoltage);
	}

	void undumpXml(XMLDeserializer xml) {
	    super.undumpXml(xml);
	    currentValue = xml.parseDoubleAttr("cu", currentValue);
	    maxVoltage = xml.parseDoubleAttr("mv", 0);
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
	    broken = b && !isVoltageLimited();
	}

	// we defer stamping current sources until we can tell if they have a current path or not
	void stamp() {
	    if (broken) {
		// no current path; stamping a current source would cause a matrix error.
		sim.stampResistor(nodes[0], nodes[1], 1e8);
		current = 0;
	    } else if (isVoltageLimited()) {
		// nonlinear; doStep() handles the smooth-saturation companion model
		sim.stampNonLinear(nodes[0]);
		sim.stampNonLinear(nodes[1]);
	    } else {
		// ideal current source
		sim.stampCurrentSource(nodes[0], nodes[1], currentValue);
		current = currentValue;
	    }
	}

	// Smooth voltage compliance via tanh-shaped saturation.
	// Transition starts at 0.95*maxVoltage and ends at maxVoltage:
	//   vd < 0.95*Vmax  ->  i ~= currentValue  (tanh arg ~= -2.5)
	//   vd > Vmax       ->  i ~= 0              (tanh arg ~= +2.5)
	// tanh is centered at 0.975*Vmax with scale vt = vWidth/5.
	void doStep() {
	    if (broken || !isVoltageLimited())
		return;

	    double vd = volts[1] - volts[0];

	    double vStart = 0.95 * maxVoltage;           // transition begins here
	    double vWidth = maxVoltage - vStart;          // = 0.05 * maxVoltage
	    double vMid   = (vStart + maxVoltage) / 2.0; // = 0.975 * maxVoltage
	    double vt     = Math.max(vWidth / 5.0, 1e-3);

	    // Step-size limit: prevent crossing the transition region in one Newton step.
	    if (lastVoltDiff < vStart && vd > vStart) {
		// Approaching transition from low side — stop at entry boundary.
		vd = vStart;
		sim.converged = false;
	    } else if (lastVoltDiff > maxVoltage && vd < maxVoltage) {
		// Approaching transition from high side — stop at exit boundary.
		vd = maxVoltage;
		sim.converged = false;
	    } else if (lastVoltDiff >= vStart && lastVoltDiff <= maxVoltage) {
		// Inside the transition: fine-step so we don't skip out the other side.
		double maxStep = Math.max(vWidth / 4.0, 0.01);
		if (vd > lastVoltDiff + maxStep) {
		    vd = lastVoltDiff + maxStep;
		    sim.converged = false;
		} else if (vd < lastVoltDiff - maxStep) {
		    vd = lastVoltDiff - maxStep;
		    sim.converged = false;
		}
	    }
	    lastVoltDiff = vd;

	    double arg     = (vd - vMid) / vt;
	    double tanhArg = Math.tanh(arg);

	    double i       = currentValue * 0.5 * (1.0 - tanhArg);
	    double sech2   = 1.0 - tanhArg * tanhArg;
	    double g       = -currentValue * 0.5 * sech2 / vt * vd;

	    // Norton companion: parallel resistor (1/|g|) + adjusted current source.
            // Gmin floor keeps the Norton resistance finite when sech^2 is
            // vanishing (well inside or well outside compliance) so the matrix
            // stays non-singular and Newton steps remain bounded.
	    double absG = Math.abs(g) + 1e-6;
	    sim.stampResistor(nodes[0], nodes[1], 1.0 / absG);
	    sim.stampCurrentSource(nodes[0], nodes[1], i - g * vd);
	    //CirSim.console("cursource vd=" + vd + " g=" + g + " i=" + i + " arg=" + arg);
	    current = i;
	}

	public EditInfo getEditInfo(int n) {
	    if (n == 0)
		return new EditInfo("Current (A)", currentValue, 0, .1);
	    if (n == 1)
		return new EditInfo("Max Voltage (V, 0=unlimited)", maxVoltage, 0, 0);
	    return null;
	}
	public void setEditValue(int n, EditInfo ei) {
	    if (n == 0)
		currentValue = ei.value;
	    if (n == 1 && ei.value >= 0)
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
