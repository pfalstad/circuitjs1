package com.falstad.afilter.client;

class BandPassActiveFilter extends ActiveFilter {
    public BandPassActiveFilter(int f, StringTokenizer st) {
	super(f, st);
    }

    double getScaleFactor(double w, Complex poles[]) {
	double x = 1;
	int i;
	Complex iw = new Complex(0, 2*Math.PI*cfrequency);
	for (i = 0; i != poles.length; i++) {
	    Complex p = new Complex(poles[i]);
	    p.subtract(iw);
	    x *= p.mag();
	}
	x /= Math.pow(iw.mag(), poles.length/2);
	return x;
    }

    double getCircuitScaleFactor(Complex poles[]) {
        double x = 1;
        int i;
        for (i = 0; i != poles.length; i++) {
            double wp = poles[i].mag();
            double q = -wp/(2*poles[i].re);
            x *= Math.sqrt(wp/q);
        }
        return x;
    }
    
    int getPoleCount() { return pslider.getValue()*4; }
    int getBoxCount() { return pslider.getValue()*2; }
    
    void frequencyChanged() {
	int ri = 0;
	int ci = 0;
	int poles2 = sim.countElm(BoxElm.class);
	int pn;
	int poles = poles2*2;
	Complex parr[] = getPoles();
	int pi = 0;
	
	// calculate scale factor
	double gainneeded = getScaleFactor(0, parr)/getCircuitScaleFactor(parr);

	// calculate add'l gain needed due to stages that can't achieve gain=1
	for (pn = 0; pn != poles; pn++) {
	    Complex c1 = parr[pn];
	    if (c1.im < 0)
		continue;
	    double wp = c1.mag();
	    double q = -wp/(2*c1.re);
	    double p = 1;
	    double r1 = 0;
	    double cx = 1e-3;
	    double c3 = 0;
	    double k = 1;
	    while (p <= 4*q*q)
		p++;
	    while (true) {
		c3 = cx*(p-2*q*q-Math.sqrt(p*p-4*p*q*q))/(2*q*q);
		r1 = 1/(q*wp*(cx+c3));
		if (r1 > 100)
		    break;
		cx /= 10;
	    }
	    double r4v = p*r1;
	    while (c3*r4v < r1*k*(cx+c3))
		k *= .9;
	    gainneeded /= k;
	}
	
	for (pn = 0; pn != poles; pn++) {
	    Complex c1 = parr[pn];
	    if (c1.im < 0)
		continue;
	    double wp = c1.mag();
	    double q = -wp/(2*c1.re);
	    double p = 1;
	    double r1 = 0;
	    double cx = 1e-3;
	    double c3 = 0;
	    double k = gainneeded;
	    while (p <= 4*q*q)
		p++;
	    while (true) {
		c3 = cx*(p-2*q*q-Math.sqrt(p*p-4*p*q*q))/(2*q*q);
		r1 = 1/(q*wp*(cx+c3));
		if (r1 > 100)
		    break;
		cx /= 10;
	    }
	    CircuitElm r4 = sim.getElm(ri++, ResistorElm.class);
	    CircuitElm r11 = sim.getElm(ri++, ResistorElm.class);
	    CircuitElm r12 = sim.getElm(ri++, ResistorElm.class);
	    double r4v = p*r1;
	    r4.setValue(r4v);
	    while (c3*r4v < r1*k*(cx+c3))
		k *= .9;
	    if (k > 1)
		gainneeded /= k;
	    r11.setValue(c3*r4v/(k*(cx+c3)));
	    r12.setValue(c3*r1*r4v/(c3*r4v-r1*k*(cx+c3)));
	    sim.getElm(ci++, CapacitorElm.class).setValue(c3);
	    sim.getElm(ci++, CapacitorElm.class).setValue(cx);
	    //CircuitElm b = sim.getElm(pi++, BoxElm.class);
	    //((BoxElm) b).setText("Q = " + CircuitElm.showFormat.format(q));
	}
	//System.out.println("gainnneded = " + gainneeded);
	sim.needAnalyze();
    }
};
