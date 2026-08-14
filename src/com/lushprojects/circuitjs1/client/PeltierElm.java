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

// REPORT-CARD >> features/thermoelectric-peltier-element.feature
//
// Thermoelectric (Peltier / TEC) module.
//
// Four terminals: two ELECTRICAL and two THERMAL.  The thermal terminals use
// the standard thermal-electrical analogy, as used throughout SPICE
// electrothermal modelling:
//
//      temperature  T    <->  node voltage        (K  <-> V)
//      heat flow    Qdot <->  branch current      (W  <-> A)
//      thermal res. Rth  <->  resistance          (K/W <-> ohm)
//      thermal cap. Cth  <->  capacitance         (J/K <-> F)
//
// So an ambient reservoir is modelled as a voltage source on the thermal node,
// a heatsink as a resistor to ambient, and thermal mass as a capacitor.
//
// Device equations (standard single-couple TEC model, Seebeck coefficient a,
// electrical series resistance R, thermal conductance K):
//
//   electrical:  V = a*(Th - Tc) + I*R            (Seebeck emf + ohmic drop)
//   cold side:   Qc = a*I*Tc - 0.5*I^2*R - K*(Th-Tc)     (heat absorbed)
//   hot side:    Qh = a*I*Th + 0.5*I^2*R - K*(Th-Tc)     (heat rejected)
//
// Energy accounting is exact and can be checked in the simulator:
//
//   Qh - Qc = a*I*(Th-Tc) + I^2*R = V*I = W
//
// i.e. the heat rejected exceeds the heat absorbed by exactly the electrical
// work done.  The coefficient of performance COP = Qc/W is therefore greater
// than one whenever a*I*Tc exceeds the Joule and conduction losses -- not
// because energy is created, but because the cold-side reservoir supplies Qc
// and it is drawn as an explicit node rather than left implicit.
//
// The element is nonlinear (the heat terms contain products of I and T), so it
// is iterated via stampNonLinear/doStep.
//
// NOTE ON UNITS: the thermal nodes carry ABSOLUTE temperature in kelvin,
// because the Peltier terms are proportional to T, not to a temperature
// difference from an arbitrary zero.  Ground the thermal network through a
// voltage source of 293 (i.e. 20 C) to represent ambient.

class PeltierElm extends CircuitElm {
    double seebeck;      // a, V/K
    double resistance;   // R, ohms (electrical)
    double thermalCond;  // K, W/K

    double qHot, qCold, elecPower, cop;
    Point posts[], rectPoints[];
    Point coldLead, hotLead;

    public PeltierElm(int xx, int yy) {
	super(xx, yy);
	// representative small single-stage TEC module
	seebeck = 0.05;      // 50 mV/K
	resistance = 2;      // 2 ohm
	thermalCond = 0.5;   // 0.5 W/K
    }

    public PeltierElm(int xa, int ya, int xb, int yb, int f,
		      StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	seebeck = new Double(st.nextToken()).doubleValue();
	resistance = new Double(st.nextToken()).doubleValue();
	thermalCond = new Double(st.nextToken()).doubleValue();
    }

    int getDumpType() { return 435; }
    String getElmType() { return "thermoelectric"; }

    String dump() {
	return super.dump() + " " + seebeck + " " + resistance + " " + thermalCond;
    }

    void dumpXml(Document doc, Element elem) {
	super.dumpXml(doc, elem);
	XMLSerializer.dumpAttr(elem, "seebeck", seebeck);
	XMLSerializer.dumpAttr(elem, "resistance", resistance);
	XMLSerializer.dumpAttr(elem, "thermalCond", thermalCond);
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	seebeck = xml.parseDoubleAttr("seebeck", seebeck);
	resistance = xml.parseDoubleAttr("resistance", resistance);
	thermalCond = xml.parseDoubleAttr("thermalCond", thermalCond);
    }

    // posts: 0,1 = electrical (left side);  2 = hot thermal, 3 = cold thermal (right side)
    int getPostCount() { return 4; }
    int getVoltageSourceCount() { return 1; }
    int getInternalNodeCount() { return 1; }

    void setPoints() {
	super.setPoints();
	int hs = 16;
	posts = newPointArray(4);
	// electrical pair at point1 end, thermal pair at point2 end
	interpPoint2(point1, point2, posts[0], posts[1], 0, hs);
	interpPoint2(point1, point2, posts[2], posts[3], 1, hs);
	// body rectangle
	Point r1 = interpPoint(point1, point2, 0.28, hs);
	Point r2 = interpPoint(point1, point2, 0.28, -hs);
	Point r3 = interpPoint(point1, point2, 0.72, -hs);
	Point r4 = interpPoint(point1, point2, 0.72, hs);
	rectPoints = new Point[] { r1, r2, r3, r4 };
	hotLead  = interpPoint(point1, point2, 0.72,  hs);
	coldLead = interpPoint(point1, point2, 0.72, -hs);
    }

    Point getPost(int n) { return posts[n]; }

