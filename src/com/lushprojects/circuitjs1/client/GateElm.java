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

abstract class GateElm extends CircuitElm {
	final int FLAG_SMALL = 1<<0;
	final int FLAG_SCHMITT = 1<<1;
	final int FLAG_INVERT_INPUTS = 1<<2;
	final int FLAG_DEMORGAN = 1<<3;

	int inputCount = 2;
	boolean lastOutput;
	int getDragLength() { return 96; }
	double highVoltage;
	double propagationDelay; // seconds; 0 = instant (default)
	double delayEndTime;     // time at which pending output change takes effect
	public static double lastHighVoltage = 5;
	static boolean lastSchmitt = false;
	
	public GateElm(int xx, int yy) {
	    super(xx, yy);
	    noDiagonal = true;
	    inputCount = 2;
	    allocNodes();
	    setupVolts();

	    // copy defaults from last gate edited
	    highVoltage = lastHighVoltage;
	    if (lastSchmitt)
		flags |= FLAG_SCHMITT;

	    setSize(useSmallGrid() ? 1 : 2);
	}
	public GateElm(int xa, int ya, int xb, int yb, int f,
			StringTokenizer st) {
	    super(xa, ya, xb, yb, f);
	    inputCount = new Integer(st.nextToken()).intValue();
	    double lastOutputVoltage = new Double (st.nextToken()).doubleValue();
	    noDiagonal = true;
	    highVoltage = 5;
	    try {
		highVoltage = new Double(st.nextToken()).doubleValue();
	    } catch (Exception e) { }
	    lastOutput = lastOutputVoltage > highVoltage*.5;
	    setSize((f & FLAG_SMALL) != 0 ? 1 : 2);
	    allocNodes();
	    setupVolts();
	}
	boolean isInverting() { return false; }
	int gsize, gwidth, gwidth2, gheight, hs2;
	void setSize(int s) {
	    gsize = s;
	    gwidth = 7*s;
	    gwidth2 = 14*s;
	    gheight = 8*s;
	    flags &= ~FLAG_SMALL;
	    flags |= (s == 1) ? FLAG_SMALL : 0;
	}

	void dumpXml(Document doc, Element elem) {
	    super.dumpXml(doc, elem);
	    if (highVoltage != 5)
		XMLSerializer.dumpAttr(elem, "hi", highVoltage);
	    if (inputCount != 2)
		XMLSerializer.dumpAttr(elem, "in", inputCount);
	    if (propagationDelay != 0)
		XMLSerializer.dumpAttr(elem, "pd", propagationDelay);
	}

	void dumpXmlState(Document doc, Element elem) {
	    if (volts[inputCount] != 0)
		XMLSerializer.dumpAttr(elem, "o", volts[inputCount]);
	}

	void undumpXml(XMLDeserializer xml) {
	    // "ix" is present on state-restore calls (from CompositeElm.dumpXmlState/undumpXml).
	    // In that case this element already exists with correct flags (set up when the
	    // containing model was loaded), and the state element has no "f" attribute, so
	    // zeroing flags here would wipe FLAG_SCHMITT/FLAG_INVERT_INPUTS/FLAG_SMALL instead
	    // of restoring them.
	    boolean stateRestore = xml.parseStringAttr("ix", null) != null;
	    if (!stateRestore)
		flags = 0; // SMALL might have gotten set
	    super.undumpXml(xml);
	    highVoltage = xml.parseDoubleAttr("hi", highVoltage);
	    inputCount = xml.parseIntAttr("in", inputCount);
	    propagationDelay = xml.parseDoubleAttr("pd", propagationDelay);
	    double lastOutputVoltage = xml.parseDoubleAttr("o", 0);
	    lastOutput = lastOutputVoltage > highVoltage*.5;
	    setSize((flags & FLAG_SMALL) != 0 ? 1 : 2);
	    allocNodes();
	    setupVolts();
	}

	void addRoutingObstacle(WireRouter router) {
	    // add wires from each input post to gate body
	    for (int i = 0; i < inputCount; i++)
		router.addWire(inPosts[i].x, inPosts[i].y, inGates[i].x, inGates[i].y);
	    // add output wire
	    router.addWire(lead2.x, lead2.y, point2.x, point2.y);

	    double leadDist = distance(lead1, lead2);
	    double hs2 = gwidth*(inputCount/2+1);
            Point pa = interpPoint(lead1, lead2, -8/leadDist, hs2);
            Point pb = interpPoint(lead1, lead2, 1, -hs2);
            router.addObstacle(pa.x, pa.y, pb.x, pb.y);
        }

