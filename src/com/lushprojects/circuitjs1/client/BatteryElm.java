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

import java.util.Vector;

import com.google.gwt.user.client.ui.TextArea;
import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.Document;
import com.lushprojects.circuitjs1.client.util.Locale;

// Battery model: drawn like a DC voltage source, but internally modeled as
//   (-) terminal -- Vsrc -- nodeA -- R0 -- nodeB -- (R1 parallel C1) -- (+) terminal
// Vsrc's voltage is derived from the state of charge (SOC) via a configurable
// table.  SOC is tracked over time by coulomb counting the terminal current.
class BatteryElm extends CircuitElm {
    static final int FLAG_SHOW_VOLTAGE = 1;
    static final int FLAG_SHOW_SOC = 2;

    // BT_CUSTOM is -1 (not an index into batteryTypeNames/batteryTypeTables) so that
    // new preset types can be appended below without renumbering it.
    static final int BT_ALKALINE = 0;
    static final int BT_LITHIUM = 1;
    static final int BT_NIMH = 2;
    static final int BT_NICD = 3;
    static final int BT_LEAD_ACID = 4;
    static final int BT_CUSTOM = -1;
    static final String[] batteryTypeNames = { "Alkaline 1.5V", "Lithium-Ion", "NiMH 1.2V", "NiCd 1.2V", "Lead-Acid" };
    static final String[] batteryTypeTables = {
	"0=0.8\n10=0.95\n20=1.05\n40=1.18\n60=1.28\n80=1.38\n90=1.43\n100=1.55\n",           // alkaline
	"0=3.00\n5=3.30\n10=3.45\n20=3.55\n30=3.62\n40=3.68\n50=3.73\n60=3.79\n70=3.87\n80=3.97\n90=4.08\n95=4.15\n100=4.20\n", // lithium-ion
	"0=1.00\n10=1.15\n20=1.20\n50=1.25\n80=1.30\n90=1.33\n100=1.40\n",                  // NiMH
	"0=1.00\n10=1.15\n20=1.20\n50=1.22\n80=1.25\n90=1.28\n100=1.35\n",                  // NiCd
	"0=1.75\n10=1.90\n20=1.95\n50=2.05\n80=2.10\n90=2.12\n100=2.15\n",                  // lead-acid
    };

    int batteryType;
    double r0, r1, c1;
    double capacityAh;
    double initialSoc;    // 0 to 1, used when resetting
    double soc;           // 0 to 1, current state of charge

    // internal node indices: nodes[0] = (-) terminal, nodes[1] = (+) terminal,
    // nodes[2] = node between Vsrc and R0, nodes[3] = node between R0 and R1/C1
    double compResistance, capVoltDiff, capCurrent, curSourceValue;

    String socVoltageTable;
    Vector<double[]> socTable; // each entry is {socPercent, voltage}, sorted ascending

    public BatteryElm(int xx, int yy) {
	super(xx, yy);
	r0 = .01;
	r1 = .02;
	c1 = 2000;
	capacityAh = 2;
	initialSoc = 1;
	flags |= FLAG_SHOW_VOLTAGE | FLAG_SHOW_SOC;
	batteryType = BT_LITHIUM;
	socVoltageTable = batteryTypeTables[batteryType];
	parseSocTable(null);
	reset();
    }

    int getInternalNodeCount() { return 2; }
    int getVoltageSourceCount() { return 1; }
    boolean getDragVertical(boolean requestedVertical) { return true; }

    // point 2, not point 1, should track the mouse during toolbar drag-and-drop
    void dragPlace(int xa, int ya, boolean vertical) {
	super.dragPlace(xa, ya, vertical);
	swapDragEndpoints();
    }

