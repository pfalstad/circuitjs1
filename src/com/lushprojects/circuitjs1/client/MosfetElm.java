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

import com.google.gwt.event.dom.client.MouseWheelEvent;
import com.google.gwt.event.dom.client.MouseWheelHandler;
import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.Document;

import java.util.Vector;

import com.google.gwt.user.client.Window;
import com.google.gwt.user.client.ui.Button;
import com.lushprojects.circuitjs1.client.util.Locale;

class MosfetElm extends CircuitElm implements MouseWheelHandler {
	int pnp;
	int FLAG_PNP = 1;
	int FLAG_SHOWVT = 2;
	int FLAG_DIGITAL = 4;
	int FLAG_FLIP = 8;
	int FLAG_HIDE_BULK = 16;
	int FLAG_BODY_DIODE = 32;
	int FLAG_BODY_TERMINAL = 64;
	int FLAG_SHOW_BODY_DIODE = 128;
	int FLAG_MODEL = 256;
	int FLAGS_GLOBAL = (FLAG_HIDE_BULK|FLAG_DIGITAL|FLAG_SHOW_BODY_DIODE);
	int bodyTerminal;

	double vt;
	// beta = 1/(RdsON*(Vgs-Vt))
	double beta;
	static int globalFlags;
	Diode diodeB1, diodeB2;
	double diodeCurrent1, diodeCurrent2, bodyCurrent;
	double curcount_body1, curcount_body2;
	static double lastBeta;
	String modelName;
	MosfetModel model;
	static String lastModelName = "default";
	
	MosfetElm(int xx, int yy, boolean pnpflag) {
	    super(xx, yy);
	    pnp = (pnpflag) ? -1 : 1;
	    flags = (pnpflag) ? FLAG_PNP : 0;
	    flags |= FLAG_BODY_DIODE;
	    noDiagonal = true;
	    setupDiodes();
	    beta = getDefaultBeta();
	    vt = getDefaultThreshold();
	    if (needsModel()) {
		modelName = lastModelName;
		setup();
	    }
	}

	// return true if this element uses MosfetModel.  JfetElm overrides this.
	boolean needsModel() { return true; }
	
	public MosfetElm(int xa, int ya, int xb, int yb, int f,
			 StringTokenizer st) {
	    super(xa, ya, xb, yb, f);
	    pnp = ((f & FLAG_PNP) != 0) ? -1 : 1;
	    noDiagonal = true;
	    setupDiodes();
	    if ((f & FLAG_MODEL) != 0) {
		modelName = CustomLogicModel.unescape(st.nextToken());
	    } else {
		vt = getDefaultThreshold();
		beta = getBackwardCompatibilityBeta();
		try {
		    vt = new Double(st.nextToken()).doubleValue();
		    beta = new Double(st.nextToken()).doubleValue();
		} catch (Exception e) {}
	    }
	    globalFlags = flags & (FLAGS_GLOBAL);
	    if (modelName != null)
		setup();
	    allocNodes(); // make sure volts[] has the right number of elements when hasBodyTerminal() is true
	}

	void setup() {
	    model = MosfetModel.getModelWithNameOrCopy(modelName, model);
	    modelName = model.name;
	    vt = model.threshold;
	    beta = model.beta;
	}

	public void updateModels() {
	    if (model != null)
		setup();
	}

	// set up body diodes
	void setupDiodes() {
	    // diode from node 1 to body terminal 
	    diodeB1 = new Diode(sim);
	    diodeB1.setupForDefaultModel();
	    // diode from node 2 to body terminal
	    diodeB2 = new Diode(sim);
	    diodeB2.setupForDefaultModel();
	}
	
	double getDefaultThreshold() { return 1.5; }
	
	// default beta for new elements
	double getDefaultBeta() { return lastBeta == 0 ? getBackwardCompatibilityBeta() : lastBeta; }
	
	// default for elements in old files with no configurable beta.  JfetElm overrides this.
	// Not sure where this value came from, but the ZVP3306A has a beta of about .027.  Power MOSFETs have much higher betas (like 80 or more)
	double getBackwardCompatibilityBeta() { return .02; }
	