	String getXmlDumpType() { return getClassName().replace("GateElm", ""); }

	Point inPosts[], inGates[];
	boolean inputStates[];
	int ww;

	// Back-control fraction for the OR gate's concave back curve (the
	// triPoints[6]->[7]->[0] bezierCurveTo built in setPoints() / drawn in
	// drawGatePolygon()) -- named so backCurveX() below always matches
	// whatever the body curve actually draws.
	static final double orBackCtrlFrac = .195;

	// Real (signed) cube root. Math.cbrt(x) for x<0 is undefined via a naive
	// Math.pow(x, 1./3.) -- Math.pow of a negative base to a non-integer
	// exponent is NaN in Java/JS -- so we do the sign handling ourselves
	// rather than depend on how GWT's Math.cbrt emulation is implemented.
	static double cbrt(double x) {
	    return (x < 0) ? -Math.pow(-x, 1./3.) : Math.pow(x, 1./3.);
	}

	// True x-offset (from lead1, same units as ww/len) of the OR gate's
	// concave back curve at a given height "target" (same units as hs2).
	// That curve is a bezierCurveTo with a repeated control point --
	// P0=(0,-hs2), P1=P2=(orBackCtrlFrac*len,0), P3=(0,+hs2) -- which reduces
	// to x(t) = 3t(1-t)*orBackCtrlFrac*len, y(t) = hs2*(t^3-(1-t)^3).
	// Solving y(t)=target for t is a depressed cubic in s=2t-1
	// (s^3+3s-4k=0, k=target/hs2), solved here in closed form (Cardano) --
	// y(t) is monotonic in t over [0,1], so there's always exactly one real
	// solution. The second cbrt() term below, cbrt(2*k-disc), always has a
	// negative argument (disc > 2|k| for every real k), which is exactly
	// why the sign-safe cbrt() above matters. (2026-09-19, for the
	// input-bubble/lead contact fix.)
	static double backCurveX(double target, double hs2, double len) {
	    double k = target/hs2;
	    double disc = Math.sqrt(4*k*k+1);
	    double s = cbrt(2*k+disc) + cbrt(2*k-disc);
	    double t = (s+1)/2;
	    return 3*t*(1-t)*orBackCtrlFrac*len;
	}

