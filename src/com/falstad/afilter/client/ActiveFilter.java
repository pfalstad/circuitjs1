package com.falstad.afilter.client;

import com.google.gwt.xml.client.Element;

// Cascade of op-amp stages, one per complex pole pair (biquad) or real pole.
// The circuit is generated in code from the filter parameters; subclasses
// build each stage and compute its component values.  Biquads with finite
// transmission zeros (inverse Chebyshev) use a Boctor notch stage.
class ActiveFilter extends FilterCustomizer {
    Scrollbar bwslider;
    int initBw = -1;

    // generated circuit
    // stage types: r = real pole, c = biquad, l = lowpass notch, h = highpass
    // notch, L, H = notch with gain scaling
    String builtKey;
    Complex stagePoles[];   // pole with im >= 0 for each stage
    double stageZeros[];    // frequency of the stage's pair of zeros on the jw axis, or 0
    double stageScales[];   // gain scaling of each notch stage
    BoxElm boxes[];
    ResistorElm res[][];
    CapacitorElm caps[][];
    // gain of the circuit at the frequency corresponding to DC in the lowpass
    // prototype (0, infinity, or the center frequency)
    double circuitGain = 1;

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

    boolean hasInvCheby() { return true; }
    // an active filter can have a nonzero response at infinity
    boolean needsZeroAtInfinity() { return false; }

