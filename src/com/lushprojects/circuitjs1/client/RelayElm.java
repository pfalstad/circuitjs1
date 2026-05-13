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

import java.util.Vector;

import com.google.gwt.user.client.ui.Button;
import com.lushprojects.circuitjs1.client.util.Locale;

// 0 = switch
// 1 = switch end 1
// 2 = switch end 2
// ...
// 3n   = coil
// 3n+1 = coil
// 3n+2 = end of coil resistor

class RelayElm extends CircuitElm {
    final int FLAG_SWAP_COIL = 1;
    final int FLAG_SHOW_BOX = 2;
    final int FLAG_BOTH_SIDES_COIL = 4;
    final int FLAG_FLIP = 8;
    final int FLAG_PULLDOWN = 16;

    boolean needsPulldown() { return model != null && model.pulldown; }

    int coilStyleFromFlags(int f) {
	if ((f & FLAG_SWAP_COIL) != 0) return 2;
	if ((f & FLAG_BOTH_SIDES_COIL) != 0) return 0;
	return 1;
    }

    String modelName;
    RelayModel model;
    static String lastModelName = "default";

    // convenience accessors so the rest of the code doesn't change
    double inductance()    { return model.inductance; }
    double r_on()          { return model.r_on; }
    double r_off()         { return model.r_off; }
    double onCurrent()     { return model.onCurrent; }
    double offCurrent()    { return model.offCurrent; }
    double coilR()         { return model.coilR; }
    double switchingTime() { return model.switchingTime; }

    Inductor ind;
    Point coilPosts[], coilLeads[], swposts[][], swpoles[][], ptSwitch[];
    Point lines[];
    Point outline[] = newPointArray(4);
    double coilCurrent, switchCurrent[], coilCurCount, switchCurCount[];
    
    // fractional position, between 0 and 1 inclusive
    double d_position;
    
    // integer position, can be 0 (off), 1 (on), 2 (in between)
    int i_position;
    
    int poleCount;
    int openhs, dflip;
    boolean onState;
    final int nSwitch0 = 0;
    final int nSwitch1 = 1;
    final int nSwitch2 = 2;
    int nCoil1, nCoil2, nCoil3;
    double currentOffset1, currentOffset2;
    
    public RelayElm(int xx, int yy) {
	super(xx, yy);
	modelName = lastModelName;
	model = RelayModel.getModelWithName(modelName);
	ind = new Inductor(sim);
	ind.setup(inductance(), 0, Inductor.FLAG_BACK_EULER);
	noDiagonal = true;
	coilCurrent = coilCurCount = 0;
	poleCount = 1;
	setupPoles();
    }

    // old text-format constructor: build a model from the per-element parameters for backward compat
    public RelayElm(int xa, int ya, int xb, int yb, int f,
		    StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	poleCount = new Integer(st.nextToken()).intValue();
	double inductance = new Double(st.nextToken()).doubleValue();
	coilCurrent = new Double(st.nextToken()).doubleValue();
	double r_on = new Double(st.nextToken()).doubleValue();
	double r_off = new Double(st.nextToken()).doubleValue();
	double onCurrent = new Double(st.nextToken()).doubleValue();
	double coilR = new Double(st.nextToken()).doubleValue();
	double offCurrent = onCurrent;
	double switchingTime = 0;
	try {
	    offCurrent = new Double(st.nextToken()).doubleValue();
	    switchingTime = Double.parseDouble(st.nextToken());
	    d_position = i_position = Integer.parseInt(st.nextToken());
	} catch (Exception e) {}
	model = RelayModel.getModelWithParameters(inductance, r_on, r_off, onCurrent, offCurrent, coilR, switchingTime,
	    coilStyleFromFlags(f), (f & FLAG_SHOW_BOX) != 0, (f & FLAG_PULLDOWN) != 0);
	modelName = model.name;
	postUndump();
    }

    void postUndump() {
	if (i_position == 1)
	    onState = true;
	if (i_position == 2)
	    d_position = .5;
	noDiagonal = true;
	ind = new Inductor(sim);
	ind.setup(inductance(), coilCurrent, Inductor.FLAG_BACK_EULER);
	setupPoles();
	allocNodes();
    }

    void setup() {
	model = RelayModel.getModelWithNameOrCopy(modelName, model);
	modelName = model.name;
	ind.setup(inductance(), coilCurrent, Inductor.FLAG_BACK_EULER);
    }

    void updateModels() {
	setup();
	setPoints();
    }

