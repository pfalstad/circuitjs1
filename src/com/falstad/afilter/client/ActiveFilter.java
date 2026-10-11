package com.falstad.afilter.client;

import com.google.gwt.xml.client.Element;

// Cascade of op-amp stages, one per complex pole pair (biquad) or real pole.
// The circuit is generated in code from the filter parameters; subclasses
// build each stage and compute its component values.
class ActiveFilter extends FilterCustomizer {
    Scrollbar bwslider;
    int initBw = -1;

    // generated circuit
    String builtKey;
    Complex stagePoles[];   // pole with im >= 0 for each stage
    BoxElm boxes[];
    ResistorElm res[][];
    CapacitorElm caps[][];

    static final int X0 = 224, Y = 184, SW = 152;

    public ActiveFilter(int f, StringTokenizer st) {
	super(f, st);
	if (st == null)
	    return;
	// optional parameter added for generated circuits
	if (st.hasMoreTokens())
	    initPoles = new Integer(st.nextToken()).intValue();
    }

    void dumpXml(Element elem) {
	super.dumpXml(elem);
	if (pslider != null)
	    XMLSerializer.dumpAttr(elem, "n", pslider.getValue());
	if (bwslider != null)
	    XMLSerializer.dumpAttr(elem, "gb", bwslider.getValue());
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	int n = xml.parseIntAttr("n", -1);
	if (n >= 0)
	    initPoles = n;
	else if (initPoles >= 0)
	    initPoles *= 2;  // older files stored the number of 2-pole sections
	initBw = xml.parseIntAttr("gb", -1);
    }

    // slider gives the order of the lowpass prototype
    int getMaxPoles() { return 14; }
    int getDefaultPoles() { return 2; }
    int getPoleCount() {
	if (pslider == null)
	    return -1;
	int v = pslider.getValue();
	return isBand() ? v*2 : v;
    }

    void create() {
	super.create();
	bwslider = createSlider("Gain-BW Product", initBw >= 0 ? initBw : 6, 5, 10);
	bwChanged();
    }

    void slidersChanged(Scrollbar s) {
	super.slidersChanged(s);
	if (s == bwslider)
	    bwChanged();
    }

    void bwChanged() {
	if (bwslider == null)
	    return;
	int i;
	double bw = Math.pow(10, bwslider.getValue());
	for (i = 0; i != sim.countElm(OpAmpElm.class); i++) {
	    CircuitElm ce = sim.getElm(i, OpAmpElm.class);
	    ((OpAmpElm) ce).setGainProduct(bw);
	}
	sim.needAnalyze();
    }

    void polesChanged() {
	frequencyChanged();
    }

    static boolean isReal(Complex p) {
	return Math.abs(p.im) <= 1e-9*p.mag();
    }

    static double getQ(Complex p) {
	return -p.mag()/(2*p.re);
    }

    // one pole per stage, real poles first, then pairs in order of increasing Q
    Complex [] getStagePoles() {
	Complex parr[] = getPoles();
	int i, j, n = 0;
	Complex sp[] = new Complex[parr.length];
	for (i = 0; i != parr.length; i++)
	    if (parr[i].im >= 0 || isReal(parr[i]))
		sp[n++] = parr[i];
	Complex r[] = new Complex[n];
	for (i = 0; i != n; i++)
	    r[i] = sp[i];
	for (i = 1; i < n; i++)
	    for (j = i; j > 0 && stageOrder(r[j]) < stageOrder(r[j-1]); j--) {
		Complex t = r[j];
		r[j] = r[j-1];
		r[j-1] = t;
	    }
	return r;
    }

    double stageOrder(Complex p) { return isReal(p) ? 0 : getQ(p); }

    void frequencyChanged() {
	if (pslider == null)
	    return;
	Complex sp[] = getStagePoles();
	String key = "";
	int i;
	for (i = 0; i != sp.length; i++)
	    key += isReal(sp[i]) ? 'r' : 'c';
	if (!key.equals(builtKey)) {
	    rebuild(sp);
	    builtKey = key;
	}
	stagePoles = sp;
	setValues();
	for (i = 0; i != sp.length; i++)
	    boxes[i].setText(isReal(sp[i]) ? "1st order" :
			     "Q = " + CircuitElm.showFormat.format(getQ(sp[i])));
	sim.needAnalyze();
    }

    void setValues() {}

