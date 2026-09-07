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

// Two windings on a SHARED magnetic core.  Unlike TransformerElm, which models
// two coupled inductors with a coupling coefficient < 1, this element models a
// single common flux path: both windings drive one flux Phi through one MMF
//
//     F = N1*i1 + N2*i2
//
// and both see that same Phi.  That is the physically correct picture for a
// wound core, and it is the configuration TransformerElm cannot represent -- see
// the note in stamp() below.
//
// This first version uses a LINEAR permeance, Phi = P*F.  The constitutive law is
// deliberately isolated in fluxFromMmf()/dPhiDMmf() so a saturating or hysteretic
// model can replace it without touching the stamp.

class MagneticCoreElm extends CircuitElm {
    double permeance;		// P, in Wb per amp-turn
    double turns1, turns2;	// N1, N2
    double rWinding1, rWinding2;	// winding resistances, ohms (must be > 0, see stamp())
    double flux, fluxDot;	// core state: Phi and dPhi/dt
    double current[], curcount[];

    // companion model, recomputed each timestep
    double y11, y12, y21, y22;	// conductance block
    double histCur1, histCur2;	// history current sources

    Point ptEnds[], ptCoil[], ptCore[];
    int width;

    public static final int FLAG_VERTICAL = 8;

    // A winding resistance of exactly zero makes the winding equations singular
    // (see stamp()).  Real windings always have some copper resistance, so we
    // floor it rather than dividing by zero.
    static final double MIN_WINDING_RESISTANCE = 1e-6;

    public MagneticCoreElm(int xx, int yy) {
	super(xx, yy);
	permeance = 1e-6;
	turns1 = turns2 = 100;
	rWinding1 = rWinding2 = 0.1;
	width = 32;
	noDiagonal = true;
	current = new double[2];
	curcount = new double[2];
    }

    public MagneticCoreElm(int xa, int ya, int xb, int yb, int f,
			   StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	if (hasFlag(FLAG_VERTICAL))
	    width = -max(32, abs(xb-xa));
	else
	    width = max(32, abs(yb-ya));
	current = new double[2];
	curcount = new double[2];
	permeance = new Double(st.nextToken()).doubleValue();
	turns1 = new Double(st.nextToken()).doubleValue();
	turns2 = new Double(st.nextToken()).doubleValue();
	rWinding1 = new Double(st.nextToken()).doubleValue();
	rWinding2 = new Double(st.nextToken()).doubleValue();
	try {
	    current[0] = new Double(st.nextToken()).doubleValue();
	    current[1] = new Double(st.nextToken()).doubleValue();
	    flux = new Double(st.nextToken()).doubleValue();
	} catch (Exception e) { }
	noDiagonal = true;
    }

    int getDumpType() { return 434; }

    String dump() {
	return super.dump() + " " + permeance + " " + turns1 + " " + turns2 +
	    " " + rWinding1 + " " + rWinding2 + " " + current[0] + " " +
	    current[1] + " " + flux;
    }

    void dumpXml(Document doc, Element elem) {
	super.dumpXml(doc, elem);
	XMLSerializer.dumpAttr(elem, "pe", permeance);
	XMLSerializer.dumpAttr(elem, "n1", turns1);
	XMLSerializer.dumpAttr(elem, "n2", turns2);
	XMLSerializer.dumpAttr(elem, "r1", rWinding1);
	XMLSerializer.dumpAttr(elem, "r2", rWinding2);
	XMLSerializer.dumpAttr(elem, "wi", width);
    }