    void newModelCreated(RelayModel rm) {
	model = rm;
	modelName = model.name;
	lastModelName = modelName;
	ind.setup(inductance(), coilCurrent, Inductor.FLAG_BACK_EULER);
    }
    
    void setupPoles() {
	nCoil1 = 3*poleCount;
	nCoil2 = nCoil1+1;
	nCoil3 = nCoil1+2;
	if (switchCurrent == null || switchCurrent.length != poleCount) {
	    switchCurrent = new double[poleCount];
	    switchCurCount = new double[poleCount];
	}
    }
    
    int getDumpType() { return 178; }
    String getXmlDumpType() { return "rl"; }
    
    void dumpXml(Document doc, Element elem) {
	if (!(model.builtIn || model.dumped))
	    model.dumpXml(doc);
	super.dumpXml(doc, elem);
	XMLSerializer.dumpAttr(elem, "po", poleCount);
	XMLSerializer.dumpAttr(elem, "mo", modelName);
    }

    void dumpXmlState(Document doc, Element elem) {
	XMLSerializer.dumpAttr(elem, "i", coilCurrent);
	XMLSerializer.dumpAttr(elem, "ip", i_position);
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	poleCount = xml.parseIntAttr("po", poleCount);
	String mo = xml.parseStringAttr("mo", null);
	if (mo != null) {
	    // new format: model name present
	    modelName = mo;
	    model = RelayModel.getModelWithNameOrCopy(modelName, model);
	    modelName = model.name;
	} else {
	    // old format: read per-element params and create a model from them
	    RelayModel defaults = new RelayModel();
	    double inductance    = xml.parseDoubleAttr("in",   defaults.inductance);
	    double r_on          = xml.parseDoubleAttr("ron",  defaults.r_on);
	    double r_off         = xml.parseDoubleAttr("roff", defaults.r_off);
	    double onCurrent     = xml.parseDoubleAttr("on",   defaults.onCurrent);
	    double coilR         = xml.parseDoubleAttr("coR",  defaults.coilR);
	    double offCurrent    = xml.parseDoubleAttr("of",   defaults.offCurrent);
	    double switchingTime = xml.parseDoubleAttr("sw",   defaults.switchingTime);
	    int coilStyle        = coilStyleFromFlags(flags);
	    boolean showBox      = (flags & FLAG_SHOW_BOX) != 0;
	    boolean pulldown     = (flags & FLAG_PULLDOWN) != 0;
	    model = RelayModel.getModelWithParameters(inductance, r_on, r_off, onCurrent, offCurrent, coilR, switchingTime,
		coilStyle, showBox, pulldown);
	    modelName = model.name;
	}
	coilCurrent = xml.parseDoubleAttr("i", coilCurrent);
	d_position = i_position = xml.parseIntAttr("ip", i_position);
	postUndump();
    }
    
    void draw(Graphics g) {
	int i, p;
	for (i = 0; i != 2; i++) {
	    setVoltageColor(g, volts[nCoil1+i]);
	    drawThickLine(g, coilLeads[i], coilPosts[i]);
	}
	int x = (model.coilStyle == 2) ? 1 : 0;
	setPowerColor(g, coilCurrent * (volts[nCoil1]-volts[nCoil2]));
	drawCoil(g, dflip*6, coilLeads[x], coilLeads[1-x],
		 volts[nCoil1+x], volts[nCoil2-x]);

	// draw rectangle
	if (model.showBox) {
		g.setColor(needsHighlight() ? selectColor : lightGrayColor);
		drawThickLine(g, outline[0], outline[1]);
		drawThickLine(g, outline[1], outline[2]);
		drawThickLine(g, outline[2], outline[3]);
		drawThickLine(g, outline[3], outline[0]);
	}

	// draw lines
	g.setColor(Color.darkGray);
	for (i = 0; i != poleCount; i++) {
	    if (i == 0) {
		int off = (model.coilStyle == 0) ? 4 : 0;
		interpPoint(point1, point2, lines[i*2  ], .5,
			    openhs*2+5*dflip-i*openhs*3+off);
	    } else
		interpPoint(point1, point2, lines[i*2], .5,
			    (int) (openhs*(-i*3+3-.5+d_position))+5*dflip);
	    interpPoint(point1, point2, lines[i*2+1], .5,
			(int) (openhs*(-i*3-.5+d_position))-5*dflip);
	    g.setLineDash(4, 4);
	    g.drawLine(lines[i*2].x, lines[i*2].y, lines[i*2+1].x, lines[i*2+1].y);
	    g.setLineDash(0,  0);
	}
	
	for (p = 0; p != poleCount; p++) {
	    int po = p*3;
	    for (i = 0; i != 3; i++) {
		// draw lead
		setVoltageColor(g, volts[nSwitch0+po+i]);
		drawThickLine(g, swposts[p][i], swpoles[p][i]);
	    }
	    
	    interpPoint(swpoles[p][1], swpoles[p][2], ptSwitch[p], d_position);
	    //setVoltageColor(g, volts[nSwitch0]);
	    g.setColor(Color.lightGray);
	    drawThickLine(g, swpoles[p][0], ptSwitch[p]);
	    switchCurCount[p] = updateDotCount(switchCurrent[p],
					       switchCurCount[p]);
	    drawDots(g, swposts[p][0], swpoles[p][0], switchCurCount[p]);
	    
	    if (i_position != 2)
		drawDots(g, swpoles[p][i_position+1], swposts[p][i_position+1],
			 switchCurCount[p]);
	}
	
	coilCurCount = updateDotCount(coilCurrent, coilCurCount);
	
	if (coilCurCount != 0) {
	    drawDots(g, coilPosts[0], coilLeads[0], coilCurCount);
	    drawDots(g, coilLeads[0], coilLeads[1], addCurCount(coilCurCount, currentOffset1));
	    drawDots(g, coilLeads[1], coilPosts[1], addCurCount(coilCurCount, currentOffset2));
	}
	    
	drawPosts(g);
	setBbox(outline[0], outline[2], 0);
	adjustBbox(coilPosts[0], coilPosts[1]);
	adjustBbox(swposts[0][0], swposts[0][1]);
    }
	
