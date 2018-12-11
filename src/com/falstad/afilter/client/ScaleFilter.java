package com.falstad.afilter.client;

class ScaleFilter extends FilterCustomizer {
    double oldFreq, oldR;
    public ScaleFilter(int f, StringTokenizer st) {
	super(f, st);
	oldFreq = frequency;
	oldR = 1;
	CircuitElm elm = sim.getElm(0, ResistorElm.class);
	if (elm != null)
	    oldR = ((ResistorElm) elm).getResistance();
    }

    double getScaleFactor(double w, Complex poles[]) {
	if (form == FILT_HIPASS)
	    return 1;
	return 2*Math.PI*frequency;
    }

    Complex [] getPoles() {
	int cc = sim.countElm(CapacitorElm.class);
	int lc = sim.countElm(InductorElm.class);
	int rc = sim.countElm(ResistorElm.class);
	if (cc+lc != 1 || rc != 1)
	    return null;
	/*
	double rval = sim.getElm(0, ResistorElm.class).getValue();
	if (cc == 1) {
	    double v = sim.getElm(0, CapacitorElm.class).getValue();
	    return new Complex[] { new Complex(-1/(v*rval), 0) };
	} else {
	    double v = sim.getElm(0, InductorElm.class).getValue();
	    return new Complex[] { new Complex(-rval/v, 0) };
	    }*/
	return new Complex[] { new Complex(-2*Math.PI*frequency, 0) };
    }
    void frequencyChanged() {
	int i;
	for (i = 0; i != sim.countElm(CapacitorElm.class); i++) {
	    CapacitorElm ce = (CapacitorElm) sim.getElm(i, CapacitorElm.class);
	    ce.setCapacitance(ce.getCapacitance() * oldFreq / frequency);
	}
	for (i = 0; i != sim.countElm(InductorElm.class); i++) {
	    InductorElm ce = (InductorElm) sim.getElm(i, InductorElm.class);
	    ce.setInductance(ce.getInductance() * oldFreq / frequency);
	}
	for (i = 0; i != sim.countElm(TransLineElm.class); i++) {
	    TransLineElm ce = (TransLineElm) sim.getElm(i, TransLineElm.class);
	    ce.setDelay(ce.getDelay() * oldFreq / frequency);
	}
	sim.needAnalyze();
	oldFreq = frequency;
    }
    Complex [] getZeros() {
	if (form == FILT_HIPASS)
	    return new Complex[] { new Complex(0, 0) };
	return null;
    }
    int getPoleCount() {
	int pc = sim.countElm(CapacitorElm.class) +
	    sim.countElm(InductorElm.class);
	if (pc <= 2)
	    return pc;
	// pole count could be wrong, like inv cheby example
	return -1;
    }
};
