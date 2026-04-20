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

    class InductorElm extends CircuitElm {
	Inductor ind;
	double inductance;
	double initialCurrent;
	double saturationCurrent; // 0 = disabled (linear)
	double coerciveCurrent;   // 0 = hysteresis disabled
	double reversibility;     // JA c, 0..1
	public InductorElm(int xx, int yy) {
	    super(xx, yy);
	    ind = new Inductor(sim);
	    inductance = 1;
	    reversibility = 0.1;
	    ind.setup(inductance, current, flags, saturationCurrent, coerciveCurrent, reversibility);
	}
	public InductorElm(int xa, int ya, int xb, int yb, int f,
		    StringTokenizer st) {
	    super(xa, ya, xb, yb, f);
	    ind = new Inductor(sim);
	    reversibility = 0.1;
	    inductance = new Double(st.nextToken()).doubleValue();
	    current = new Double(st.nextToken()).doubleValue();
	    try {
		initialCurrent = new Double(st.nextToken()).doubleValue();
		saturationCurrent = new Double(st.nextToken()).doubleValue();
		coerciveCurrent = new Double(st.nextToken()).doubleValue();
		reversibility = new Double(st.nextToken()).doubleValue();
	    } catch (Exception e) {}
	    ind.setup(inductance, current, flags, saturationCurrent, coerciveCurrent, reversibility);
	}
	int getDumpType() { return 'l'; }
	String dump() {
	    return super.dump() + " " + inductance + " " + current + " " + initialCurrent + " " + saturationCurrent
		+ " " + coerciveCurrent + " " + reversibility;
	}

        void dumpXml(Document doc, Element elem) {
            super.dumpXml(doc, elem);
            XMLSerializer.dumpAttr(elem, "l", inductance);
            XMLSerializer.dumpAttr(elem, "ic", initialCurrent);
            if (saturationCurrent != 0)
                XMLSerializer.dumpAttr(elem, "isat", saturationCurrent);
            if (coerciveCurrent != 0) {
                XMLSerializer.dumpAttr(elem, "ich", coerciveCurrent);
                XMLSerializer.dumpAttr(elem, "hrev", reversibility);
            }
        }

        void dumpXmlState(Document doc, Element elem) {
            XMLSerializer.dumpAttr(elem, "i", current);
        }

        void undumpXml(XMLDeserializer xml) {
            super.undumpXml(xml);
            inductance = xml.parseDoubleAttr("l", inductance);
            initialCurrent = xml.parseDoubleAttr("ic", initialCurrent);
            current = xml.parseDoubleAttr("i", current);
            saturationCurrent = xml.parseDoubleAttr("isat", 0);
            coerciveCurrent = xml.parseDoubleAttr("ich", 0);
            reversibility = xml.parseDoubleAttr("hrev", 0.1);
	    ind.setup(inductance, current, flags, saturationCurrent, coerciveCurrent, reversibility);
        }

	void setPoints() {
	    super.setPoints();
	    calcLeads(32);
	}
	void draw(Graphics g) {
	    double v1 = volts[0];
	    double v2 = volts[1];
	    int i;
	    int hs = 8;
	    setBbox(point1, point2, hs);
	    draw2Leads(g);
	    setPowerColor(g, false);
	    drawCoil(g, 8, lead1, lead2, v1, v2);
	    if (showValues()) {
		String s = getShortUnitText(inductance, "H");
		drawValues(g, s, hs);
	    }
	    doDots(g);
	    drawPosts(g);
	}
	void reset() {
	    volts[0] = volts[1] = curcount = 0;
	    current = initialCurrent;
	    ind.resetTo(initialCurrent);
	}
	void stamp() { ind.stamp(nodes[0], nodes[1]); }
	void startIteration() {
	    ind.startIteration(volts[0]-volts[1]);
	}
	boolean nonLinear() { return ind.nonLinear(); }
	void calculateCurrent() {
	    double voltdiff = volts[0]-volts[1];
	    current = ind.calculateCurrent(voltdiff);
	}
	void doStep() {
	    double voltdiff = volts[0]-volts[1];
	    ind.doStep(voltdiff);
	}
	void getInfo(String arr[]) {
	    if (ind.hasHysteresis())
		arr[0] = "inductor (hyst)";
	    else if (saturationCurrent > 0)
		arr[0] = "inductor (sat)";
	    else
		arr[0] = "inductor";
	    getBasicInfo(arr);
	    arr[3] = "L = " + getUnitText(inductance, "H");
	    arr[4] = "P = " + getUnitText(getPower(), "W");
	    int row = 5;
	    if (saturationCurrent > 0 && !ind.hasHysteresis()) {
		double lEff = ind.calcEffectiveInductance(current);
		arr[row++] = "Leff = " + getUnitText(lEff, "H");
		arr[row++] = "Isat = " + getUnitText(saturationCurrent, "A");
	    }
	    if (ind.hasHysteresis() && row < arr.length) {
		arr[row++] = "Leff = " + getUnitText(ind.calcEffectiveInductance(current), "H");
		if (row < arr.length)
		    arr[row++] = "Ic = " + getUnitText(coerciveCurrent, "A")
			+ ", M = " + showFormat.format(ind.getMagnetization());
	    }
	}
	public EditInfo getEditInfo(int n) {
	    if (n == 0)
		return new EditInfo("Inductance (H)", inductance, 1e-2, 10);
	    if (n == 1) {
		EditInfo ei = new EditInfo("", 0, -1, -1);
		ei.checkbox = new Checkbox("Trapezoidal Approximation",
					   ind.isTrapezoidal());
		return ei;
	    }
            if (n == 2)
                return new EditInfo("Initial Current (on Reset) (A)", initialCurrent);
	    if (n == 3)
		return new EditInfo("Saturation Current (A) (0=none)", saturationCurrent);
	    if (n == 4)
		return new EditInfo("Coercive Current (A) (0=no hysteresis)", coerciveCurrent);
	    if (n == 5)
		return new EditInfo("Hysteresis Reversibility (0-1)", reversibility);
	    return null;
	}

	public void setEditValue(int n, EditInfo ei) {
	    if (n == 0 && ei.value > 0)
		inductance = ei.value;
	    if (n == 1) {
		if (ei.checkbox.getState())
		    flags &= ~Inductor.FLAG_BACK_EULER;
		else
		    flags |= Inductor.FLAG_BACK_EULER;
	    }
            if (n == 2)
                initialCurrent = ei.value;
	    if (n == 3 && ei.value >= 0)
		saturationCurrent = ei.value;
	    if (n == 4 && ei.value >= 0)
		coerciveCurrent = ei.value;
	    if (n == 5) {
		if (ei.value < 0) ei.value = 0;
		if (ei.value > 1) ei.value = 1;
		reversibility = ei.value;
	    }
	    ind.setup(inductance, current, flags, saturationCurrent, coerciveCurrent, reversibility);
	}

	int getShortcut() { return 'L'; }
	public double getInductance() { return inductance; }
	void setInductance(double l) {
	    inductance = l;
	    ind.setup(inductance, current, flags, saturationCurrent, coerciveCurrent, reversibility);
	}
	void setSaturationCurrent(double isat) {
	    saturationCurrent = isat;
	    ind.setup(inductance, current, flags, saturationCurrent, coerciveCurrent, reversibility);
	}
	double getSaturationCurrent() { return saturationCurrent; }
    }