	boolean nonLinear() { return true; }
	boolean drawDigital() { return (flags & FLAG_DIGITAL) != 0; }
	boolean showBulk() { return (flags & (FLAG_DIGITAL|FLAG_HIDE_BULK)) == 0; }
	boolean hasBodyTerminal() { return (flags & FLAG_BODY_TERMINAL) != 0 && doBodyDiode(); }
	boolean doBodyDiode() { return (flags & FLAG_BODY_DIODE) != 0 && showBulk(); }
	boolean showBodyDiode() { return (flags & FLAG_SHOW_BODY_DIODE) != 0 && doBodyDiode(); }
	void reset() {
	    lastv1 = lastv2 = volts[0] = volts[1] = volts[2] = curcount = 0;
	    curcount_body1 = curcount_body2 = 0;
	    diodeB1.reset();
	    diodeB2.reset();
	    if (doBodyDiode())
		volts[bodyTerminal] = 0;
	}
	public void onMouseWheel(MouseWheelEvent e) {
	    if (CirSim.typeScrollPopup != null && CirSim.typeScrollPopup.isShowing()) {
		CirSim.typeScrollPopup.doDeltaY(e.getDeltaY());
		return;
	    }
	    CirSim.typeScrollPopup = new TypeScrollPopup(
		e.getNativeEvent().getClientX(), e.getNativeEvent().getClientY(),
		e.getDeltaY(), this, app);
	}

	int getDumpType() { return 'f'; }

	String dump() {
	    if (model != null) {
		flags |= FLAG_MODEL;
		return super.dump() + " " + CustomLogicModel.escape(modelName);
	    }
	    return super.dump() + " " + vt + " " + beta;
	}

	String dumpModel() {
	    if (model == null || model.builtIn || model.dumped)
		return null;
	    return model.dump();
	}

	void dumpXml(Document doc, Element elem) {
	    if (model != null && !(model.builtIn || model.dumped))
		model.dumpXml(doc);
	    super.dumpXml(doc, elem);
	    if (model != null) {
		XMLSerializer.dumpAttr(elem, "mo", modelName);
	    } else {
		XMLSerializer.dumpAttr(elem, "vt", vt);
		XMLSerializer.dumpAttr(elem, "be", beta);
	    }
	}

	void dumpXmlModel(Document doc) {
	    if (model != null && !(model.builtIn || model.dumped))
		model.dumpXml(doc);
	}

	void undumpXml(XMLDeserializer xml) {
	    flags = 0;
	    super.undumpXml(xml);
	    modelName = xml.parseStringAttr("mo", null);
	    if (modelName != null) {
		setup();
	    } else {
		vt = xml.parseDoubleAttr("vt", vt);
		beta = xml.parseDoubleAttr("be", beta);
	    }
	    globalFlags = flags & (FLAGS_GLOBAL);
            pnp = ((flags & FLAG_PNP) != 0) ? -1 : 1;
	    allocNodes(); // make sure volts[] has the right number of elements when hasBodyTerminal() is true
	}
	final int hs = 16;
	