    // build the circuit: source, one stage per entry in sp, output
    void rebuild(Complex sp[]) {
	int n = sp.length;
	int i;
	clearCircuit(X0, Y);
	boxes = new BoxElm[n];
	res = new ResistorElm[n][];
	caps = new CapacitorElm[n][];
	int x = X0;
	for (i = 0; i != n; i++) {
	    boxes[i] = (BoxElm) add("B " + x + " " + (Y-80) + " " + (x+SW) + " " + (Y+144) + " 1 Box");
	    buildStage(i, x, isReal(sp[i]));
	    x += SW;
	}
	add('O', x, Y, x+48, Y, "");
	bwChanged();
	sim.centerCircuit();
    }

    void buildStage(int i, int x, boolean real) {}

    ResistorElm addRes(int x1, int y1, int x2, int y2) { return (ResistorElm) add('r', x1, y1, x2, y2, "100"); }
    CapacitorElm addCap(int x1, int y1, int x2, int y2) { return (CapacitorElm) add('c', x1, y1, x2, y2, "1e-6 0"); }
    // small op-amp; swap puts the inverting input on the bottom
    void addOpAmp(int x1, int y1, int x2, int y2, boolean swap) {
	add("a " + x1 + " " + y1 + " " + x2 + " " + y2 + " " + (swap ? 3 : 2) + " 15 -15");
    }
    void addGround(int x, int y) { add('g', x, y, x, y+16, ""); }

    // unity-gain Sallen-Key stage, or a first-order RC section followed by a
    // voltage follower.  Lowpass has resistors in the signal path and
    // capacitors to ground and output; highpass is the reverse.
    void buildSallenKey(int i, int x, boolean real, boolean hp) {
	int y = Y;
	CircuitElm s1, s2 = null, g1, f1 = null;
	if (real)
	    s1 = addSeries(hp, x, y, x+96, y);
	else {
	    s1 = addSeries(hp, x, y, x+48, y);
	    s2 = addSeries(hp, x+48, y, x+96, y);
	    // feedback element from middle node to output
	    addWire(x+48, y-48, x+48, y);
	    f1 = addSeries(!hp, x+48, y-48, x+SW, y-48);
	    addWire(x+SW, y, x+SW, y-48);
	}
	// shunt element to ground
	addWire(x+96, y, x+96, y+64);
	g1 = addSeries(!hp, x+96, y+64, x+96, y+120);
	addGround(x+96, y+120);

	// voltage follower
	addOpAmp(x+112, y+8, x+SW, y+8, true);
	addWire(x+112, y, x+96, y);
	addWire(x+112, y+16, x+112, y+64);
	addWire(x+112, y+64, x+SW, y+64);
	addWire(x+SW, y+64, x+SW, y+8);
	addWire(x+SW, y+8, x+SW, y);

	// resistors and capacitors in order: series, series, shunt, feedback
	CircuitElm all[] = { s1, s2, g1, f1 };
	int nr = 0, nc = 0, j;
	for (j = 0; j != 4; j++) {
	    if (all[j] instanceof ResistorElm) nr++;
	    if (all[j] instanceof CapacitorElm) nc++;
	}
	res[i] = new ResistorElm[nr];
	caps[i] = new CapacitorElm[nc];
	nr = nc = 0;
	for (j = 0; j != 4; j++) {
	    if (all[j] instanceof ResistorElm) res[i][nr++] = (ResistorElm) all[j];
	    if (all[j] instanceof CapacitorElm) caps[i][nc++] = (CapacitorElm) all[j];
	}
    }

    CircuitElm addSeries(boolean cap, int x1, int y1, int x2, int y2) {
	return cap ? (CircuitElm) addCap(x1, y1, x2, y2) : (CircuitElm) addRes(x1, y1, x2, y2);
    }

    // choose a capacitor value (starting at 1 mF) small enough that the
    // resistor 1/(k*cx) is over 100 ohms
    static double pickCap(double k) {
	double cx = 1e-3;
	while (1/(k*cx) <= 100)
	    cx /= 10;
	return cx;
    }

    boolean isPoleSelected(Complex p, CircuitElm mouseElm) {
	if (stagePoles == null || boxes == null || mouseElm == null)
	    return false;
	// find the stage whose pole is nearest p
	int i, best = -1;
	double bestd = 0;
	Complex pc = new Complex(p);
	if (pc.im < 0)
	    pc.conjugate();
	for (i = 0; i != stagePoles.length; i++) {
	    Complex d = new Complex(pc);
	    d.subtract(stagePoles[i]);
	    double dm = d.mag();
	    if (best < 0 || dm < bestd) {
		best = i;
		bestd = dm;
	    }
	}
	return best >= 0 && boxes[best] == mouseElm;
    }
};