    void dumpXmlState(Document doc, Element elem) {
	XMLSerializer.dumpAttr(elem, "c0", current[0]);
	XMLSerializer.dumpAttr(elem, "c1", current[1]);
	XMLSerializer.dumpAttr(elem, "fl", flux);
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	if (hasFlag(FLAG_VERTICAL))
	    width = -max(32, abs(x2-x));
	else
	    width = max(32, abs(y2-y));
	permeance = xml.parseDoubleAttr("pe", permeance);
	turns1 = xml.parseDoubleAttr("n1", turns1);
	turns2 = xml.parseDoubleAttr("n2", turns2);
	rWinding1 = xml.parseDoubleAttr("r1", rWinding1);
	rWinding2 = xml.parseDoubleAttr("r2", rWinding2);
	width = xml.parseIntAttr("wi", width);
	current[0] = xml.parseDoubleAttr("c0", 0);
	current[1] = xml.parseDoubleAttr("c1", 0);
	flux = xml.parseDoubleAttr("fl", 0);
    }

    boolean isTrapezoidal() { return (flags & Inductor.FLAG_BACK_EULER) == 0; }

    // ---- constitutive law -------------------------------------------------
    // Everything model-specific lives in these two methods.  A saturating or
    // hysteretic core replaces them; the stamp below does not change.

    // MMF required to produce a given flux.  Linear: F = Phi/P.
    double mmfFromFlux(double phi) { return phi/permeance; }

    // Reluctance dF/dPhi at the operating point.  Linear: 1/P.
    double reluctance(double phi) { return 1/permeance; }

    // ---- solver interface --------------------------------------------------

    void stamp() {
	// Two windings on one core.  Per winding, Faraday plus copper:
	//
	//   v1 = N1 dPhi/dt + Rw1 i1
	//   v2 = N2 dPhi/dt + Rw2 i2
	//
	// with the windings tied together by the MMF that produces the flux:
	//
	//   N1 i1 + N2 i2 = F(Phi)
	//
	// Note we do NOT build an inductance matrix and invert it, the way
	// TransformerElm does.  For a shared flux path L(j,k) = N_j N_k P, which
	// is a rank-1 matrix: its determinant is zero and it has no inverse.
	// That is why TransformerElm's coupling coefficient defaults to 0.999
	// rather than 1 -- its det = L1 L2 (1-k^2) blows up at perfect coupling.
	// The formulation below has no such problem because the winding
	// resistances appear on the diagonal.
	//
	// Solving the winding equations for i, with u_j = N_j/Rw_j and
	// S = sum(N_j^2/Rw_j):
	//
	//   i_j = v_j/Rw_j - u_j dPhi/dt
	//   dPhi/dt = (sum_k u_k v_k - F(Phi)) / S
	//
	// Integrating Phi trapezoidally and linearizing F about the last flux
	// gives a Norton companion: a conductance block Y plus history sources.
	// Writing T = S + dt*reluctance/2,
	//
	//   Y(j,j) = (S_minus_j + dt*reluctance/2) / (Rw_j * T)
	//   Y(j,k) = -u_j u_k / T                              (j != k)
	//
	// where S_minus_j is S with its own term left out.  The diagonal is
	// written this way on purpose: the algebraically equivalent
	// 1/Rw_j - u_j^2/T is a difference of nearly equal numbers once the core
	// is stiff, and loses most of its significant digits there.  Every term
	// in the form above is positive, so it stays accurate.
	//
	// Sanity check, one winding: Y = 1/(Rw + 2L/dt) with L = N^2 P, which is
	// exactly Inductor.java's companion resistance with the winding
	// resistance in series.
	double rw1 = Math.max(rWinding1, MIN_WINDING_RESISTANCE);
	double rw2 = Math.max(rWinding2, MIN_WINDING_RESISTANCE);
	double u1 = turns1/rw1;
	double u2 = turns2/rw2;
	double s1 = turns1*turns1/rw1;
	double s2 = turns2*turns2/rw2;
	double s = s1+s2;

	// dt/2 for trapezoidal, dt for backward euler
	double ts = isTrapezoidal() ? sim.timeStep/2 : sim.timeStep;
	double t = s + ts*reluctance(flux);

	y11 = (s2 + ts*reluctance(flux)) / (rw1*t);
	y22 = (s1 + ts*reluctance(flux)) / (rw2*t);
	y12 = y21 = -u1*u2/t;

	sim.stampConductance(nodes[0], nodes[2], y11);
	sim.stampVCCurrentSource(nodes[0], nodes[2], nodes[1], nodes[3], y12);
	sim.stampVCCurrentSource(nodes[1], nodes[3], nodes[0], nodes[2], y21);
	sim.stampConductance(nodes[1], nodes[3], y22);

	sim.stampRightSide(nodes[0]);
	sim.stampRightSide(nodes[1]);
	sim.stampRightSide(nodes[2]);
	sim.stampRightSide(nodes[3]);
    }

