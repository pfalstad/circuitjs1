package com.falstad.afilter.client;

import com.google.gwt.event.dom.client.ChangeEvent;
import com.google.gwt.event.dom.client.ChangeHandler;
import com.google.gwt.xml.client.Element;
import java.util.Vector;

// LC ladder filter.  The circuit is generated in code from the filter
// parameters, so any order, termination and topology can be built.
class PassiveFilter extends FilterCustomizer {
    boolean matched;      // source resistance equal to load (else ideal source)
    boolean shuntFirst;   // first ladder element is a shunt element
    double rload = 50;
    Choice sourceChooser, firstChooser;

    // generated circuit
    String builtKey;
    Vector<CircuitElm> elms;   // inductors and capacitors, in the order of Net.getLeaves()
    ResistorElm loadRes;
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
	    matched = new Integer(st.nextToken()).intValue() != 0;
	if (st.hasMoreTokens())
	    shuntFirst = new Integer(st.nextToken()).intValue() != 0;
    }

    void dumpXml(Element elem) {
	super.dumpXml(elem);
	if (pslider != null)
	    XMLSerializer.dumpAttr(elem, "n", pslider.getValue());
	XMLSerializer.dumpAttr(elem, "rs", matched ? 1 : 0);
	XMLSerializer.dumpAttr(elem, "sh", shuntFirst ? 1 : 0);
    }

    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	int n = xml.parseIntAttr("n", -1);
	if (n >= 0)
	    initPoles = n;
	else if (initPoles >= 0)
	    initPoles *= 2;  // older files stored the number of 2-pole sections
	matched    = xml.parseIntAttr("rs", 0) != 0;
	shuntFirst = xml.parseIntAttr("sh", 0) != 0;
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

    // shunt element first is useless with an ideal voltage source
    boolean isShuntFirst() { return shuntFirst && matched; }

    void create() {
	sourceChooser = new Choice();
	sourceChooser.add("Source Resistance: None");
	sourceChooser.add("Source Resistance: Matched");
	sourceChooser.select(matched ? 1 : 0);
	sourceChooser.addChangeHandler(new ChangeHandler() {
	    public void onChange(ChangeEvent ev) {
		matched = sourceChooser.getSelectedIndex() == 1;
		firstChooser.setEnabled(matched);
		frequencyChanged();
	    }
	});
	firstChooser = new Choice();
	firstChooser.add("Series Element First");
	firstChooser.add("Shunt Element First");
	firstChooser.select(shuntFirst ? 1 : 0);
	firstChooser.setEnabled(matched);
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

    void getInfo(String info[], int i) {
	super.getInfo(info, i);
	while (info[i] != null)
	    i++;
	if (synth != null)
	    info[i++] = "Rs = " + CircuitElm.getUnitText(matched ? rload : 0, CirSim.ohmString) +
		", RL = " + CircuitElm.getUnitText(rload*synth.load, CirSim.ohmString);
    }

    double getScaleFactor(double w, Complex poles[]) {
	return getRefScaleFactor((synth == null) ? 1 : synth.gain, poles);
    }

    // ladder values for a 1 rad/s, 1 ohm lowpass prototype
    LadderSynth synthesize() {
	// if an inverse Chebyshev ladder would need negative elements, move
	// finite zeros to infinity until it doesn't
	invChebyMoved = 0;
	while (true) {
	    LadderSynth ls = synthesizeProto();
	    if (!isInvCheby() || ls.isPositive() || getProtoZeros().length == 0)
		return ls;
	    invChebyMoved++;
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
	if (matched)
	    return LadderSynth.doublyTerminated(e, zeros, isShuntFirst());
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
	double r = rload;
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
	clearCircuit(X0, TOP);
	elms = new Vector<CircuitElm>();

	// stretch the shunt branches to the same length so the grounds line up
	int len = BOT-TOP;
	for (i = 0; i != n; i++)
	    if (!isSeries(i))
		len = Math.max(len, nets[i].length());

	int x = X0;
	if (matched) {
	    add('r', x, TOP, x+SEG, TOP, "" + rload);
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
		x += nets[i].width(SEG);
	    }
	}
	addWire(x, TOP, x+SEG, TOP);
	x += SEG;
	loadRes = (ResistorElm) add('r', x, TOP, x, TOP+len, "" + rload);
	addGround(x, TOP+len);
	add('O', x, TOP, x+48, TOP, "");
	sim.centerCircuit();
    }

    void frequencyChanged() {
	synth = synthesize();
	Net nets[] = getNets();
	String key = matched + " " + isShuntFirst();
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
	loadRes.setValue(rload*synth.load);
	sim.needAnalyze();
    }
};