	void draw(Graphics g) {
	    // pick up global flags changes
	    if ((flags & FLAGS_GLOBAL) != globalFlags)
		setPoints();
	    
		setBbox(point1, point2, hs);
		
		// draw source/drain terminals
		setVoltageColor(g, volts[1]);
		drawThickLine(g, src[0], src[1]);
		setVoltageColor(g, volts[2]);
		drawThickLine(g, drn[0], drn[1]);
		
		// draw line connecting source and drain
		int segments = 6;
		int i;
		setPowerColor(g, true);
		boolean power = showPower();
		double segf = 1./segments;
		boolean enhancement = vt > 0 && showBulk();
		for (i = 0; i != segments; i++) {
		    if ((i == 1 || i == 4) && enhancement) continue;
		    double v = volts[1]+(volts[2]-volts[1])*i/segments;
		    if (!power)
			setVoltageColor(g, v);
		    interpPoint(src[1], drn[1], ps1, i*segf);
		    interpPoint(src[1], drn[1], ps2, (i+1)*segf);
		    drawThickLine(g, ps1, ps2);
		}
		
		// draw little extensions of that line
		if (!power)
		    setVoltageColor(g, volts[1]);
		drawThickLine(g, src[1], src[2]);
		if (!power)
		    setVoltageColor(g, volts[2]);
		drawThickLine(g, drn[1], drn[2]);
		
		// draw bulk connection
		if (showBulk()) {
		    setVoltageColor(g, volts[bodyTerminal]);
		    if (!hasBodyTerminal())
			drawThickLine(g, pnp == -1 ? drn[0] : src[0], body[0]);
		    drawThickLine(g, body[0], body[1]);
		}

		// draw body diode symbol(s)
		if (showBodyDiode()) {
		    if (!hasBodyTerminal()) {
			// single offset diode with L-shaped leads
			setVoltageColor(g, volts[1]);
			g.fillPolygon(bodyDiodePoly);
			drawThickLine(g, src[0], bodyDiodeLeads[0]);
			drawThickLine(g, bodyDiodeLeads[0], bodyDiodeLeads[1]);
			setVoltageColor(g, volts[2]);
			drawThickLine(g, bodyDiodeCathode[0], bodyDiodeCathode[1]);
			drawThickLine(g, bodyDiodeLeads[2], bodyDiodeLeads[3]);
			drawThickLine(g, drn[0], bodyDiodeLeads[3]);
			adjustBbox(bodyDiodeLeads[0], bodyDiodeLeads[3]);
		    } else {
			// two inline diodes: src↔body and body↔drn
			int anode1 = (pnp == 1) ? bodyTerminal : 1;
			int cathode1 = (pnp == 1) ? 1 : bodyTerminal;
			setVoltageColor(g, volts[anode1]);
			g.fillPolygon(bodyDiodePoly);
			setVoltageColor(g, volts[cathode1]);
			g.drawLine(bodyDiodeCathode[0], bodyDiodeCathode[1]);
			int anode2 = (pnp == 1) ? bodyTerminal : 2;
			int cathode2 = (pnp == 1) ? 2 : bodyTerminal;
			setVoltageColor(g, volts[anode2]);
			g.fillPolygon(bodyDiodePoly2);
			setVoltageColor(g, volts[cathode2]);
			g.drawLine(bodyDiodeCathode2[0], bodyDiodeCathode2[1]);
		    }
		}

		// draw arrow
		if (!drawDigital()) {
		    setVoltageColor(g, volts[bodyTerminal]);
		    g.fillPolygon(arrowPoly);
		}
		if (power)
		    g.setColor(Color.gray);
		
		// draw gate
		setVoltageColor(g, volts[0]);
		drawThickLine(g, point1, gate[1]);
		drawThickLine(g, gate[0], gate[2]);
		if (drawDigital() && pnp == -1)
			drawThickCircle(g, pcircle.x, pcircle.y, pcircler);
		
		if ((flags & FLAG_SHOWVT) != 0) {
			String s = "" + (vt*pnp);
			g.setColor(whiteColor);
			g.setFont(unitsFont);
			drawCenteredText(g, s, x2+2, y2, false);
		}
		curcount = updateDotCount(-ids, curcount);
		drawDots(g, src[0], src[1], curcount);
		drawDots(g, src[1], drn[1], curcount);
		drawDots(g, drn[1], drn[0], curcount);
		
		if (showBulk()) {
		    curcount_body1 = updateDotCount(diodeCurrent1, curcount_body1);
		    curcount_body2 = updateDotCount(diodeCurrent2, curcount_body2);
		    if (showBodyDiode() && !hasBodyTerminal()) {
			double cur = -curcount_body1 + curcount_body2;
			drawDots(g, src [0], bodyDiodeLeads[0], cur);
			drawDots(g, bodyDiodeLeads[0], bodyDiodeLeads[3], cur);
			drawDots(g, bodyDiodeLeads[3], drn [0],  cur);
		    } else {
			drawDots(g, src [0], body[0], -curcount_body1);
			drawDots(g, body[0], drn [0],  curcount_body2);
		    }
		}
		
		// label pins when highlighted
		if (needsHighlight() || isCreating()) {
		    g.setColor(whiteColor);
		    g.setFont(unitsFont);

		    // make fiddly adjustments to pin label locations depending on orientation
		    int dsx = sign(dx);
		    int dsy = sign(dy);
		    int dsyn = dy == 0 ? 0 : 1;

		    g.drawString("G", gate[1].x - (dx < 0 ? -2 : 12), gate[1].y + ((dy > 0) ? -5 : 12));
		    int extra = showBodyDiode() && !hasBodyTerminal() && dy == 0 ? 16*dsign : 0;
		    g.drawString(pnp == -1 ? "D" : "S", src[0].x-3+9*(dsx-dsyn*pnp)+extra, src[0].y+4);
		    g.drawString(pnp == -1 ? "S" : "D", drn[0].x-3+9*(dsx-dsyn*pnp)+extra, drn[0].y+4);
		    if (hasBodyTerminal())
			g.drawString("B",  body[0].x-3+9*(dsx-dsyn*pnp),  body[0].y+4);
		}	    
		
		drawPosts(g);
	}
	