    void startIteration() {
	// History of the trapezoidal flux integration.  h has units of Wb/s.
	double rw1 = Math.max(rWinding1, MIN_WINDING_RESISTANCE);
	double rw2 = Math.max(rWinding2, MIN_WINDING_RESISTANCE);
	double u1 = turns1/rw1;
	double u2 = turns2/rw2;
	double s = turns1*turns1/rw1 + turns2*turns2/rw2;
	double ts = isTrapezoidal() ? sim.timeStep/2 : sim.timeStep;
	double t = s + ts*reluctance(flux);

	double h;
	if (isTrapezoidal())
	    h = flux/ts + fluxDot;
	else
	    h = flux/ts;

	// the part of dPhi/dt already determined by history, weighted into each
	// winding.  For a linear core F(Phi) = reluctance*Phi exactly, so the
	// linearization residual vanishes and this is all that survives.
	double k = ts*reluctance(flux)/t;
	histCur1 = u1*h*k;
	histCur2 = u2*h*k;
    }

    void doStep() {
	sim.stampCurrentSource(nodes[0], nodes[2], histCur1);
	sim.stampCurrentSource(nodes[1], nodes[3], histCur2);
    }

    void calculateCurrent() {
	double vd1 = volts[0]-volts[2];
	double vd2 = volts[1]-volts[3];
	current[0] = vd1*y11 + vd2*y12 + histCur1;
	current[1] = vd1*y21 + vd2*y22 + histCur2;
    }

    void stepFinished() {
	// advance the core state.  The constitutive law is algebraic, so the new
	// flux follows directly from the new MMF; dPhi/dt then comes from the
	// same trapezoidal rule used to build the companion.
	double newFlux = permeance*(turns1*current[0] + turns2*current[1]);
	double ts = isTrapezoidal() ? sim.timeStep/2 : sim.timeStep;
	if (isTrapezoidal())
	    fluxDot = (newFlux-flux)/ts - fluxDot;
	else
	    fluxDot = (newFlux-flux)/ts;
	flux = newFlux;
    }

    void reset() {
	current[0] = current[1] = 0;
	volts[0] = volts[1] = volts[2] = volts[3] = 0;
	curcount[0] = curcount[1] = 0;
	histCur1 = histCur2 = 0;
	flux = fluxDot = 0;
    }

    // ---- geometry and drawing ---------------------------------------------

    void drag(int xx, int yy) {
	xx = snapGrid(xx);
	yy = snapGrid(yy);
	if (abs(xx-x) > abs(yy-y))
	    flags &= ~FLAG_VERTICAL;
	else
	    flags |= FLAG_VERTICAL;
	if (hasFlag(FLAG_VERTICAL))
	    width = -max(32, abs(xx-x));
	else
	    width = max(32, abs(yy-y));
	if (xx == x)
	    yy = y;
	x2 = xx; y2 = yy;
	setPoints();
    }

    void setPoints() {
	super.setPoints();
	if (hasFlag(FLAG_VERTICAL))
	    point2.x = point1.x;
	else
	    point2.y = point1.y;
	ptEnds = newPointArray(4);
	ptCoil = newPointArray(4);
	ptCore = newPointArray(4);
	ptEnds[0] = point1;
	ptEnds[1] = point2;
	interpPoint(point1, point2, ptEnds[2], 0, -dsign*width);
	interpPoint(point1, point2, ptEnds[3], 1, -dsign*width);
	double ce = .5-12/dn;
	double cd = .5-2/dn;
	int i;
	for (i = 0; i != 4; i += 2) {
	    interpPoint(ptEnds[i], ptEnds[i+1], ptCoil[i],   ce);
	    interpPoint(ptEnds[i], ptEnds[i+1], ptCoil[i+1], 1-ce);
	    interpPoint(ptEnds[i], ptEnds[i+1], ptCore[i],   cd);
	    interpPoint(ptEnds[i], ptEnds[i+1], ptCore[i+1], 1-cd);
	}
    }

