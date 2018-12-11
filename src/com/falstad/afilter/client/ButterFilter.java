package com.falstad.afilter.client;

class ButterFilter extends FilterCustomizer {
    public ButterFilter(int f, StringTokenizer st) {
	super(f, st);
    }

    void frequencyChanged() {
	int poles = sim.countElm(CapacitorElm.class) +
	    sim.countElm(InductorElm.class);
	if (isBand())
	    poles /= 2;
	double r = 50;
	int i, ci = 0, ii = 0;
	boolean doCap = (poles % 2 == 1);
	if (isHiPass() || isBandStop())
	    doCap = !doCap;
	//System.out.println("fq " + frequency + " " + poles + " " + doCap);
	double a1 = 1, c1 = 1;
	for (i = 1; i <= poles; i++) {
	    double a = Math.sin((2*i-1)*Math.PI/(2*poles));
	    double c = (i == 1) ? 2*a : 4*a*a1/c1;
	    a1 = a;
	    c1 = c;
	    //System.out.println("c = " + c);
	    if (isHiPass() || isBandStop())
		c = 1/c;
	    c /= 2*Math.PI*frequency;
	    if (isBand()) {
		double cw = cfrequency*2*Math.PI;
		double cw2 = cw*cw;
		if (doCap) {
		    ((CapacitorElm) sim.getElm(ci++, CapacitorElm.class)).
			setCapacitance(c/r);
		    ((InductorElm) sim.getElm(ii++, InductorElm.class)).
			setInductance(r/(cw2*c));
		} else {
		    ((InductorElm) sim.getElm(ii++, InductorElm.class)).
			setInductance(c*r);
		    ((CapacitorElm) sim.getElm(ci++, CapacitorElm.class)).
			setCapacitance(1/(cw2*c*r));
		}
	    } else {
		if (doCap)
		    ((CapacitorElm) sim.getElm(ci++, CapacitorElm.class)).
			setCapacitance(c/r);
		else
		    ((InductorElm) sim.getElm(ii++, InductorElm.class)).
			setInductance(c*r);
	    }
	    doCap = !doCap;
	}
	sim.needAnalyze();
    }
    
    double getScaleFactor(double w, Complex poles[]) {
	if (isHiPass())
	    return 1;
	double x = 1;
	int i;
	for (i = 0; i != poles.length/2; i++)
	    x *= poles[i].magSquared();
	return x;
    }
    
    Complex [] getPoles() {
	int i;
	int pn = sim.countElm(CapacitorElm.class) + sim.countElm(InductorElm.class);
	Complex poles[] = new Complex[pn];
	double wc = 2*Math.PI*frequency;
	for (i = 0; i != pn; i++) {
	    poles[i] = new Complex();
	    getButterPole(i, pn, poles[i], wc);
	}
	return poles;
    }
    
    Complex [] getZeros() {
	if (!isHiPass())
	    return null;
	int i;
	int pn = sim.countElm(CapacitorElm.class) +
	    sim.countElm(InductorElm.class);
	Complex zeros[] = new Complex[pn];
	for (i = 0; i != pn; i++)
	    zeros[i] = new Complex(0, 0);
	return zeros;
    }
};