    double getCurrentIntoNode(int n) {
	if (n < 3*poleCount) {
	    int p = n/3;
	    int k = n%3;
	    if (k == 0)
		return -switchCurrent[p];
	    if (k == 1+i_position)
		return switchCurrent[p];
	    return 0;
	}
	if (n == 3*poleCount)
	    return -coilCurrent;
	return coilCurrent;
    }

    void setPoints() {
	super.setPoints();
	setupPoles();
	allocNodes();
	dflip = hasFlag(FLAG_FLIP) ? -dsign : dsign;
	openhs = -dflip*16;

	// switch
	calcLeads(32);
	swposts = new Point[poleCount][3];
	swpoles = new Point[poleCount][3];
	int i, j;
	for (i = 0; i != poleCount; i++) {
	    for (j = 0; j != 3; j++) {
		swposts[i][j] = new Point();
		swpoles[i][j] = new Point();
	    }
	    interpPoint(lead1,  lead2, swpoles[i][0], 0, -openhs*3*i);
	    interpPoint(lead1,  lead2, swpoles[i][1], 1, -openhs*3*i-openhs);
	    interpPoint(lead1,  lead2, swpoles[i][2], 1, -openhs*3*i+openhs);
	    interpPoint(point1, point2, swposts[i][0], 0, -openhs*3*i);
	    interpPoint(point1, point2, swposts[i][1], 1, -openhs*3*i-openhs);
	    interpPoint(point1, point2, swposts[i][2], 1, -openhs*3*i+openhs);
	}

	// coil
	coilPosts = newPointArray(2);
	coilLeads   = newPointArray(2);
	ptSwitch = newPointArray(poleCount);

	int x = (model.coilStyle == 2) ? 1 : 0;
	int boxSize;
	if (model.coilStyle != 0) {
	    interpPoint(point1, point2, coilPosts[0],  x, openhs*2);
	    interpPoint(point1, point2, coilPosts[1],  x, openhs*3);
	    interpPoint(point1, point2, coilLeads[0], .5, openhs*2);
	    interpPoint(point1, point2, coilLeads[1], .5, openhs*3);
	    boxSize = 56;
	} else {
	    interpPoint(point1, point2, coilPosts[0], 0, openhs*2);
	    interpPoint(point1, point2, coilPosts[1], 1, openhs*2);
	    interpPoint(point1, point2, coilLeads[0], .5-16/dn, openhs*2);
	    interpPoint(point1, point2, coilLeads[1], .5+16/dn, openhs*2);
	    boxSize = 40;
	}

	// lines
	lines = newPointArray(poleCount*2);
	
	// outline
	double boxWScale = Math.min(0.4, 25.0 / dn);
	interpPoint(point1, point2, outline[0], 0.5 - boxWScale, -boxSize * dflip);
	interpPoint(point1, point2, outline[1], 0.5 + boxWScale, -boxSize * dflip);
	interpPoint(point1, point2, outline[2], 0.5 + boxWScale, -(openhs*3*poleCount) - (24.0 * dflip));
	interpPoint(point1, point2, outline[3], 0.5 - boxWScale, -(openhs*3*poleCount) - (24.0 * dflip));
	
	currentOffset1 = distance(coilPosts[0], coilLeads[0]);
	currentOffset2 = currentOffset1 + distance(coilLeads[0], coilLeads[1]);
    }
    