    Point getPost(int n) { return ptEnds[n]; }
    int getPostCount() { return 4; }

    void draw(Graphics g) {
	int i;
	for (i = 0; i != 4; i++) {
	    setVoltageColor(g, volts[i]);
	    drawThickLine(g, ptEnds[i], ptCoil[i]);
	}
	for (i = 0; i != 2; i++) {
	    setPowerColor(g, current[i]*(volts[i]-volts[i+2]));
	    drawCoil(g, dsign*(i == 1 ? -6 : 6), ptCoil[i], ptCoil[i+2],
		     volts[i], volts[i+2]);
	}
	// the shared core, drawn as a solid bar to distinguish it from
	// TransformerElm's two-line loosely-coupled core
	g.setColor(needsHighlight() ? selectColor : lightGrayColor);
	for (i = 0; i != 2; i++) {
	    drawThickLine(g, ptCore[i], ptCore[i+2]);
	}
	for (i = 0; i != 2; i++)
	    curcount[i] = updateDotCount(current[i], curcount[i]);
	for (i = 0; i != 2; i++) {
	    drawDots(g, ptEnds[i],   ptCoil[i],   curcount[i]);
	    drawDots(g, ptCoil[i+2], ptEnds[i+2], curcount[i]);
	}
	drawPosts(g);
	setBbox(ptEnds[0], ptEnds[hasFlag(FLAG_VERTICAL) ? 1 : 3], 0);
    }

    boolean getConnection(int n1, int n2) {
	// each winding connects its own pair of terminals; the windings are
	// coupled magnetically, not conductively
	if (comparePair(n1, n2, 0, 2)) return true;
	if (comparePair(n1, n2, 1, 3)) return true;
	return false;
    }

    double getCurrentIntoNode(int n) {
	if (n == 0) return -current[0];
	if (n == 1) return -current[1];
	if (n == 2) return current[0];
	return current[1];
    }

    void getInfo(String arr[]) {
	arr[0] = "magnetic core";
	arr[1] = "P = " + getUnitText(permeance, "Wb/A-t");
	arr[2] = "N1 = " + showFormat.format(turns1) +
	    ", N2 = " + showFormat.format(turns2);
	arr[3] = "F = " + getUnitText(turns1*current[0]+turns2*current[1], "A-t");
	arr[4] = "Φ = " + getUnitText(flux, "Wb");
	arr[5] = "dΦ/dt = " + getUnitText(fluxDot, "Wb/s");
	arr[6] = "I1 = " + getCurrentText(current[0]);
	arr[7] = "I2 = " + getCurrentText(current[1]);
    }

    public EditInfo getEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("Permeance (Wb/A-turn)", permeance);
	if (n == 1)
	    return new EditInfo("Primary Turns", turns1).setDimensionless();
	if (n == 2)
	    return new EditInfo("Secondary Turns", turns2).setDimensionless();
	if (n == 3)
	    return new EditInfo("Primary Winding Resistance (ohms)", rWinding1);
	if (n == 4)
	    return new EditInfo("Secondary Winding Resistance (ohms)", rWinding2);
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {
	if (n == 0 && ei.value > 0)
	    permeance = ei.value;
	if (n == 1 && ei.value > 0)
	    turns1 = ei.value;
	if (n == 2 && ei.value > 0)
	    turns2 = ei.value;
	if (n == 3)
	    rWinding1 = Math.max(ei.value, MIN_WINDING_RESISTANCE);
	if (n == 4)
	    rWinding2 = Math.max(ei.value, MIN_WINDING_RESISTANCE);
    }
}