    void draw(Graphics g) {
	setBbox(point1, point2, 16);
	// leads to each post
	Point e1 = interpPoint(point1, point2, 0.28,  16);
	Point e2 = interpPoint(point1, point2, 0.28, -16);
	setVoltageColor(g, volts[0]); drawThickLine(g, posts[0], e1);
	setVoltageColor(g, volts[1]); drawThickLine(g, posts[1], e2);
	setVoltageColor(g, volts[2]); drawThickLine(g, posts[2], hotLead);
	setVoltageColor(g, volts[3]); drawThickLine(g, posts[3], coldLead);

	// body
	g.setColor(needsHighlight() ? selectColor : Color.gray);
	drawThickLine(g, rectPoints[0], rectPoints[1]);
	drawThickLine(g, rectPoints[1], rectPoints[2]);
	drawThickLine(g, rectPoints[2], rectPoints[3]);
	drawThickLine(g, rectPoints[3], rectPoints[0]);

	drawPosts(g);
    }

    boolean nonLinear() { return true; }
    boolean getConnection(int n1, int n2) {
	// electrical pair conduct; thermal pair conduct; the two domains do not
	if ((n1 == 0 && n2 == 1) || (n1 == 1 && n2 == 0)) return true;
	if ((n1 == 2 && n2 == 3) || (n1 == 3 && n2 == 2)) return true;
	return false;
    }

    void stamp() {
	// electrical: Seebeck source (nodes 0 -> internal 4) in series with R (4 -> 1)
	sim.stampVoltageSource(nodes[0], nodes[4], voltSource);
	sim.stampNonLinear(nodes[4]);
	sim.stampResistor(nodes[4], nodes[1], resistance);

	// thermal: Fourier conduction between hot and cold faces
	if (thermalCond > 0)
	    sim.stampResistor(nodes[2], nodes[3], 1/thermalCond);

	// thermal nodes receive injected heat (right-hand side), and the
	// injections depend on I and T, so they must be iterated
	sim.stampNonLinear(nodes[2]);
	sim.stampNonLinear(nodes[3]);
	sim.stampRightSide(nodes[2]);
	sim.stampRightSide(nodes[3]);
    }

    void doStep() {
	double th = volts[2];
	double tc = volts[3];
	double i = current;              // electrical current through the device

	// Seebeck emf opposes the applied voltage, proportional to dT.
	// stampVoltageSource(n1, n2, vs, v) sets V(n2) - V(n1) = v, so the emf must
	// be stamped NEGATIVE here to raise the terminal voltage: with the internal
	// node 4 between the source and R, this gives
	//     V(0) - V(1) = I*R + a*(Th-Tc)
	// which is the relation Qh - Qc = V*I depends on.  Stamping +seebeck*(th-tc)
	// makes the emf assist the drive instead of opposing it, and the element then
	// delivers more heat than the electrical work put in.
	sim.updateVoltageSource(nodes[0], nodes[4], voltSource, -seebeck*(th-tc));

	// Peltier pumping: aITc leaves the cold face, aITh enters the hot face.
	// The difference aI(Th-Tc) is supplied by the electrical port via the
	// Seebeck source above, so total energy balances exactly.
	double joule = 0.5*i*i*resistance;
	sim.stampRightSide(nodes[2],  seebeck*i*th + joule);
	sim.stampRightSide(nodes[3], -seebeck*i*tc + joule);
    }

    void setCurrent(int vn, double c) { current = c; }

    void stepFinished() {
	double th = volts[2], tc = volts[3];
	double i = current;
	double cond = thermalCond*(th-tc);
	qCold = seebeck*i*tc - 0.5*i*i*resistance - cond;
	qHot  = seebeck*i*th + 0.5*i*i*resistance - cond;
	// measured from the solved terminal voltage rather than recomputed from the
	// model equation, so that the Qh-Qc-W residual shown in getInfo() is a real
	// check against the circuit solution and not the formula compared to itself
	elecPower = (volts[0]-volts[1])*i;
	// only meaningful when the device is actually being driven; with no drive
	// (Seebeck generator mode) W tends to zero and the ratio blows up
	cop = (elecPower > 1e-6) ? qCold/elecPower : 0;
    }

    void getInfo(String arr[]) {
	arr[0] = "thermoelectric (Peltier)";
	arr[1] = "I = " + getCurrentText(current);
	arr[2] = "Th = " + showFormat.format(volts[2]) + " K, Tc = " + showFormat.format(volts[3]) + " K";
	arr[3] = "Qc (absorbed) = " + getUnitText(qCold, "W");
	arr[4] = "Qh (rejected) = " + getUnitText(qHot, "W");
	arr[5] = "W (electrical) = " + getUnitText(elecPower, "W");
	// exact-balance check, displayed so it can be verified at a glance
	arr[6] = "Qh-Qc-W = " + getUnitText(qHot-qCold-elecPower, "W");
	arr[7] = "COP (cooling) = " + showFormat.format(cop);
    }

    @Override
    String getScopeText(int v) {
	return Locale.LS("thermoelectric") + ", COP " + showFormat.format(cop);
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("Seebeck coefficient (V/K)", seebeck, 0, 0);
	if (n == 1)
	    return new EditInfo("Electrical resistance (ohms)", resistance, 0, 0);
	if (n == 2)
	    return new EditInfo("Thermal conductance (W/K)", thermalCond, 0, 0);
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {
	if (n == 0)
	    seebeck = ei.value;
	if (n == 1 && ei.value > 0)
	    resistance = ei.value;
	if (n == 2 && ei.value >= 0)
	    thermalCond = ei.value;
    }

    int getShortcut() { return 0; }
}
