package com.falstad.afilter.client;

class HighActiveFilter extends ActiveFilter {
    public HighActiveFilter(int f, StringTokenizer st) {
	super(f, st);
    }

    /*double getScaleFactor(double w, Complex poles[]) {
	return -Math.pow(w, poles.length);
	}*/
    
    void frequencyChanged() {
	int ri = 0;
	int ci = 0;
	int poles2 = sim.countElm(BoxElm.class);
	int pn;
	int poles = poles2*2;
	Complex parr[] = getPoles();
	for (pn = 0; pn != poles2; pn++) {
	    Complex c1 = parr[pn];
	    double wp = c1.mag();
	    double q = -wp/(2*c1.re);
	    double r2 = 0;
	    double cx = 1e-3;
	    double c3 = 0;
	    double p = 1;
	    while (p < 4*q*q)
		p++;
	    while (true) {
		c3 = cx*(p-2*q*q-Math.sqrt(p*p-4*p*q*q))/(2*q*q);
		r2 = 1/(q*wp*(c3+cx));
		if (r2 > 100)
		    break;
		cx /= 10;
	    }
	    sim.getElm(ri++, ResistorElm.class).setValue(r2);
	    sim.getElm(ri++, ResistorElm.class).setValue(p*r2);
	    sim.getElm(ci++, CapacitorElm.class).setValue(cx);
	    sim.getElm(ci++, CapacitorElm.class).setValue(c3);
	    CircuitElm b = sim.getElm(pn, BoxElm.class);
	    ((BoxElm) b).setText("Q = " + CircuitElm.showFormat.format(q));
	}
	sim.needAnalyze();
    }
};