	// post 0 = gate, 1 = source for NPN, 2 = drain for NPN, 3 = body (if present)
	// for PNP, 1 is drain, 2 is source
	Point getPost(int n) {
	    return (n == 0) ? point1 : (n == 1) ? src[0] :
		(n == 2) ? drn[0] : body[0];
	}
	
	double getCurrent() { return ids; }
	double getPower() {
	    return ids*(volts[2]-volts[1]) - diodeCurrent1*(volts[1]-volts[bodyTerminal]) - diodeCurrent2*(volts[2]-volts[bodyTerminal]);
	    }
	int getPostCount() { return hasBodyTerminal() ? 4 : 3; }

	void addRoutingObstacle(WireRouter router) {
	    router.addObstacle(new Point[] { gate[0], gate[2], src[0], drn[0], src[2], drn[2] });
	    router.addWire(point1.x, point1.y, gate[1].x, gate[1].y);
	}

	int pcircler;
	
	// points for source and drain (these are swapped on PNP mosfets)
	Point src[], drn[];
	
	// points for gate, body, and the little circle on PNP mosfets
	Point gate[], body[], pcircle;
	Polygon arrowPoly;
	Polygon bodyDiodePoly, bodyDiodePoly2;
	Point bodyDiodeCathode[], bodyDiodeCathode2[];
	Point bodyDiodeLeads[];
	
	void setPoints() {
	    super.setPoints();

	    // these two flags apply to all mosfets
	    flags &= ~FLAGS_GLOBAL;
	    flags |= globalFlags;
	    
	    // find the coordinates of the various points we need to draw
	    // the MOSFET.
	    int hs2 = hs*dsign;
	    if ((flags & FLAG_FLIP) != 0)
	    	hs2 = -hs2;
	    src = newPointArray(3);
	    drn = newPointArray(3);
	    interpPoint2(point1, point2, src[0], drn[0], 1, -hs2);
	    interpPoint2(point1, point2, src[1], drn[1], 1-22/dn, -hs2);
	    interpPoint2(point1, point2, src[2], drn[2], 1-22/dn, -hs2*4/3);

	    gate = newPointArray(3);
	    interpPoint2(point1, point2, gate[0], gate[2], 1-28/dn, hs2/2); // was 1-20/dn
	    interpPoint(gate[0], gate[2], gate[1], .5);

	    if (showBulk()) {
		body = newPointArray(2);
		interpPoint(src[0], drn[0], body[0], .5);
		interpPoint(src[1], drn[1], body[1], .5);
	    }
	    
	    if (!drawDigital()) {
		if (pnp == 1) {
		    if (!showBulk())
			arrowPoly = calcArrow(src[1], src[0], 10, 4);
		    else
			arrowPoly = calcArrow(body[0], body[1], 12, 5);
		} else {
		    if (!showBulk())
			arrowPoly = calcArrow(drn[0], drn[1], 12, 5);
		    else
			arrowPoly = calcArrow(body[1], body[0], 12, 5);
		}
	    } else if (pnp == -1) {
		interpPoint(point1, point2, gate[1], 1-36/dn);
		int dist = (dsign < 0) ? 32 : 31;
		pcircle = interpPoint(point1, point2, 1-dist/dn);
		pcircler = 3;
	    }

	    if (showBodyDiode()) {
		Point pa[] = newPointArray(2);
		if (!hasBodyTerminal()) {
		    // single diode offset from body line, with L-shaped leads
		    int diodeHs = 6;
		    bodyDiodeCathode = newPointArray(2);
		    bodyDiodeLeads   = newPointArray(4);
		    Point dp1 = interpPoint(src[0], drn[0], .5-(diodeHs/2.)/hs, -hs2);
		    Point dp2 = interpPoint(src[0], drn[0], .5+(diodeHs/2.)/hs, -hs2);
		    interpPoint2(dp1, dp2, pa[0], pa[1], 0, diodeHs);
		    interpPoint2(dp1, dp2, bodyDiodeCathode[0], bodyDiodeCathode[1], 1, diodeHs);
		    bodyDiodePoly = createPolygon(pa[0], pa[1], dp2);
		    bodyDiodeLeads[0] = interpPoint(src[0], drn[0], 0, -hs2);
		    bodyDiodeLeads[1] = dp1;
		    bodyDiodeLeads[2] = dp2;
		    bodyDiodeLeads[3] = interpPoint(src[0], drn[0], 1, -hs2);
		} else {
		    // two inline diodes: src[0]↔body[0] and body[0]↔drn[0], no offset
		    // NPN: anode=body, cathode=src/drn;  PNP: anode=src/drn, cathode=body
		    int diodeHs = 3;
		    bodyDiodeCathode  = newPointArray(2);
		    bodyDiodeCathode2 = newPointArray(2);
		    Point a1  = (pnp == 1) ? body[0] : src[0];
		    Point b1  = (pnp == 1) ? src[0]  : body[0];
		    Point dp1 = interpPoint(a1, b1, .3);
		    Point dp2 = interpPoint(a1, b1, .7);
		    interpPoint2(dp1, dp2, pa[0], pa[1], 0, diodeHs);
		    interpPoint2(dp1, dp2, bodyDiodeCathode[0], bodyDiodeCathode[1], 1, diodeHs);
		    bodyDiodePoly = createPolygon(pa[0], pa[1], dp2);
		    pa = newPointArray(2);
		    Point a2 = (pnp == 1) ? body[0] : drn[0];
		    Point b2 = (pnp == 1) ? drn[0]  : body[0];
		    dp1 = interpPoint(a2, b2, .3);
		    dp2 = interpPoint(a2, b2, .7);
		    interpPoint2(dp1, dp2, pa[0], pa[1], 0, diodeHs);
		    interpPoint2(dp1, dp2, bodyDiodeCathode2[0], bodyDiodeCathode2[1], 1, diodeHs);
		    bodyDiodePoly2 = createPolygon(pa[0], pa[1], dp2);
		}
	    }
	}