    void dumpXml(Document doc, Element elem) {
	super.dumpXml(doc, elem);
	XMLSerializer.dumpAttr(elem, "r0", r0);
	XMLSerializer.dumpAttr(elem, "r1", r1);
	XMLSerializer.dumpAttr(elem, "c1", c1);
	XMLSerializer.dumpAttr(elem, "cap", capacityAh);
	XMLSerializer.dumpAttr(elem, "isoc", initialSoc);
	XMLSerializer.dumpAttr(elem, "bt", batteryType);
	if (batteryType == BT_CUSTOM && socVoltageTable != null && socVoltageTable.length() > 0)
	    elem.appendChild(doc.createTextNode(socVoltageTable));
    }

    void dumpXmlState(Document doc, Element elem) {
	XMLSerializer.dumpAttr(elem, "soc", soc);
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	r0 = xml.parseDoubleAttr("r0", .01);
	r1 = xml.parseDoubleAttr("r1", .02);
	c1 = xml.parseDoubleAttr("c1", 2000);
	capacityAh = xml.parseDoubleAttr("cap", 2);
	initialSoc = clampSoc(xml.parseDoubleAttr("isoc", 1));
	// soc itself isn't lower-clamped (over-discharge is modeled), only capped at 100%
	soc = Math.min(1, xml.parseDoubleAttr("soc", initialSoc));
	batteryType = xml.parseIntAttr("bt", BT_LITHIUM);
	if (batteryType == BT_CUSTOM) {
	    socVoltageTable = "";
	    try {
		socVoltageTable = xml.parseContents();
	    } catch (Exception e) {
		CirSim.console("exception in undump " + e);
	    }
	    if (socVoltageTable == null || socVoltageTable.length() == 0)
		socVoltageTable = batteryTypeTables[BT_LITHIUM];
	} else
	    socVoltageTable = (batteryType >= 0 && batteryType < batteryTypeTables.length) ?
		batteryTypeTables[batteryType] : batteryTypeTables[BT_LITHIUM];
	parseSocTable(null);
    }

    void reset() {
	soc = clampSoc(initialSoc);
	capVoltDiff = capCurrent = curSourceValue = 0;
	curcount = 0;
    }

    static double clampSoc(double s) {
	if (s < 0)
	    return 0;
	if (s > 1)
	    return 1;
	return s;
    }

    void parseSocTable(EditInfo ei) {
	socTable = new Vector<double[]>();
	if (socVoltageTable == null || socVoltageTable.length() == 0)
	    return;
	String lines[] = socVoltageTable.split("\n");
	for (int i = 0; i != lines.length; i++) {
	    String line = lines[i].trim();
	    if (line.length() == 0)
		continue;
	    int eq = line.indexOf('=');
	    if (eq < 0) {
		if (ei != null)
		    ei.setError("missing =: " + line);
		continue;
	    }
	    try {
		double socPct = Double.parseDouble(line.substring(0, eq).trim());
		double v = Double.parseDouble(line.substring(eq + 1).trim());
		socTable.add(new double[] { socPct, v });
	    } catch (Exception e) {
		if (ei != null)
		    ei.setError("bad line: " + line);
	    }
	}
	// insertion sort by SOC percent (tables are tiny, simplicity over speed)
	for (int i = 1; i < socTable.size(); i++) {
	    double[] cur = socTable.get(i);
	    int j = i - 1;
	    while (j >= 0 && socTable.get(j)[0] > cur[0]) {
		socTable.set(j + 1, socTable.get(j));
		j--;
	    }
	    socTable.set(j + 1, cur);
	}
    }

    double getVoltageForSoc(double socFrac) {
	double socPct = socFrac * 100;
	if (socPct < 0) {
	    // over-discharged: extrapolate linearly using the slope between 0% and 10%
	    double v0 = interpSocTable(0);
	    double v10 = interpSocTable(10);
	    double slope = (v10 - v0) / 10; // volts per percent SOC
	    return v0 + slope * 3 * socPct;
	}
	return interpSocTable(socPct);
    }