	void setPoints() {
	    super.setPoints();
	    inputStates = new boolean[inputCount];
	    if (dn > 150 && isCreating())
		setSize(2);
	    int hs = gheight;
	    int i;
	    ww = gwidth2; // was 24
	    if (ww > dn/2)
		ww = (int) (dn/2);
	    if (isInverting() && ww+8 > dn/2)
		ww = (int) (dn/2-8);
	    calcLeads(ww*2);
	    inPosts = new Point[inputCount];
	    inGates = new Point[inputCount];
	    int i0 = -inputCount/2;
	    if (hasFlag(FLAG_INVERT_INPUTS) || hasFlag(FLAG_DEMORGAN))
		icircles = new Point[inputCount];
	    else
		icircles = null;
	    // moved up from after the loop below -- backCurveX() (OR-shaped bodies
	    // only) needs the current hs2, not last time's value
	    hs2 = gwidth*(inputCount/2+1);
	    boolean andShaped = drawAsAndGate();
	    for (i = 0; i != inputCount; i++, i0++) {
		if (i0 == 0 && (inputCount & 1) == 0)
		    i0++;
		double adj = getLeadAdjustment(i);
                inPosts[i] = interpPoint(point1, point2, 0, hs*i0);
		// bx = true x-offset (from lead1) of the body's back surface at this
		// input's height: always 0 for AND (flat back), or the concave back
		// curve's real position for OR (see backCurveX) -- a flat fraction-0
		// offset is only correct there at the very top/bottom corners.
		// A lead with no bubble should reach exactly bx, the same as AND's
		// flat-back lead always reaches exactly fraction 0 (a wire is
		// expected to touch/slightly overlap the body -- that's normal and
		// was never a problem for AND). A bubble sits back from bx using the
		// exact same clearance Falstad's original AND+DeMorgan bubble already
		// used (-4 bubble-center, -8 wire-end) -- reusing those proven-good
		// numbers rather than re-deriving stroke clearance from scratch,
		// since a naive "0 gap between centerlines" (tried first) ignores
		// that both the bubble and the body are drawn with a 3px-wide stroke
		// and so visually overlap well before their centerlines touch.
		// (2026-09-19)
		double bx = andShaped ? 0 : backCurveX(hs*i0, hs2, ww*2.);
		double inGateOff = icircles != null ? bx - 8 : bx;
		inGates[i] = interpPoint(lead1,  lead2,  inGateOff/(ww*2.)+adj, hs*i0);
		if (icircles != null)
		    icircles[i] = interpPoint(lead1, lead2,  (bx-4)/(ww*2.), hs*i0);
	    }
	    setBbox(point1, point2, hs2);
	    if (hasSchmittInputs())
		schmittPoly = getSchmittPolygon(gsize, .47f);

	    if (useEuroGates()) {
		createEuroGatePolygon();
		linePoints = null;
	    } else {
		// 0 - top left, 1 - start of top curve, 2 - control point for top curve
		// 3 - right, 4 - control point for bottom curve, 5 - start of bottom curve, 6 - bottom right, 7 - control point for left curve
		Point triPoints[] = newPointArray(11);

		if (drawAsAndGate()) {
		    interpPoint2(lead1, lead2, triPoints[0], triPoints[6], 0, hs2);
		    interpPoint2(lead1, lead2, triPoints[1], triPoints[5], .5, hs2);
		    interpPoint2(lead1, lead2, triPoints[2], triPoints[4], 1, hs2);
		    interpPoint(lead1, lead2, triPoints[3], 1);
		} else {
		    // Fractions retuned (2026-09-19) to fit the true MIL-STD-806B
		    // circular-arc geometry (front nose: radius 2h; back: radius 2h
		    // centered √3h behind the corners -- see spinningnumbers.org/
		    // a/logic-gates.html) as closely as a single-control-point
		    // bezier can. Old values (.3 flat, .733/.85 front control,
		    // .105 back control) deviated from the true arc by ~11% of h;
		    // these get both curves down to ~2.4% of h, matching the AND
		    // gate's (untouched, already-good) fidelity. Purely a constant
		    // swap -- no structural change, so none of the lead2/bubble-
		    // shift interactions from the arc-based attempt apply here.
		    interpPoint2(lead1, lead2, triPoints[0], triPoints[6], 0, hs2);
		    interpPoint2(lead1, lead2, triPoints[1], triPoints[5], .134, hs2);
		    triPoints[3] = lead2;
		    interpPoint2(lead1, lead2, triPoints[2], triPoints[4], .664, hs2*.8372);
		    interpPoint(lead1, lead2, triPoints[7], orBackCtrlFrac); // was .105 (originally .15)
		}
		if (this instanceof XorGateElm || this instanceof XnorGateElm) {
		    double ww2 = (ww == 0) ? dn*2 : ww*2;
		    interpPoint2(lead1, lead2, triPoints[8], triPoints[9], -.05-8/ww2, hs2);
		    interpPoint(lead1, lead2, triPoints[10], .1-8/ww2);
		}
		gatePoly = createPolygon(triPoints);
	    }

	    if (isInverting() ^ hasFlag(FLAG_DEMORGAN)) {
		pcircle = interpPoint(point1, point2, .5+(ww+4)/dn);
		lead2 = interpPoint(point1, point2, .5+(ww+8)/dn);
	    }
	}
	
	// Restore state if loading from file or volts is reallocated.
	void setupVolts() {
	    int i;
	    // We don't remember all the inputs, just the last output.
	    // Fill inputs with something that keeps output the same.
	    for (i = 0; i != inputCount; i++)
		volts[i] = (lastOutput ^ isInverting()) ? highVoltage : 0;
	}

	double getLeadAdjustment(int ix) { return 0; }
	
	void createEuroGatePolygon() {
	    Point pts[] = newPointArray(4);
	    interpPoint2(lead1, lead2, pts[0], pts[1], 0, hs2);
	    interpPoint2(lead1, lead2, pts[3], pts[2], 1, hs2);
	    gatePoly = createPolygon(pts);
	}

	String getGateText() { return null; }
	static boolean useEuroGates() { return app.menus.euroGatesCheckItem.getState(); }