	double lastv1, lastv2;
	double ids;
	int mode = 0;
	double gm = 0;
	
	void stamp() {
	    sim.stampNonLinear(nodes[1]);
	    sim.stampNonLinear(nodes[2]);
	    
	    if (hasBodyTerminal())
		bodyTerminal = 3;
	    else
		bodyTerminal = (pnp == -1) ? 2 : 1;

	    if (doBodyDiode()) {
		if (pnp == -1) {
		    // pnp: diodes conduct when S or D are higher than body
		    diodeB1.stamp(nodes[1], nodes[bodyTerminal]);
		    diodeB2.stamp(nodes[2], nodes[bodyTerminal]);
		} else {
		    // npn: diodes conduct when body is higher than S or D
		    diodeB1.stamp(nodes[bodyTerminal], nodes[1]);
		    diodeB2.stamp(nodes[bodyTerminal], nodes[2]);
		}
	    }
	}
	
	boolean nonConvergence(double last, double now) {
	    double diff = Math.abs(last-now);
	    
	    // high beta MOSFETs are more sensitive to small differences, so we are more strict about convergence testing
	    if (beta > 1)
		diff *= 100;
	    
	    // difference of less than 10mV is fine
	    if (diff < .01)
		return false;
	    // larger differences are fine if value is large
	    if (sim.subIterations > 10 && diff < Math.abs(now)*.001)
		return false;
	    // if we're having trouble converging, get more lenient
	    if (sim.subIterations > 100 && diff < .01+(sim.subIterations-100)*.0001)
		return false;
	    return true;
	}
	
	void stepFinished() {
	    calculate(true);
	    
	    // fix current if body is connected to source or drain
	    if (bodyTerminal == 1)
		diodeCurrent1 = -diodeCurrent2;
	    if (bodyTerminal == 2)
		diodeCurrent2 = -diodeCurrent1;
	}

	void doStep() {
	    calculate(false);
	}
	
	double lastv0;
	
