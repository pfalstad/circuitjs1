package com.falstad.afilter.client;

import com.google.gwt.event.dom.client.ChangeEvent;
import com.google.gwt.event.dom.client.ChangeHandler;
import com.google.gwt.xml.client.Element;
import java.util.Vector;

// LC ladder filter.  The circuit is generated in code from the filter
// parameters, so any order, termination and topology can be built.
class PassiveFilter extends FilterCustomizer {
    boolean hasSource;    // nonzero source resistance (else ideal source)
    boolean shuntFirst;   // first ladder element is a shunt element
    double rsrc = 50;     // source resistance, if hasSource
    double rload = 50;    // requested load resistance.  the actual load may differ
                          // if the design can't realize this ratio to rsrc.
    Choice sourceChooser, firstChooser;

    // generated circuit
    String builtKey;
    Vector<CircuitElm> elms;   // inductors and capacitors, in the order of Net.getLeaves()
    ResistorElm srcRes, loadRes;
    LadderSynth synth;

    static final int X0 = 304, TOP = 176, BOT = TOP+128, SEG = 64;

    public PassiveFilter(int f, StringTokenizer st) {
	super(f, st);
	if (st == null)
	    return;
	// optional parameters added for generated circuits
	if (st.hasMoreTokens())
	    initPoles = new Integer(st.nextToken()).intValue();
	if (st.hasMoreTokens())
	    hasSource = new Integer(st.nextToken()).intValue() != 0;
	if (st.hasMoreTokens())
	    shuntFirst = new Integer(st.nextToken()).intValue() != 0;
    }

    void dumpXml(Element elem) {
	super.dumpXml(elem);
	if (pslider != null)
	    XMLSerializer.dumpAttr(elem, "n", pslider.getValue());
	XMLSerializer.dumpAttr(elem, "rs", hasSource ? 1 : 0);
	XMLSerializer.dumpAttr(elem, "sh", shuntFirst ? 1 : 0);
	XMLSerializer.dumpAttr(elem, "rsr", rsrc);
	XMLSerializer.dumpAttr(elem, "rl", rload);
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	int n = xml.parseIntAttr("n", -1);
	if (n >= 0)
	    initPoles = n;
	else if (initPoles >= 0)
	    initPoles *= 2;  // older files stored the number of 2-pole sections
	hasSource  = xml.parseIntAttr("rs", 0) != 0;
	shuntFirst = xml.parseIntAttr("sh", 0) != 0;
	rload      = xml.parseDoubleAttr("rl", rload);
	rsrc       = xml.parseDoubleAttr("rsr", rload);
    }

    // slider gives the order of the lowpass prototype
    int getMaxPoles() { return 10; }
    int getDefaultPoles() { return 2; }
    int getPoleCount() {
	if (pslider == null)
	    return -1;
	int v = pslider.getValue();
	return isBand() ? v*2 : v;
    }
    boolean hasInvCheby() { return true; }
    boolean hasElliptic() { return true; }

    // shunt element first is useless with an ideal voltage source
    boolean isShuntFirst() { return shuntFirst && hasSource; }

    // resistance the prototype is normalized to
    double refR() { return hasSource ? rsrc : rload; }

    void create() {
	sourceChooser = new Choice();
	sourceChooser.add("Source Resistance: None");
	sourceChooser.add("Source Resistance: Nonzero");
	sourceChooser.select(hasSource ? 1 : 0);
	sourceChooser.addChangeHandler(new ChangeHandler() {
	    public void onChange(ChangeEvent ev) {
		hasSource = sourceChooser.getSelectedIndex() == 1;
		firstChooser.setEnabled(hasSource);
		// start with the source equal to the load
		if (hasSource)
		    rsrc = rload;
		frequencyChanged();
	    }
	});
	firstChooser = new Choice();
	firstChooser.add("Series Element First");
	firstChooser.add("Shunt Element First");
	firstChooser.select(shuntFirst ? 1 : 0);
	firstChooser.setEnabled(hasSource);
	firstChooser.addChangeHandler(new ChangeHandler() {
	    public void onChange(ChangeEvent ev) {
		shuntFirst = firstChooser.getSelectedIndex() == 1;
		frequencyChanged();
	    }
	});
	sim.addWidgetToVerticalPanel(sourceChooser);
	sim.addWidgetToVerticalPanel(firstChooser);
	super.create();
    }

    void delete() {
	super.delete();
	sim.removeWidgetFromVerticalPanel(sourceChooser);
	sim.removeWidgetFromVerticalPanel(firstChooser);
    }

    void polesChanged() {
	frequencyChanged();
    }

    // editing the source or load resistor redesigns the filter for the new
    // terminations, keeping the same response
    boolean editPerformed(Editable ce) {
	if (synth == null || (ce != srcRes && ce != loadRes))
	    return false;
	double r = ((ResistorElm) ce).getResistance();
	if (!(r > 0))
	    return false;
	if (ce == srcRes)
	    rsrc = r;
	else
	    rload = r;
	frequencyChanged();
	// with an even number of poles, whether the load can be greater or less
	// than the source depends on which element is first, so try the other one
	if (hasSource && loadError() > 1e-6) {
	    double err = loadError();
	    shuntFirst = !shuntFirst;
	    frequencyChanged();
	    if (loadError() < err)
		firstChooser.select(shuntFirst ? 1 : 0);
	    else {
		shuntFirst = !shuntFirst;
		frequencyChanged();
	    }
	}
	return true;
    }