    Point getPost(int n) {
	if (n < 3*poleCount)
	    return swposts[n / 3][n % 3];
	return coilPosts[n-3*poleCount];
    }
    int getPostCount() { return 2+poleCount*3; }
    int getInternalNodeCount() { return 1; }
    void reset() {
	super.reset();
	ind.reset();
	coilCurrent = coilCurCount = 0;
	int i;
	for (i = 0; i != poleCount; i++)
	    switchCurrent[i] = switchCurCount[i] = 0;
	d_position = i_position = 0;

	// preserve onState because if we don't, Relay Flip-Flop gets left in a weird state on reset.
	// onState = false;
    }
    double a1, a2, a3, a4;
    void stamp() {
	// inductor from coil post 1 to internal node
	ind.stamp(nodes[nCoil1], nodes[nCoil3]);
	// resistor from internal node to coil post 2
	sim.stampResistor(nodes[nCoil3], nodes[nCoil2], coilR());

	int i;
	for (i = 0; i != poleCount*3; i++)
	    sim.stampNonLinear(nodes[nSwitch0+i]);

	// stamp pulldown resistors from switch contacts to ground using r_off,
	// matching the analog switch approach
	if (needsPulldown()) {
	    for (i = 0; i < poleCount; i++) {
		sim.stampResistor(nodes[nSwitch1+i*3], CircuitNode.ground, r_off());
		sim.stampResistor(nodes[nSwitch2+i*3], CircuitNode.ground, r_off());
	    }
	}
    }

    void startIteration() {
	// using old model?
	if (switchingTime() == 0) {
	    startIterationOld();
	    return;
	}
	ind.startIteration(volts[nCoil1]-volts[nCoil3]);
	double absCurrent = Math.abs(coilCurrent);

	if (onState) {
	    // on or turning on.  check if we need to turn off
	    if (absCurrent < offCurrent()) {
		// turning off, set switch to intermediate position
		onState = false;
		i_position = 2;
	    } else {
		d_position += sim.timeStep/switchingTime();
		if (d_position >= 1)
		    d_position = i_position = 1;
	    }
	} else {
	    // off or turning off.  check if we need to turn on
	    if (absCurrent > onCurrent()) {
		// turning on, set switch to intermediate position
		onState = true;
		i_position = 2;
	    } else {
		d_position -= sim.timeStep/switchingTime();
		if (d_position <= 0)
		    d_position = i_position = 0;
	    }

	}
    }

    void startIterationOld() {
	ind.startIteration(volts[nCoil1]-volts[nCoil3]);

	// magic value to balance operate speed with reset speed not at all realistically
	double magic = 1.3;
	double pmult = Math.sqrt(magic+1);
	double c = onCurrent();
	double p = coilCurrent*pmult/c;
	d_position = Math.abs(p*p) - 1.3;
	if (d_position < 0)
	    d_position = 0;
	if (d_position > 1)
	    d_position = 1;
	if (d_position < .1)
	    i_position = 0;
	else if (d_position > .9)
	    i_position = 1;
	else
	    i_position = 2;
	//System.out.println("ind " + this + " " + current + " " + voltdiff);
    }
    	
    // we need this to be able to change the matrix for each step
    boolean nonLinear() { return true; }