	// this is called in doStep to stamp the matrix, and also called in stepFinished() to calculate the current
	void calculate(boolean finished) {
	    double vs[];
	    if (finished)
		vs = volts;
	    else {
		// limit voltage changes to .5V
		vs = new double[3];
		vs[0] = volts[0];
		vs[1] = volts[1];
		vs[2] = volts[2];
		if (vs[1] > lastv1 + .5)
		    vs[1] = lastv1 + .5;
		if (vs[1] < lastv1 - .5)
		    vs[1] = lastv1 - .5;
		if (vs[2] > lastv2 + .5)
		    vs[2] = lastv2 + .5;
		if (vs[2] < lastv2 - .5)
		    vs[2] = lastv2 - .5;
	    }
	    
	    int source = 1;
	    int drain = 2;
	    
	    // if source voltage > drain (for NPN), swap source and drain
	    // (opposite for PNP)
	    if (pnp*vs[1] > pnp*vs[2]) {
	    	source = 2;
	    	drain = 1;
	    }
	    int gate = 0;
	    double vgs = vs[gate ]-vs[source];
	    double vds = vs[drain]-vs[source];
	    if (!finished && (nonConvergence(lastv1, vs[1]) || nonConvergence(lastv2, vs[2]) || nonConvergence(lastv0, vs[0])))
		sim.converged = false;
	    lastv0 = vs[0];
	    lastv1 = vs[1];
	    lastv2 = vs[2];
	    double realvgs = vgs;
	    double realvds = vds;
	    vgs *= pnp;
	    vds *= pnp;
	    ids = 0;
	    gm = 0;
	    double Gds = 0;
	    if (vgs < vt) {
		// should be all zero, but that causes a singular matrix,
		// so instead we treat it as a large resistor
		Gds = 1e-8;
		ids = vds*Gds;
		mode = 0;
	    } else if (vds < vgs-vt) {
		// linear
		ids = beta*((vgs-vt)*vds - vds*vds*.5);
		gm  = beta*vds;
		Gds = beta*(vgs-vds-vt);
		mode = 1;
	    } else {
		// saturation; Gds = 0 without lambda
		double lambda = (model != null) ? model.lambda : 0;
		double vgs_vt = vgs - vt;
		gm  = beta*vgs_vt*(1 + lambda*vds);
		Gds = .5*beta*vgs_vt*vgs_vt*lambda;
		if (Gds < 1e-8) Gds = 1e-8;
		ids = .5*beta*vgs_vt*vgs_vt*(1 + lambda*vds);
		mode = 2;
	    }
	    
	    if (doBodyDiode()) {
		diodeB1.doStep(pnp*(volts[bodyTerminal]-volts[1]));
		diodeCurrent1 = diodeB1.calculateCurrent(pnp*(volts[bodyTerminal]-volts[1]))*pnp;
		diodeB2.doStep(pnp*(volts[bodyTerminal]-volts[2]));
		diodeCurrent2 = diodeB2.calculateCurrent(pnp*(volts[bodyTerminal]-volts[2]))*pnp;
	    } else
		diodeCurrent1 = diodeCurrent2 = 0;

	    double ids0 = ids;
	    
	    // flip ids if we swapped source and drain above
	    if (source == 2 && pnp == 1 ||
		source == 1 && pnp == -1)
		ids = -ids;

	    if (finished)
		return;
	    
	    double rs = -pnp*ids0 + Gds*realvds + gm*realvgs;
	    sim.stampMatrix(nodes[drain],  nodes[drain],  Gds);
	    sim.stampMatrix(nodes[drain],  nodes[source], -Gds-gm); 
	    sim.stampMatrix(nodes[drain],  nodes[gate],   gm);
	    
	    sim.stampMatrix(nodes[source], nodes[drain],  -Gds);
	    sim.stampMatrix(nodes[source], nodes[source], Gds+gm); 
	    sim.stampMatrix(nodes[source], nodes[gate],  -gm);
	    
	    sim.stampRightSide(nodes[drain],  rs);
	    sim.stampRightSide(nodes[source], -rs);
	}
	