    double getScaleFactor(double w, Complex poles[]) {
	return getRefScaleFactor(circuitGain, poles);
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

    // frequency separating stages that get zeros above their poles from those
    // that get zeros below
    double getSplitFreq() {
	return isBandPass() ? 2*Math.PI*cfrequency : isHiPass() ? Double.MAX_VALUE : 0;
    }

    // assign each pair of zeros on the jw axis to a stage, as in the lowpass
    // prototype, where the pole pair with the highest Q goes with the lowest
    // zero, the next highest with the next lowest, and so on.  That way each
    // lowpass zero is above its pole.  For highpass the order of the zeros is
    // reversed, and bandpass is lowpass above the center frequency and
    // highpass below.  sp is in order of increasing Q.
    double [] getStageZeros(Complex sp[]) {
	double sz[] = new double[sp.length];
	Complex zeros[] = getZeros();
	if (zeros == null)
	    return sz;
	double split = getSplitFreq();
	int i, j, nz = 0;
	double z[] = new double[zeros.length];
	for (i = 0; i != zeros.length; i++)
	    if (zeros[i].im > 0)
		z[nz++] = zeros[i].im;
	java.util.Arrays.sort(z, 0, nz);
	boolean skip[] = new boolean[sp.length];
	int nc = 0;
	for (i = 0; i != sp.length; i++) {
	    skip[i] = isReal(sp[i]);
	    if (!skip[i])
		nc++;
	}
	// odd order bandpass: the stage from the prototype's real pole, which
	// is centered on the center frequency, has no zeros
	while (nc > nz) {
	    int best = -1;
	    double bestd = 0;
	    for (i = 0; i != sp.length; i++) {
		if (skip[i])
		    continue;
		double d = Math.abs(Math.log(sp[i].mag()/split));
		if (best < 0 || d < bestd) {
		    best = i;
		    bestd = d;
		}
	    }
	    skip[best] = true;
	    nc--;
	}
	// zeros above split go up from z[up]; zeros below go down from z[dn]
	int up = 0;
	while (up < nz && z[up] <= split)
	    up++;
	int dn = up-1;
	for (i = sp.length-1; i >= 0; i--) {
	    if (skip[i])
		continue;
	    if (sp[i].mag() > split) {
		if (up < nz)
		    sz[i] = z[up++];
	    } else if (dn >= 0)
		sz[i] = z[dn--];
	}
	return sz;
    }

    // gain of a Boctor stage at the reference frequency (see circuitGain), with
    // unity gain at DC (lowpass notch) or infinity (highpass notch)
    double getBoctorGain(Complex p, double wz) {
	double w0 = p.mag();
	double h = (wz > w0) ? w0*w0/(wz*wz) : 1;
	if (isHiPass())
	    return h;
	double wr = isBandPass() ? 2*Math.PI*cfrequency : 0;
	return h*Math.abs(wz*wz-wr*wr)/Math.hypot(w0*w0-wr*wr, wr*w0/getQ(p));
    }

    // Bandpass stages have Q peaking at the center frequency, so scale the
    // gain of the notch stages to make the overall gain 1 there.  Lowpass
    // notch stages can only lower their gain, and highpass notch stages
    // can only raise it.  Returns the scale for each stage.
    double [] getStageScales(Complex sp[], double sz[]) {
	double sc[] = new double[sp.length];
	int i, nl = 0, nh = 0;
	double g = 1;
	for (i = 0; i != sp.length; i++) {
	    sc[i] = 1;
	    if (sz[i] == 0)
		continue;
	    g *= getBoctorGain(sp[i], sz[i]);
	    if (sz[i] > sp[i].mag())
		nl++;
	    else
		nh++;
	}
	boolean lower = g > 1+1e-6 && nl > 0;
	boolean raise = g < 1-1e-6 && nh > 0;
	for (i = 0; i != sp.length; i++) {
	    if (sz[i] == 0)
		continue;
	    boolean lpn = sz[i] > sp[i].mag();
	    if (lpn ? lower : raise)
		sc[i] = Math.pow(g, -1./(lpn ? nl : nh));
	}
	return sc;
    }

    boolean isBoctor(int i) {
	char c = builtKey.charAt(i);
	return c == 'l' || c == 'h' || c == 'L' || c == 'H';
    }

    void frequencyChanged() {
	if (pslider == null)
	    return;
	Complex sp[] = getStagePoles();
	double sz[] = getStageZeros(sp);
	double sc[] = getStageScales(sp, sz);
	String key = "";
	int i;
	for (i = 0; i != sp.length; i++) {
	    char c = isReal(sp[i]) ? 'r' : sz[i] == 0 ? 'c' : sz[i] > sp[i].mag() ? 'l' : 'h';
	    if (sc[i] != 1)
		c = Character.toUpperCase(c);
	    key += c;
	}
	if (!key.equals(builtKey)) {
	    builtKey = key;
	    rebuild(sp);
	}
	stagePoles = sp;
	stageZeros = sz;
	stageScales = sc;
	circuitGain = 1;
	setValues();
	for (i = 0; i != sp.length; i++) {
	    String txt = isReal(sp[i]) ? "1st order" :
		"Q = " + CircuitElm.showFormat.format(getQ(sp[i]));
	    if (sz[i] > 0)
		txt += ", notch " + CircuitElm.getUnitText(sz[i]/(2*Math.PI), "Hz");
	    boxes[i].setText(txt);
	}
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
	// Boctor stages are taller, so make all the boxes that size if there are any
	boolean tall = false;
	for (i = 0; i != n; i++)
	    tall |= isBoctor(i);
	int top = tall ? Y-128 : Y-80;
	int bot = tall ? Y+176 : Y+144;
	for (i = 0; i != n; i++) {
	    int w = isBoctor(i) ? BW : getStageWidth();
	    boxes[i] = (BoxElm) add("B " + x + " " + top + " " + (x+w) + " " + bot + " 1 Box");
	    if (isBoctor(i))
		buildBoctor(i, x, Character.toLowerCase(builtKey.charAt(i)) == 'l',
			    Character.isUpperCase(builtKey.charAt(i)));
	    else
		buildStage(i, x, isReal(sp[i]));
	    x += w;
	}
	add('O', x, Y, x+48, Y, "");
	bwChanged();
	sim.centerCircuit();
    }

    void buildStage(int i, int x, boolean real) {}
    int getStageWidth() { return SW; }

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

    static final int BW = 240;

    // single op-amp Boctor notch stage, H(s^2+wz^2)/(s^2+s w0/Q+w0^2).  The
    // lowpass notch (wz > w0) omits R2 and the highpass notch (wz < w0) omits
    // R4 from the circuits in Analog Devices' Basic Linear Design, ch. 8,
    // which gives unity gain at DC or at infinity respectively.  To scale the
    // gain, the lowpass notch splits C2 into a capacitive divider, and the
    // highpass notch keeps R4.
    void buildBoctor(int i, int x, boolean lpn, boolean scaled) {
	int y = Y;
	res[i] = new ResistorElm[(scaled && !lpn) ? 6 : 5];
	caps[i] = new CapacitorElm[(scaled && lpn) ? 3 : 2];
	// short lead so the input wire doesn't overlap the previous stage
	addWire(x, y, x+16, y);
	x += 16;
	// leave room for the values of the vertical parts left of the op-amp
	addOpAmp(x+160, y+8, x+208, y+8, false);
	addWire(x+208, y+8, x+208, y);
	addWire(x+208, y, x+224, y);
	addWire(x+112, y, x+160, y);
	addWire(x+160, y+16, x+160, y+64);
	addWire(x, y, x, y+64);
	if (lpn) {
	    // res: R1 R3 R4 R5 R6; caps: C1 C2
	    caps[i][1] = addCap(x, y, x+48, y);
	    res[i][4] = addRes(x+48, y, x+112, y);
	    addWire(x+112, y, x+112, y-48);
	    caps[i][0] = addCap(x+112, y-48, x+208, y-48);
	    addWire(x+208, y, x+208, y-48);
	    addWire(x+48, y, x+48, y-96);
	    res[i][2] = addRes(x+48, y-96, x+208, y-96);
	    addWire(x+208, y-48, x+208, y-96);
	    res[i][0] = addRes(x+112, y, x+112, y+48);
	    addGround(x+112, y+48);
	    if (scaled) {
		caps[i][2] = addCap(x+48, y, x+48, y+48);
		addGround(x+48, y+48);
	    }
	    // input divider to the noninverting input
	    addWire(x, y+64, x, y+96);
	    res[i][1] = addRes(x, y+96, x+64, y+96);
	    addWire(x+64, y+96, x+160, y+96);
	    addWire(x+160, y+64, x+160, y+96);
	    res[i][3] = addRes(x+160, y+96, x+160, y+144);
	    addGround(x+160, y+144);
	} else {
	    // res: R1 R2 R3 R5 R6; caps: C1 C2
	    caps[i][1] = addCap(x, y, x+48, y);
	    res[i][1] = addRes(x+48, y, x+112, y);
	    addWire(x+112, y, x+112, y-48);
	    res[i][3] = addRes(x+112, y-48, x+208, y-48);
	    addWire(x+208, y, x+208, y-48);
	    if (scaled) {
		addWire(x+112, y-48, x+112, y-96);
		res[i][5] = addRes(x+112, y-96, x+48, y-96);
		addGround(x+48, y-96);
	    }
	    // noninverting input
	    addWire(x, y+64, x+96, y+64);
	    caps[i][0] = addCap(x+96, y+64, x+160, y+64);
	    res[i][2] = addRes(x+160, y+64, x+208, y+64);
	    addWire(x+208, y+64, x+208, y+8);
	    addWire(x, y+64, x, y+96);
	    res[i][0] = addRes(x, y+96, x+64, y+96);
	    addWire(x+64, y+96, x+160, y+96);
	    addWire(x+160, y+64, x+160, y+96);
	    res[i][4] = addRes(x+160, y+96, x+160, y+144);
	    addGround(x+160, y+144);
	}
    }

    // Boctor stage values (see buildBoctor).  Returns the gain at the
    // reference frequency (see circuitGain).
    double setBoctor(int i) {
	Complex p = stagePoles[i];
	double w0 = p.mag();
	double q = getQ(p);
	double wz = stageZeros[i];
	double sc = stageScales[i];
	// values normalized to w0 = 1 and C2 = 1
	double x = wz*wz/(w0*w0);
	double r[], c1;
	boolean lpn = Character.toLowerCase(builtKey.charAt(i)) == 'l';
	if (lpn) {
	    // DC gain sc.  The numerator's s term vanishes when
	    // R3/R5 = (1+rho)/sc - 1, rho = (C1/C2)(1+R6/R4) + R6/R1
	    double g6 = 1/(q*(1+q*q*(x-1)));
	    double g4 = 1/q-g6;
	    double g1 = q*(x-1)*g4*g6;
	    c1 = g4*g6;
	    double rho = c1*(1+g4/g6) + g1/g6;
	    r = new double[] { 1/g1, (1+rho)/sc-1, 1/g4, 1, 1/g6 };
	} else {
	    // gain sc = 1+R5/R4 at infinity, C1 = C2
	    double g2 = Math.max(1, Math.max(2*q*(1-x), 1/q));
	    double g1 = x/g2;
	    double u = (g2+1/g2-1/q)/g2;
	    double g3 = u*(1-x)/(sc*(1/q-(1-x)/g2));
	    double r5 = u/g3;
	    double g6 = (1-x)/g2 + (sc-1)*g3;
	    c1 = 1;
	    r = (sc == 1) ? new double[] { 1/g1, 1/g2, 1/g3, r5, 1/g6 } :
		new double[] { 1/g1, 1/g2, 1/g3, r5, 1/g6, r5/(sc-1) };
	}
	// choose C2 so the smallest resistor is over 100 ohms
	double rmin = r[0];
	int j;
	for (j = 1; j != r.length; j++)
	    rmin = Math.min(rmin, r[j]);
	double c2 = pickCap(w0/rmin);
	for (j = 0; j != r.length; j++)
	    res[i][j].setValue(r[j]/(w0*c2));
	caps[i][0].setValue(c1*c2);
	if (lpn && sc != 1) {
	    caps[i][1].setValue(sc*c2);
	    caps[i][2].setValue((1-sc)*c2);
	} else
	    caps[i][1].setValue(c2);
	return sc*getBoctorGain(p, wz);
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