    void doStep() {
	double voltdiff = volts[nCoil1]-volts[nCoil3];
	ind.doStep(voltdiff);
	int p;
	for (p = 0; p != poleCount*3; p += 3) {
	    if (i_position == 0) {
		sim.stampResistor(nodes[nSwitch0+p], nodes[nSwitch1+p], r_on());
		if (!needsPulldown())
		    sim.stampResistor(nodes[nSwitch0+p], nodes[nSwitch2+p], r_off());
	    } else if (i_position == 1) {
		sim.stampResistor(nodes[nSwitch0+p], nodes[nSwitch2+p], r_on());
		if (!needsPulldown())
		    sim.stampResistor(nodes[nSwitch0+p], nodes[nSwitch1+p], r_off());
	    } else {
		// intermediate position: both contacts open, need r_off
		// to avoid floating pole node
		sim.stampResistor(nodes[nSwitch0+p], nodes[nSwitch1+p], r_off());
		sim.stampResistor(nodes[nSwitch0+p], nodes[nSwitch2+p], r_off());
	    }
	}
    }
    void calculateCurrent() {
	double voltdiff = volts[nCoil1]-volts[nCoil3];
	coilCurrent = ind.calculateCurrent(voltdiff);

	// actually this isn't correct, since there is a small amount
	// of current through the switch when off
	int p;
	for (p = 0; p != poleCount; p++) {
	    if (i_position == 2)
		switchCurrent[p] = 0;
	    else
		switchCurrent[p] =
		    (volts[nSwitch0+p*3]-volts[nSwitch1+p*3+i_position])/r_on();
	}
    }
    String getElmType() { return "relay"; }
    void getInfo(String arr[]) {
	arr[0] = Locale.LS("relay");
	if (i_position == 0)
	    arr[0] += " (" + Locale.LS("off") + ")";
	else if (i_position == 1)
	    arr[0] += " (" + Locale.LS("on") + ")";
	if (switchingTime() == 0)
	    arr[0] += " (" + Locale.LS("old model") + ")";
	int i;
	int ln = 1;
	for (i = 0; i != poleCount; i++)
	    arr[ln++] = "I" + (i+1) + " = " + getCurrentDText(switchCurrent[i]);
	arr[ln++] = Locale.LS("coil I") + " = " + getCurrentDText(coilCurrent);
	arr[ln++] = Locale.LS("coil Vd") + " = " +
	    getVoltageDText(volts[nCoil1] - volts[nCoil2]);
    }
    Vector<RelayModel> models;

    public EditInfo getEditInfo(int n) {
	if (n == 0) {
	    EditInfo ei = new EditInfo("Model", 0, -1, -1);
	    models = RelayModel.getModelList();
	    ei.choice = new Choice();
	    for (int i = 0; i != models.size(); i++) {
		RelayModel rm = models.get(i);
		ei.choice.add(rm.getDescription());
		if (rm == model)
		    ei.choice.select(i);
	    }
	    return ei;
	}
	if (n == 1)
	    return new EditInfo("Number of Poles", poleCount, 1, 4).setDimensionless();
	if (n == 2) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.button = new Button(Locale.LS("Create New Model"));
	    return ei;
	}
	if (n == 3) {
	    if (model.readOnly)
		return null;
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.button = new Button(Locale.LS("Edit Model"));
	    return ei;
	}
	return null;
    }

    public void setEditValue(int n, EditInfo ei) {
	if (n == 0) {
	    model = models.get(ei.choice.getSelectedIndex());
	    modelName = model.name;
	    lastModelName = modelName;
	    ind.setup(inductance(), coilCurrent, Inductor.FLAG_BACK_EULER);
	    setPoints();
	    ei.newDialog = true;
	    return;
	}
	if (n == 1) {
	    if (ei.value >= 1) {
		poleCount = (int) ei.value;
		setPoints();
	    } else
		ei.setError("must be >= 1");
	}
	if (n == 2) {
	    RelayModel newModel = new RelayModel(model);
	    EditDialog editDialog = new EditRelayModelDialog(newModel, app, this);
	    CirSim.relayModelEditDialog = editDialog;
	    editDialog.show();
	    return;
	}
	if (n == 3) {
	    if (!model.readOnly) {
		EditDialog editDialog = new EditRelayModelDialog(model, app, null);
		CirSim.relayModelEditDialog = editDialog;
		editDialog.show();
	    }
	    return;
	}
    }
    
    boolean getConnection(int n1, int n2) {
	if (n1 / 3 != n2 / 3)
	    return false;

	// nodes in the same group (both coil or both same switch) are potentially connected
	return true;
    }

    boolean hasGroundConnection(int n) {
	// switch contact nodes have ground connection via pulldown
	return needsPulldown() && n < nCoil1;
    }
    
    int getShortcut() { return 'R'; }

    void flipX(int c2, int count) {
	if (dx == 0)
	    flags ^= FLAG_FLIP;
	super.flipX(c2, count);
    }

    void flipY(int c2, int count) {
	if (dy == 0)
	    flags ^= FLAG_FLIP;
	super.flipY(c2, count);
    }

    void flipXY(int xmy, int count) {
	flags ^= FLAG_FLIP;
	super.flipXY(xmy, count);
    }

}
    
