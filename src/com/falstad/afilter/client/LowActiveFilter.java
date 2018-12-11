package com.falstad.afilter.client;

class LowActiveFilter extends ActiveFilter {
    public LowActiveFilter(int f, StringTokenizer st) {
	super(f, st);
    }

    double getScaleFactor(double w, Complex poles[]) {
	double x = 1;
	int i;
	for (i = 0; i != poles.length/2; i++)
	    x *= poles[i].magSquared();
	return x;
    }
    
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
	    double p = 1;
	    double r1 = 0;
	    double cx = 1e-3;
	    while (true) {
		r1 = 1/(q*wp*cx*(1+p));
		if (r1 > 100)
		    break;
		cx /= 10;
	    }
	    CircuitElm r3 = sim.getElm(ri++, ResistorElm.class);
	    CircuitElm r11 = sim.getElm(ri++, ResistorElm.class);
	    r11.setValue(r1);
	    r3.setValue(p*r1);
	    CircuitElm b = sim.getElm(pn, BoxElm.class);
	    sim.getElm(ci++, CapacitorElm.class).setValue(cx);
	    double c2 = q*q*cx*(1+p)*(1+p)/p;
	    sim.getElm(ci++, CapacitorElm.class).setValue(c2);
	    ((BoxElm) b).setText("Q = " + CircuitElm.showFormat.format(q));
	}
	sim.needAnalyze();
    }
};
