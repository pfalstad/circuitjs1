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
import com.lushprojects.circuitjs1.client.util.Locale;

    class InductorElm extends CircuitElm {
	Inductor ind;
	double inductance;
	double initialCurrent;
	double saturationCurrent; // 0 = disabled (linear)
	double seriesResistance;
	public InductorElm(int xx, int yy) {
	    super(xx, yy);
	    ind = new Inductor(sim);
	    inductance = 1;
	    seriesResistance = 1;
	    ind.setup(inductance, current, flags, saturationCurrent);
	}
	public InductorElm(int xa, int ya, int xb, int yb, int f,
		    StringTokenizer st) {
	    super(xa, ya, xb, yb, f);
	    ind = new Inductor(sim);
	    inductance = new Double(st.nextToken()).doubleValue();
	    current = new Double(st.nextToken()).doubleValue();
	    try {
		initialCurrent = new Double(st.nextToken()).doubleValue();
		saturationCurrent = new Double(st.nextToken()).doubleValue();
	    } catch (Exception e) {}
	    ind.setup(inductance, current, flags, saturationCurrent);
	    allocNodes();
	}
	int getDumpType() { return 'l'; }

        void dumpXml(Document doc, Element elem) {
            super.dumpXml(doc, elem);
            XMLSerializer.dumpAttr(elem, "l", inductance);
            XMLSerializer.dumpAttr(elem, "ic", initialCurrent);
            if (saturationCurrent != 0)
                XMLSerializer.dumpAttr(elem, "isat", saturationCurrent);
            if (seriesResistance != 0)
                XMLSerializer.dumpAttr(elem, "sr", seriesResistance);
        }

        void dumpXmlState(Document doc, Element elem) {
            XMLSerializer.dumpAttr(elem, "i", current);
        }

        void undumpXml(XMLDeserializer xml) {
            super.undumpXml(xml);
            inductance = xml.parseDoubleAttr("l", inductance);
            initialCurrent = xml.parseDoubleAttr("ic", initialCurrent);
            current = xml.parseDoubleAttr("i", current);
            saturationCurrent = xml.parseDoubleAttr("isat", saturationCurrent);
            seriesResistance = xml.parseDoubleAttr("sr", seriesResistance);
	    ind.setup(inductance, current, flags, saturationCurrent);
	    allocNodes();
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
	    super.reset();
	    current = initialCurrent;
	    ind.resetTo(initialCurrent);
	}
	// The inductor companion model is stamped between nodes 0 and indNode2.
	// For an ideal inductor, indNode2 is node 1.  If a series resistance is
	// set, indNode2 = 2 (an internal node) and a resistor is placed between
	// nodes 2 and 1, modeled on CapacitorElm's seriesResistance handling.
	// This is derived from seriesResistance rather than cached at stamp()
	// time, because calculateCurrent() can run (from setNodeVoltage()) after
	// the resistance is edited but before the circuit is re-stamped.
	int getIndNode2() { return (seriesResistance > 0) ? 2 : 1; }
	void stamp() {
	    ind.stamp(nodes[0], nodes[getIndNode2()]);
	    if (seriesResistance > 0)
		sim.stampResistor(nodes[1], nodes[2], seriesResistance);
	}
	void startIteration() {
	    ind.startIteration(volts[0]-volts[getIndNode2()]);
	}
	boolean nonLinear() { return ind.nonLinear(); }
	void calculateCurrent() {
	    double voltdiff = volts[0]-volts[getIndNode2()];
	    current = ind.calculateCurrent(voltdiff);
	}
	void doStep() {
	    double voltdiff = volts[0]-volts[getIndNode2()];
	    ind.doStep(voltdiff);
	}
	int getInternalNodeCount() { return (seriesResistance > 0) ? 1 : 0; }
	void getInfo(String arr[]) {
	    arr[0] = (saturationCurrent > 0) ? "inductor (sat)" : "inductor";
	    getBasicInfo(arr);
	    arr[3] = "L = " + getUnitText(inductance, "H");
	    arr[4] = "P = " + getUnitText(getPower(), "W");
	    if (saturationCurrent > 0) {
		double lEff = ind.calcEffectiveInductance(current);
		arr[5] = "Leff = " + getUnitText(lEff, "H");
		arr[6] = "Isat = " + getUnitText(saturationCurrent, "A");
	    }
	}

        @Override
        String getScopeText(int v) {
            return Locale.LS("inductor") + ", " + getUnitText(inductance, "H");
        }

	public EditInfo getEditInfo(int n) {
	    if (n == 0)
		return new EditInfo("Inductance (H)", inductance, 1e-2, 10).setPositive();
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
		return new EditInfo("Series Resistance", seriesResistance);
	    return null;
	}

	public void setEditValue(int n, EditInfo ei) {
	    if (n == 0)
		inductance = ei.value;
	    if (n == 1) {
		if (ei.checkbox.getState())
		    flags &= ~Inductor.FLAG_BACK_EULER;
		else
		    flags |= Inductor.FLAG_BACK_EULER;
	    }
            if (n == 2)
                initialCurrent = ei.value;
	    if (n == 3) {
		if (ei.value >= 0)
		    saturationCurrent = ei.value;
		else
		    ei.setError("must be >= 0");
	    }
	    if (n == 4) {
		if (ei.value >= 0) {
		    seriesResistance = ei.value;
		    allocNodes();
		} else
		    ei.setError("must be >= 0");
	    }
	    ind.setup(inductance, current, flags, saturationCurrent);
	}

	int getShortcut() { return 'L'; }
	public double getInductance() { return inductance; }
	void setInductance(double l) {
	    inductance = l;
	    ind.setup(inductance, current, flags, saturationCurrent);
	}
	void setSaturationCurrent(double isat) {
	    saturationCurrent = isat;
	    ind.setup(inductance, current, flags, saturationCurrent);
	}
	double getSaturationCurrent() { return saturationCurrent; }
	public double getSeriesResistance() { return seriesResistance; }
	public void setSeriesResistance(double r) {
	    seriesResistance = r;
	    allocNodes();
	}
	public boolean isIdealInductor() { return (seriesResistance == 0); }
	boolean validate() {
	    FindPathInfo fpi = new FindPathInfo(FindPathInfo.INDUCT, this, getNode(1), sim);
	    if (!fpi.findPath(getNode(0)))
		reset();
	    return true;
	}
    }