	void getFetInfo(String arr[], String n) {
	    arr[0] = Locale.LS(((pnp == -1) ? "p-" : "n-") + n);
	    if (model != null)
		arr[0] += " (" + modelName + ")";
	    else {
		arr[0] += " (Vt=" + getVoltageText(pnp*vt);
		arr[0] += ", \u03b2=" + beta + ")";
	    }
	    arr[1] = ((pnp == 1) ? "Ids = " : "Isd = ") + getCurrentText(ids);
	    arr[2] = "Vgs = " + getVoltageText(volts[0]-volts[pnp == -1 ? 2 : 1]);
	    arr[3] = ((pnp == 1) ? "Vds = " : "Vsd = ") + getVoltageText(volts[2]-volts[1]);
	    arr[4] = Locale.LS((mode == 0) ? "off" :
		(mode == 1) ? "linear" : "saturation");
	    arr[5] = "gm = " + getUnitText(gm, "A/V");
	    arr[6] = "P = " + getUnitText(getPower(), "W");
	    if (showBulk())
		arr[7] = "Ib = " + getUnitText(bodyTerminal == 1 ? -diodeCurrent1 : bodyTerminal == 2 ? diodeCurrent2 : -pnp*(diodeCurrent1+diodeCurrent2), "A");
	}
	String getElmType() { return "MOSFET"; }
	void getInfo(String arr[]) {
	    getFetInfo(arr, "MOSFET");
	}
	@Override String getScopeText(int v) { 
	    return Locale.LS(((pnp == -1) ? "p-" : "n-") + "MOSFET");
	}
	boolean canViewInScope() { return true; }
	double getVoltageDiff() { return volts[2] - volts[1]; }
	boolean getConnection(int n1, int n2) {
	    return !(n1 == 0 || n2 == 0);
	}
	boolean getMatrixConnection(int n1, int n2) { return true; }
	Vector<MosfetModel> models;


