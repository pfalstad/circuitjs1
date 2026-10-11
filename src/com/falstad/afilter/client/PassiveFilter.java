package com.falstad.afilter.client;

import com.google.gwt.event.dom.client.ChangeEvent;
import com.google.gwt.event.dom.client.ChangeHandler;
import com.google.gwt.xml.client.Element;

// LC ladder filter.  The circuit is generated in code from the filter
// parameters, so any order, termination and topology can be built.
class PassiveFilter extends FilterCustomizer {
    boolean matched;      // source resistance equal to load (else ideal source)
    boolean shuntFirst;   // first ladder element is a shunt element
    double rload = 50;
    Choice sourceChooser, firstChooser;

    // generated circuit
    String builtKey;
    InductorElm inds[];
    CapacitorElm caps[];
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
    int getOrder() { return pslider.getValue(); }

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
	double gain = (synth == null) ? 1 : synth.gain;
	if (isHiPass() || isBandStop())
	    return gain;

	int i;
	double x = 1;
	if (isBandPass()) {
	    Complex iw = new Complex(0, 2*Math.PI*cfrequency);
	    for (i = 0; i != poles.length; i++) {
		Complex p = new Complex(poles[i]);
		p.subtract(iw);
		x *= p.mag();
	    }
	    x /= Math.pow(iw.mag(), poles.length/2);
	    return x*gain;
	}

	for (i = 0; i != poles.length; i++)
	    x *= poles[i].mag();
	return x*gain;
    }

    // ladder values for a 1 rad/s, 1 ohm lowpass prototype
    LadderSynth synthesize() {
	Complex poles[] = getPoles(true);
	double wc = 2*Math.PI*frequency;
	int i;
	for (i = 0; i != poles.length; i++)
	    poles[i].mult(1/wc);
	double e[] = LadderSynth.polyFromPoles(poles);
	if (matched)
	    return LadderSynth.doublyTerminated(e, isShuntFirst());
	return LadderSynth.singlyTerminated(e);
    }

    boolean isSeries(int i) { return (i % 2 == 0) != isShuntFirst(); }

    void addGround(int x) { add('g', x, BOT, x, BOT+16, ""); }
    InductorElm addInd(int x1, int y1, int x2, int y2) { return (InductorElm) add('l', x1, y1, x2, y2, "1 0"); }
    CapacitorElm addCap(int x1, int y1, int x2, int y2) { return (CapacitorElm) add('c', x1, y1, x2, y2, "1e-6 0"); }

    // build the circuit: source, optional source resistor, ladder, load
    void rebuild() {
	int n = getOrder();
	int i;
	clearCircuit(X0, TOP);

	int x = X0;
	if (matched) {
	    add('r', x, TOP, x+SEG, TOP, "" + rload);
	    x += SEG;
	}
	inds = new InductorElm[n];
	caps = new CapacitorElm[n];
	for (i = 0; i != n; i++) {
	    boolean ser = isSeries(i);
	    if (isBandPass()) {
		if (ser) {
		    // series LC
		    inds[i] = addInd(x, TOP, x+SEG, TOP);
		    caps[i] = addCap(x+SEG, TOP, x+2*SEG, TOP);
		    x += 2*SEG;
		} else {
		    // parallel LC to ground
		    caps[i] = addCap(x, TOP, x, BOT);
		    addGround(x);
		    addWire(x, TOP, x+SEG, TOP);
		    x += SEG;
		    inds[i] = addInd(x, TOP, x, BOT);
		    addGround(x);
		}
	    } else if (isBandStop()) {
		if (ser) {
		    // parallel LC in series with the signal path
		    caps[i] = addCap(x, TOP, x+SEG, TOP);
		    inds[i] = addInd(x, TOP-48, x+SEG, TOP-48);
		    addWire(x, TOP-48, x, TOP);
		    addWire(x+SEG, TOP-48, x+SEG, TOP);
		    x += SEG;
		} else {
		    // series LC to ground
		    inds[i] = addInd(x, TOP, x, TOP+SEG);
		    caps[i] = addCap(x, TOP+SEG, x, BOT);
		    addGround(x);
		}
	    } else {
		boolean ind = (ser != isHiPass());
		if (ser) {
		    if (ind)
			inds[i] = addInd(x, TOP, x+SEG, TOP);
		    else
			caps[i] = addCap(x, TOP, x+SEG, TOP);
		    x += SEG;
		} else {
		    if (ind)
			inds[i] = addInd(x, TOP, x, BOT);
		    else
			caps[i] = addCap(x, TOP, x, BOT);
		    addGround(x);
		}
	    }
	}
	addWire(x, TOP, x+SEG, TOP);
	x += SEG;
	loadRes = (ResistorElm) add('r', x, TOP, x, BOT, "" + rload);
	addGround(x);
	add('O', x, TOP, x+48, TOP, "");
	sim.centerCircuit();
    }

    void frequencyChanged() {
	String key = getOrder() + " " + matched + " " + isShuntFirst();
	if (!key.equals(builtKey)) {
	    rebuild();
	    builtKey = key;
	}
	synth = synthesize();
	double r = rload;
	double w = 2*Math.PI*frequency;
	double w02 = Math.pow(2*Math.PI*cfrequency, 2);
	int i;
	for (i = 0; i != synth.g.length; i++) {
	    double g = synth.g[i];
	    boolean ser = isSeries(i);
	    if (isBandPass()) {
		// w is the bandwidth
		if (ser) {
		    inds[i].setValue(g*r/w);
		    caps[i].setValue(w/(g*r*w02));
		} else {
		    caps[i].setValue(g/(r*w));
		    inds[i].setValue(r*w/(g*w02));
		}
	    } else if (isBandStop()) {
		if (ser) {
		    inds[i].setValue(g*r*w/w02);
		    caps[i].setValue(1/(g*r*w));
		} else {
		    inds[i].setValue(r/(g*w));
		    caps[i].setValue(g*w/(r*w02));
		}
	    } else if (isHiPass()) {
		if (ser)
		    caps[i].setValue(1/(g*r*w));
		else
		    inds[i].setValue(r/(g*w));
	    } else {
		if (ser)
		    inds[i].setValue(g*r/w);
		else
		    caps[i].setValue(g/(r*w));
	    }
	}
	loadRes.setValue(r*synth.load);
	sim.needAnalyze();
    }
};