    double interpSocTable(double socPct) {
	if (socTable == null || socTable.size() == 0)
	    return 3.7;
	if (socTable.size() == 1)
	    return socTable.get(0)[1];
	if (socPct <= socTable.get(0)[0])
	    return socTable.get(0)[1];
	int n = socTable.size();
	if (socPct >= socTable.get(n - 1)[0])
	    return socTable.get(n - 1)[1];
	for (int i = 0; i < n - 1; i++) {
	    double[] a = socTable.get(i);
	    double[] b = socTable.get(i + 1);
	    if (socPct >= a[0] && socPct <= b[0]) {
		if (b[0] == a[0])
		    return a[1];
		double frac = (socPct - a[0]) / (b[0] - a[0]);
		return a[1] + frac * (b[1] - a[1]);
	    }
	}
	return socTable.get(n - 1)[1];
    }

    void setVoltageSource(int n, VoltageSource v) {
	super.setVoltageSource(n, v);
	v.setNodes(nodes[0], nodes[2]);
    }

    void stamp() {
	sim.stampVoltageSource(nodes[0], nodes[2], voltSource);
	sim.stampResistor(nodes[2], nodes[3], r0);
	sim.stampResistor(nodes[3], nodes[1], r1);

	if (doDcAnalysis()) {
	    // when finding DC operating point, replace cap with a 100M resistor
	    compResistance = 1e8;
	} else {
	    // trapezoidal capacitor companion model (Norton equivalent):
	    // resistor in parallel with a current source, between nodes[3] and nodes[1]
	    compResistance = sim.timeStep / (2 * c1);
	}
	sim.stampResistor(nodes[3], nodes[1], compResistance);
	sim.stampRightSide(nodes[3]);
	sim.stampRightSide(nodes[1]);
    }

    void startIteration() {
	if (doDcAnalysis())
	    curSourceValue = 0;
	else
	    curSourceValue = -capVoltDiff / compResistance - capCurrent;
    }

    void doStep() {
	sim.updateVoltageSource(nodes[0], nodes[2], voltSource, getVoltageForSoc(soc));
	sim.stampCurrentSource(nodes[3], nodes[1], curSourceValue);
    }

    void stepFinished() {
	capVoltDiff = volts[3] - volts[1];
	if (compResistance > 0)
	    capCurrent = capVoltDiff / compResistance + curSourceValue;

	// coulomb counting: "current" (set from the internal voltage source's solved
	// current) is positive when the battery is discharging, per CircuitElm's
	// getCurrentIntoNode() convention for post 1 (the + terminal).
	if (capacityAh > 0 && !doDcAnalysis()) {
	    soc -= current * sim.timeStep / (3600 * capacityAh);
	    // no lower clamp: below 0% the voltage table is extrapolated (see getVoltageForSoc)
	    if (soc > 1)
		soc = 1;
	}
    }

    final int circleSize = 17;
    void setPoints() {
	super.setPoints();
	calcLeads(8);
    }

    void draw(Graphics g) {
	setBbox(x, y, x2, y2);
	draw2Leads(g);
	setVoltageColor(g, volts[0]);
	setPowerColor(g, false);
	interpPoint2(lead1, lead2, ps1, ps2, 0, 10);
	drawThickLine(g, ps1, ps2);
	setVoltageColor(g, volts[1]);
	setPowerColor(g, false);
	int hs = 16;
	setBbox(point1, point2, hs);
	interpPoint2(lead1, lead2, ps1, ps2, 1, hs);
	drawThickLine(g, ps1, ps2);

	if (dx == 0 || dy == 0) {
	    boolean showV = (flags & FLAG_SHOW_VOLTAGE) != 0;
	    boolean showSoc = (flags & FLAG_SHOW_SOC) != 0;
	    String s = null;
	    if (showV && showSoc)
		s = getShortUnitText(getVoltageForSoc(soc), "V") + " " + getSocText();
	    else if (showV)
		s = getShortUnitText(getVoltageForSoc(soc), "V");
	    else if (showSoc)
		s = getSocText();
	    if (s != null)
		drawValues(g, s, hs);
	}
	updateDotCount();
	if (!isCreating())
	    drawDots(g, point1, point2, curcount);
	drawPosts(g);
    }

    void addRoutingObstacle(WireRouter wr) { addRoutingObstacleWithLeads(wr, 16); }