	public EditInfo getEditInfo(int n) {
		if (needsModel()) {
		    // model-based dialog
		    if (n == 0) {
			EditInfo ei = new EditInfo("Model", 0, -1, -1);
			models = MosfetModel.getModelList();
			ei.choice = new Choice();
			for (int i = 0; i != models.size(); i++) {
			    MosfetModel mm = models.get(i);
			    ei.choice.add(mm.getDescription());
			    if (mm == model)
				ei.choice.select(i);
			}
			return ei;
		    }
		    if (n == 1) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.checkbox = new Checkbox("Show Bulk", showBulk());
			return ei;
		    }
		    if (n == 2) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.checkbox = new Checkbox("Swap D/S", (flags & FLAG_FLIP) != 0);
			return ei;
		    }
		    if (n == 3 && !showBulk()) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.checkbox = new Checkbox("Digital Symbol", drawDigital());
			return ei;
		    }
		    if (n == 3 && showBulk()) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.checkbox = new Checkbox("Simulate Body Diode", (flags & FLAG_BODY_DIODE) != 0);
			return ei;
		    }
		    if (n == 4 && doBodyDiode()) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.checkbox = new Checkbox("Body Terminal", (flags & FLAG_BODY_TERMINAL) != 0);
			return ei;
		    }
		    // model buttons after checkboxes
		    int modelBase = doBodyDiode() ? 5 : 4;
		    if (n == modelBase) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.button = new Button(Locale.LS("Create New Model"));
			return ei;
		    }
		    if (n == modelBase + 1) {
			if (model.readOnly)
			    return null;
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.button = new Button(Locale.LS("Edit Model"));
			return ei;
		    }
		    return null;
		}
		// no model (JfetElm or legacy)
		if (n == 0)
			return new EditInfo("Threshold Voltage", pnp*vt, .01, 5);
		if (n == 1)
			return new EditInfo(EditInfo.makeLink("mosfet-beta.html", "Beta"), beta, .01, 5).setPositive();
		if (n == 2) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.checkbox = new Checkbox("Show Bulk", showBulk());
			return ei;
		}
		if (n == 3) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.checkbox = new Checkbox("Swap D/S", (flags & FLAG_FLIP) != 0);
			return ei;
		}
		if (n == 4 && !showBulk()) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.checkbox = new Checkbox("Digital Symbol", drawDigital());
			return ei;
		}
		if (n == 4 && showBulk()) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.checkbox = new Checkbox("Simulate Body Diode", (flags & FLAG_BODY_DIODE) != 0);
			return ei;
		}
		if (n == 5 && doBodyDiode()) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.checkbox = new Checkbox("Body Terminal", (flags & FLAG_BODY_TERMINAL) != 0);
			return ei;
		}
		if (n == 6 && doBodyDiode()) {
			EditInfo ei = new EditInfo("", 0, -1, -1);
			ei.checkbox = new Checkbox("Show Body Diode", showBodyDiode());
			return ei;
		}

		return null;
	}

	public void newModelCreated(MosfetModel mm) {
	    model = mm;
	    modelName = model.name;
	    setup();
	}

	void setLastModelName(String n) {
	    lastModelName = n;
	}
	public void setEditValue(int n, EditInfo ei) {
		if (needsModel()) {
		    // model-based dialog
		    if (n == 0) {
			model = models.get(ei.choice.getSelectedIndex());
			modelName = model.name;
			lastModelName = modelName;
			setup();
			ei.newDialog = true;
			return;
		    }
		    if (n == 1) {
			globalFlags = (!ei.checkbox.getState()) ? (globalFlags|FLAG_HIDE_BULK) :
				    (globalFlags & ~(FLAG_HIDE_BULK|FLAG_DIGITAL));
			ei.newDialog = true;
		    }
		    if (n == 2) {
			flags = (ei.checkbox.getState()) ? (flags | FLAG_FLIP) :
				    (flags & ~FLAG_FLIP);
		    }
		    if (n == 3 && !showBulk()) {
			globalFlags = (ei.checkbox.getState()) ? (globalFlags|FLAG_DIGITAL) :
				    (globalFlags & ~FLAG_DIGITAL);
		    }
		    if (n == 3 && showBulk()) {
			flags = ei.changeFlag(flags, FLAG_BODY_DIODE);
			ei.newDialog = true;
		    }
		    if (n == 4 && doBodyDiode()) {
			flags = ei.changeFlag(flags, FLAG_BODY_TERMINAL);
		    }
		    // model buttons
		    int modelBase = doBodyDiode() ? 5 : 4;
		    if (n == modelBase) {
			MosfetModel newModel = new MosfetModel(model);
			EditDialog editDialog = new EditMosfetModelDialog(newModel, app, this);
			CirSim.mosfetModelEditDialog = editDialog;
			editDialog.show();
			return;
		    }
		    if (n == modelBase + 1) {
			if (model.readOnly) {
			    Window.alert(Locale.LS("This model cannot be modified.  Change the model name to allow customization."));
			    return;
			}
			EditDialog editDialog = new EditMosfetModelDialog(model, app, null);
			CirSim.mosfetModelEditDialog = editDialog;
			editDialog.show();
			return;
		    }
		} else {
		    // no model (JfetElm or legacy)
		    if (n == 0)
			vt = pnp*ei.value;
		    if (n == 1 && ei.value > 0)
			beta = lastBeta = ei.value;
		    if (n == 2) {
			globalFlags = (!ei.checkbox.getState()) ? (globalFlags|FLAG_HIDE_BULK) :
				    (globalFlags & ~(FLAG_HIDE_BULK|FLAG_DIGITAL));
			ei.newDialog = true;
		    }
		    if (n == 3) {
			flags = (ei.checkbox.getState()) ? (flags | FLAG_FLIP) :
				    (flags & ~FLAG_FLIP);
		    }
		    if (n == 4 && !showBulk()) {
			globalFlags = (ei.checkbox.getState()) ? (globalFlags|FLAG_DIGITAL) :
				    (globalFlags & ~FLAG_DIGITAL);
		    }
		    if (n == 4 && showBulk()) {
			flags = ei.changeFlag(flags, FLAG_BODY_DIODE);
			ei.newDialog = true;
		    }
		    if (n == 5) {
			flags = ei.changeFlag(flags, FLAG_BODY_TERMINAL);
		    }
		}
		if (n == 6) {
		    globalFlags = ei.changeFlag(globalFlags, FLAG_SHOW_BODY_DIODE);
		}

		// lots of different cases where the body terminal might have gotten removed/added so just do this all the time
		allocNodes();
		setPoints();
	}
	double getCurrentIntoNode(int n) {
	    if (n == 0)
		return 0;
	    if (n == 3)
		return -diodeCurrent1 - diodeCurrent2;
	    if (n == 1)
		return ids + diodeCurrent1;
	    return -ids + diodeCurrent2;
	}

        void flipX(int c2, int count) {
            if (x == x2)
                flags ^= FLAG_FLIP;
            super.flipX(c2, count);
        }

        void flipY(int c2, int count) {
            if (y == y2)
                flags ^= FLAG_FLIP;
            super.flipY(c2, count);
        }

        void flipXY(int xmy, int count) {
	    flags ^= FLAG_FLIP;
            super.flipXY(xmy, count);
        }
    }