    // relative difference between the actual and requested load, on a log scale
    double loadError() {
	return Math.abs(Math.log(refR()*synth.load/rload));
    }

    void getInfo(String info[], int i) {
	super.getInfo(info, i);
	while (info[i] != null)
	    i++;
	if (synth != null)
	    info[i++] = "Rs = " + CircuitElm.getUnitText(hasSource ? rsrc : 0, CirSim.ohmString) +
		", RL = " + CircuitElm.getUnitText(refR()*synth.load, CirSim.ohmString);
    }

    double getScaleFactor(double w, Complex poles[]) {
	return getRefScaleFactor((synth == null) ? 1 : synth.gain, poles);
    }

    // ladder values for a 1 rad/s, 1 ohm lowpass prototype
    LadderSynth synthesize() {
	// if a ladder with finite zeros would need negative elements, move
	// zeros to infinity until it doesn't.  that distorts an elliptic
	// response, so first try increasing its stopband attenuation, which
	// moves the zeros away from the passband.
	zerosMoved = 0;
	stopDbExtra = 0;
	while (true) {
	    LadderSynth ls = synthesizeProto();
	    if (!hasZeros() || ls.isPositive() || getProtoZeros().length == 0)
		return ls;
	    if (isElliptic() && stopDbExtra < 100)
		stopDbExtra++;
	    else
		zerosMoved++;
	}
    }

    LadderSynth synthesizeProto() {
	Complex poles[] = getPoles(true);
	double wc = 2*Math.PI*frequency;
	int i;
	for (i = 0; i != poles.length; i++)
	    poles[i].mult(1/wc);
	double e[] = LadderSynth.polyFromPoles(poles);
	double zeros[] = getProtoZeros();
	if (hasSource)
	    return LadderSynth.doublyTerminated(e, zeros, isShuntFirst(), rload/rsrc);
	return LadderSynth.singlyTerminated(e, zeros);
    }

    boolean isSeries(int i) { return (i % 2 == 0) != isShuntFirst(); }

    // two-terminal network of inductors and capacitors.  type is 'l' or 'c' for
    // a single element, or 's' or 'p' for a series or parallel combination.
    static class Net {
	char type;
	double value;
	Net parts[];
	Net(char t, double v) { type = t; value = v; }
	Net(char t, Net a, Net b) {
	    type = t;
	    // flatten nested combinations of the same type
	    Vector<Net> v = new Vector<Net>();
	    a.addParts(t, v);
	    b.addParts(t, v);
	    parts = v.toArray(new Net[v.size()]);
	}
	void addParts(char t, Vector<Net> v) {
	    if (type != t) {
		v.add(this);
		return;
	    }
	    for (Net p : parts)
		v.add(p);
	}
	boolean isLeaf() { return parts == null; }
	// size along the direction of the signal
	int length() {
	    if (isLeaf())
		return SEG;
	    int len = 0;
	    for (Net p : parts)
		len = (type == 's') ? len+p.length() : Math.max(len, p.length());
	    return len;
	}
	// size perpendicular to the signal, with parallel branches sep apart
	int width(int sep) {
	    if (isLeaf())
		return 0;
	    int w = 0;
	    for (Net p : parts)
		w = (type == 's') ? Math.max(w, p.width(sep)) : w+p.width(sep)+sep;
	    return (type == 's') ? w : w-sep;
	}
	String signature() {
	    if (isLeaf())
		return "" + type;
	    String s = type + "(";
	    for (Net p : parts)
		s += p.signature();
	    return s + ")";
	}
	void getLeaves(Vector<Net> v) {
	    if (isLeaf())
		v.add(this);
	    else
		for (Net p : parts)
		    p.getLeaves(v);
	}
    }

    static Net ind(double v) { return new Net('l', v); }
    static Net cap(double v) { return new Net('c', v); }
    static Net ser(Net a, Net b) { return new Net('s', a, b); }
    static Net par(Net a, Net b) { return new Net('p', a, b); }

    // network for a normalized lowpass prototype inductor (or capacitor) of value v,
    // after the frequency transformation
    Net transform(boolean isInd, double v) {
	double r = refR();
	double w = 2*Math.PI*frequency;  // bandwidth for bandpass/bandstop
	double w02 = Math.pow(2*Math.PI*cfrequency, 2);
	if (isBandPass())
	    return isInd ? ser(ind(v*r/w), cap(w/(v*r*w02))) :
		par(cap(v/(r*w)), ind(r*w/(v*w02)));
	if (isBandStop())
	    return isInd ? par(cap(1/(v*r*w)), ind(v*r*w/w02)) :
		ser(ind(r/(v*w)), cap(v*w/(r*w02)));
	if (isHiPass())
	    return isInd ? cap(1/(v*r*w)) : ind(r/(v*w));
	return isInd ? ind(v*r/w) : cap(v/(r*w));
    }