    double getPower() { return -getVoltageDiff() * current; }
    double getVoltageDiff() { return volts[1] - volts[0]; }

    // SOC is always shown as a whole percentage; getShortUnitText()/getUnitText() would
    // apply metric prefixes or decimal places that don't make sense for a percentage.
    String getSocText() { return Math.round(soc * 100) + "%"; }

    String getBatteryTypeName() {
	return (batteryType >= 0 && batteryType < batteryTypeNames.length) ?
	    batteryTypeNames[batteryType] : "Custom";
    }

    void getInfo(String arr[]) {
	arr[0] = Locale.LS("battery") + " (" + Locale.LS(getBatteryTypeName()) + ")";
	arr[1] = "I = " + getCurrentText(getCurrent());
	arr[2] = "Vd = " + getVoltageText(getVoltageDiff());
	arr[3] = "SOC = " + getSocText();
	arr[4] = "P = " + getUnitText(getPower(), "W");
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("Battery Type", batteryType, -1, -1);
	    ei.choice = new Choice();
	    for (int i = 0; i != batteryTypeNames.length; i++)
		ei.choice.add(batteryTypeNames[i]);
	    ei.choice.add("Custom");
	    // "Custom" is the entry after all the presets, since BT_CUSTOM isn't a valid array index
	    ei.choice.select(batteryType == BT_CUSTOM ? batteryTypeNames.length : batteryType);
	    return ei;
	}
	if (n == 1)
	    return new EditInfo("Capacity (Ah)", capacityAh).setPositive();
	if (n == 2)
	    return new EditInfo("Initial State of Charge (%)", initialSoc * 100, 0, 100).setDimensionless();
	if (n == 3)
	    return new EditInfo("R0, Ohmic Resistance (ohms)", r0).setPositive();
	if (n == 4)
	    return new EditInfo("R1, Polarization Resistance (ohms)", r1).setPositive();
	if (n == 5)
	    return new EditInfo("C1, Polarization Capacitance (F)", c1).setPositive();
	if (n == 6) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox = new Checkbox("Show Voltage", (flags & FLAG_SHOW_VOLTAGE) != 0);
	    return ei;
	}
	if (n == 7) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox = new Checkbox("Show State of Charge", (flags & FLAG_SHOW_SOC) != 0);
	    return ei;
	}
	if (n == 8 && batteryType == BT_CUSTOM) {
	    EditInfo ei = new EditInfo("SOC(%) = Voltage Table", 0);
	    ei.textArea = new TextArea();
	    ei.textArea.setVisibleLines(6);
	    ei.textArea.setText(socVoltageTable);
	    return ei;
	}
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {
	if (n == 0 && ei.choice != null) {
	    int oldType = batteryType;
	    int sel = ei.choice.getSelectedIndex();
	    batteryType = (sel >= batteryTypeNames.length) ? BT_CUSTOM : sel;
	    if (batteryType != BT_CUSTOM)
		socVoltageTable = batteryTypeTables[batteryType];
	    else if (oldType != BT_CUSTOM)
		socVoltageTable = batteryTypeTables[oldType];
	    parseSocTable(null);
	    if (batteryType != oldType)
		ei.newDialog = true;
	}
	if (n == 1)
	    capacityAh = ei.value;
	if (n == 2) {
	    double v = ei.value;
	    if (v < 0)
		v = 0;
	    if (v > 100)
		v = 100;
	    initialSoc = v * .01;
	}
	if (n == 3)
	    r0 = ei.value;
	if (n == 4)
	    r1 = ei.value;
	if (n == 5)
	    c1 = ei.value;
	if (n == 6 && ei.checkbox != null)
	    flags = ei.changeFlag(flags, FLAG_SHOW_VOLTAGE);
	if (n == 7 && ei.checkbox != null)
	    flags = ei.changeFlag(flags, FLAG_SHOW_SOC);
	if (n == 8) {
	    socVoltageTable = ei.textArea.getText();
	    parseSocTable(ei);
	}
    }
}