	void drawGatePolygon(Graphics g) {
	    g.setLineWidth(3.0);
	    g.context.beginPath();
	    if (drawAsAndGate()) {
		g.context.moveTo(gatePoly.xpoints[0], gatePoly.ypoints[0]);
		g.context.lineTo(gatePoly.xpoints[1], gatePoly.ypoints[1]);
		g.context.bezierCurveTo(
		    gatePoly.xpoints[1], gatePoly.ypoints[1],
		    gatePoly.xpoints[2], gatePoly.ypoints[2],
		    gatePoly.xpoints[3], gatePoly.ypoints[3]);
		g.context.bezierCurveTo(
		    gatePoly.xpoints[3], gatePoly.ypoints[3],
		    gatePoly.xpoints[4], gatePoly.ypoints[4],
		    gatePoly.xpoints[5], gatePoly.ypoints[5]);
		g.context.lineTo(gatePoly.xpoints[6], gatePoly.ypoints[6]);
	    } else {
		g.context.moveTo(gatePoly.xpoints[0], gatePoly.ypoints[0]);
		g.context.lineTo(gatePoly.xpoints[1], gatePoly.ypoints[1]);
		g.context.bezierCurveTo(
		    gatePoly.xpoints[2], gatePoly.ypoints[2],
		    gatePoly.xpoints[2], gatePoly.ypoints[2],
		    gatePoly.xpoints[3], gatePoly.ypoints[3]);
		g.context.bezierCurveTo(
		    gatePoly.xpoints[4], gatePoly.ypoints[4],
		    gatePoly.xpoints[4], gatePoly.ypoints[4],
		    gatePoly.xpoints[5], gatePoly.ypoints[5]);
		g.context.lineTo(gatePoly.xpoints[6], gatePoly.ypoints[6]);
		g.context.bezierCurveTo(
		    gatePoly.xpoints[7], gatePoly.ypoints[7],
		    gatePoly.xpoints[7], gatePoly.ypoints[7],
		    gatePoly.xpoints[0], gatePoly.ypoints[0]);
	    }
	    g.context.closePath();

	    if (this instanceof XorGateElm || this instanceof XnorGateElm) {
		g.context.moveTo(gatePoly.xpoints[8], gatePoly.ypoints[8]);
		g.context.bezierCurveTo(
		    gatePoly.xpoints[10], gatePoly.ypoints[10],
		    gatePoly.xpoints[10], gatePoly.ypoints[10],
		    gatePoly.xpoints[9], gatePoly.ypoints[9]);
	    }

	    g.context.stroke();
	    g.setLineWidth(1.0);
	}

	void draw(Graphics g) {
	    int i;
	    for (i = 0; i != inputCount; i++) {
		setVoltageColor(g, volts[i]);
		drawThickLine(g, inPosts[i], inGates[i]);
	    }
	    setVoltageColor(g, volts[inputCount]);
	    drawThickLine(g, lead2, point2);
	    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
	    if (useEuroGates()) {
		drawThickPolygon(g, gatePoly);
		Point center = interpPoint(point1, point2, .5);
		drawCenteredText(g, getGateText(), center.x, center.y-6*gsize, true);
	    } else
	        drawGatePolygon(g);
	    g.setLineWidth(2);
	    if (hasSchmittInputs())
		drawPolygon(g, schmittPoly);
	    g.setLineWidth(1);
	    if (linePoints != null)
		for (i = 0; i != linePoints.length-1; i++)
		    drawThickLine(g, linePoints[i], linePoints[i+1]);
	    if (pcircle != null && (isInverting() ^ hasFlag(FLAG_DEMORGAN)))
		drawThickCircle(g, pcircle.x, pcircle.y, 3);
	    if (icircles != null)
		for (i = 0; i != inputCount; i++)
		    drawThickCircle(g, icircles[i].x, icircles[i].y, 3);
	    curcount = updateDotCount(current, curcount);
	    drawDots(g, lead2, point2, curcount);
	    drawPosts(g);
	}
	Polygon gatePoly, schmittPoly;
	Point pcircle, linePoints[], icircles[];
	int getPostCount() { return inputCount+1; }
	Point getPost(int n) {
	    if (n == inputCount)
		return point2;
	    return inPosts[n];
	}
	int getVoltageSourceCount() { return 1; }
	abstract String getGateName();
	abstract boolean drawAsAndGate();
	void getInfo(String arr[]) {
	    arr[0] = getGateName();
	    arr[1] = "Vout = " + getVoltageText(volts[inputCount]);
	    arr[2] = "Iout = " + getCurrentText(getCurrent());
	    if (propagationDelay > 0)
		arr[3] = "delay = " + getUnitText(propagationDelay, "s");
	}
	void setHighVoltage(double hv) { highVoltage = hv; }