    // network for each ladder element: a series L or shunt C in the prototype,
    // with a parallel C or series L if it realizes a transmission zero
    Net [] getNets() {
	int n = synth.g.length;
	Net nets[] = new Net[n];
	int i;
	for (i = 0; i != n; i++) {
	    boolean ser = isSeries(i);
	    double g = synth.g[i];
	    double wz = synth.wz[i];
	    nets[i] = transform(ser, g);
	    if (wz > 0) {
		Net comp = transform(!ser, 1/(g*wz*wz));
		nets[i] = ser ? par(nets[i], comp) : ser(nets[i], comp);
	    }
	}
	return nets;
    }

    void addGround(int x, int y) { add('g', x, y, x, y+16, ""); }

    // lay out a network from (x, y), stretched to length len, going right if horiz
    // and down otherwise.  parallel branches are stacked above or to the right.
    void layout(Net net, int x, int y, boolean horiz, int len) {
	int dx = horiz ? 1 : 0;
	int dy = horiz ? 0 : 1;
	int i;
	if (net.isLeaf()) {
	    elms.add(add(net.type, x, y, x+dx*len, y+dy*len, (net.type == 'l') ? "1 0" : "1e-6 0"));
	    return;
	}
	if (net.type == 's') {
	    // the last part takes up any extra length
	    for (i = 0; i != net.parts.length; i++) {
		int l = (i == net.parts.length-1) ? len : net.parts[i].length();
		layout(net.parts[i], x, y, horiz, l);
		x += dx*l;
		y += dy*l;
		len -= l;
	    }
	    return;
	}
	int sep = horiz ? 48 : SEG;
	int off = 0;
	for (i = 0; i != net.parts.length; i++) {
	    int ox = horiz ? 0 : off;
	    int oy = horiz ? -off : 0;
	    if (off > 0) {
		addWire(x, y, x+ox, y+oy);
		addWire(x+dx*len, y+dy*len, x+dx*len+ox, y+dy*len+oy);
	    }
	    layout(net.parts[i], x+ox, y+oy, horiz, len);
	    off += net.parts[i].width(sep) + sep;
	}
    }

    // build the circuit: source, optional source resistor, ladder, load
    void rebuild(Net nets[]) {
	int n = nets.length;
	int i;
	// keep the resistors, since they may be the ones being edited
	Vector<CircuitElm> keep = new Vector<CircuitElm>();
	if (hasSource && srcRes != null)
	    keep.add(srcRes);
	if (loadRes != null)
	    keep.add(loadRes);
	clearCircuit(X0, TOP, keep);
	elms = new Vector<CircuitElm>();

	// stretch the shunt branches to the same length so the grounds line up
	int len = BOT-TOP;
	for (i = 0; i != n; i++)
	    if (!isSeries(i))
		len = Math.max(len, nets[i].length());

	int x = X0;
	if (!hasSource)
	    srcRes = null;
	else {
	    srcRes = placeResistor(srcRes, x, TOP, x+SEG, TOP);
	    x += SEG;
	}
	for (i = 0; i != n; i++) {
	    if (isSeries(i)) {
		int l = nets[i].length();
		layout(nets[i], x, TOP, true, l);
		x += l;
	    } else {
		layout(nets[i], x, TOP, false, len);
		addGround(x, TOP+len);
		// leave room for parallel branches stacked to the right
		int w = nets[i].width(SEG);
		if (w > 0)
		    addWire(x, TOP, x+w, TOP);
		x += w;
	    }
	}
	addWire(x, TOP, x+SEG, TOP);
	x += SEG;
	loadRes = placeResistor(loadRes, x, TOP, x, TOP+len);
	addGround(x, TOP+len);
	add('O', x, TOP, x+48, TOP, "");
	sim.centerCircuit();
    }

    // move an existing resistor into place, or create one
    ResistorElm placeResistor(ResistorElm re, int x1, int y1, int x2, int y2) {
	if (re == null)
	    return (ResistorElm) add('r', x1, y1, x2, y2, "50");
	re.setPosition(x1, y1, x2, y2);
	return re;
    }

    void frequencyChanged() {
	synth = synthesize();
	Net nets[] = getNets();
	String key = hasSource + " " + isShuntFirst();
	int i;
	for (i = 0; i != nets.length; i++)
	    key += " " + nets[i].signature();
	if (!key.equals(builtKey)) {
	    rebuild(nets);
	    builtKey = key;
	}
	Vector<Net> leaves = new Vector<Net>();
	for (i = 0; i != nets.length; i++)
	    nets[i].getLeaves(leaves);
	for (i = 0; i != leaves.size(); i++) {
	    CircuitElm ce = elms.get(i);
	    double v = leaves.get(i).value;
	    if (ce instanceof InductorElm)
		((InductorElm) ce).setValue(v);
	    else
		((CapacitorElm) ce).setValue(v);
	}
	if (srcRes != null)
	    srcRes.setValue(rsrc);
	loadRes.setValue(refR()*synth.load);
	sim.needAnalyze();
    }
};