	void stamp() {
	    sim.stampVoltageSource(CircuitNode.ground, nodes[inputCount], voltSource);
	}
	boolean hasSchmittInputs() { return (flags & FLAG_SCHMITT) != 0; }
	boolean getInput(int x) {
	    boolean high = !hasFlag(FLAG_INVERT_INPUTS);
	    if (!hasSchmittInputs())
		return (volts[x] > highVoltage*.5) ? high : !high;
	    // inputStates is normally allocated in setPoints(), but elements inside a
	    // CompositeElm/subcircuit never get setPoints() called, so allocate lazily here too.
	    if (inputStates == null || inputStates.length != inputCount)
		inputStates = new boolean[inputCount];
	    boolean res = volts[x] > highVoltage*(inputStates[x] ? .35 : .55);
	    inputStates[x] = res;
	    return res ? high : !high;
	}
	abstract boolean calcFunction();
	
	int oscillationCount;
	double lastTime;
	
	void doStep() {
	    boolean f = calcFunction();
	    if (isInverting())
		f = !f;

	    if (propagationDelay == 0 && lastTime != sim.t) {
		// detect oscillation (using same strategy as Atanua)
		if (lastOutput == !f) {
		    if (oscillationCount++ > 50) {
			// output is oscillating too much, randomly leave output the same
			oscillationCount = 0;
			if (app.getrand(10) > 5)
			    f = lastOutput;
		    }
		} else
		    oscillationCount = 0;

		lastTime = sim.t;
	    }

	    // apply propagation delay if configured
	    if (propagationDelay > 0) {
		if (f != lastOutput) {
		    // desired output differs from current output
		    if (delayEndTime == 0)
			// start the delay timer on first detection of change
			delayEndTime = sim.t + propagationDelay;
		    else if (sim.t >= delayEndTime) {
			// delay has elapsed, apply the change
			lastOutput = f;
			delayEndTime = 0;
		    }
		} else {
		    // output matches desired; cancel any pending delay
		    delayEndTime = 0;
		}
	    } else {
		lastOutput = f;
	    }

	    double res = lastOutput ? highVoltage : 0;
	    sim.updateVoltageSource(CircuitNode.ground, nodes[inputCount], voltSource, res);
	}
	public EditInfo getEditInfo(int n) {
	    if (n == 0)
		return new EditInfo("# of Inputs", inputCount, 1, 8).
		    setDimensionless();
	    if (n == 1)
		return new EditInfo("High Logic Voltage", highVoltage, 1, 10).setUnitStep();
	    if (n == 2)
		return EditInfo.createCheckbox("Schmitt Inputs", hasSchmittInputs());
	    if (n == 3)
		return EditInfo.createCheckbox("Invert Inputs", hasFlag(FLAG_INVERT_INPUTS));
	    if (n == 4)
		return new EditInfo("Propagation Delay (s)", propagationDelay, 0, 0);
	    if (n == 5)
		return EditInfo.createCheckbox("DeMorgan's Symbol", hasFlag(FLAG_DEMORGAN));
	    return null;
	}

	public void setEditValue(int n, EditInfo ei) {
	    if (n == 0) {
		if (ei.value >= 1) {
		    inputCount = (int) ei.value;
		    allocNodes();
		    setupVolts();
		    setPoints();
		} else
		    ei.setError("must be >= 1");
	    }
	    if (n == 1)
		highVoltage = lastHighVoltage = ei.value;
	    if (n == 2) {
		if (ei.checkbox.getState())
		    flags |= FLAG_SCHMITT;
		else
		    flags &= ~FLAG_SCHMITT;
		lastSchmitt = hasSchmittInputs();
		setPoints();
	    }
	    if (n == 3) {
		// Invert Inputs (3) and DeMorgan's Symbol (5) are mutually exclusive
		if (ei.checkbox.getState()) {
		    flags |= FLAG_INVERT_INPUTS;
		    flags &= ~FLAG_DEMORGAN;
		} else
		    flags &= ~FLAG_INVERT_INPUTS;
		setPoints();
		if (CirSim.editDialog != null)
		    CirSim.editDialog.resetDialog();
	    }
	    if (n == 4)
		propagationDelay = ei.value;
	    if (n == 5) {
		if (ei.checkbox.getState()) {
		    flags |= FLAG_DEMORGAN;
		    flags &= ~FLAG_INVERT_INPUTS;
		} else
		    flags &= ~FLAG_DEMORGAN;
		setPoints();
		if (CirSim.editDialog != null)
		    CirSim.editDialog.resetDialog();
	    }
	}
	// there is no current path through the gate inputs, but there
	// is an indirect path through the output to ground.
	boolean validate() { return validateRailNode(inputCount); }
	boolean getConnection(int n1, int n2) { return false; }
	boolean hasGroundConnection(int n1) {
	    return (n1 == inputCount);
	}
	
	double getCurrentIntoNode(int n) {
	    if (n == inputCount)
		return current;
	    return 0;
	}
    }

