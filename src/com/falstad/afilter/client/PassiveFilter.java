package com.falstad.afilter.client;

import com.gargoylesoftware.htmlunit.javascript.host.Console;

class PassiveFilter extends FilterCustomizer {
    public PassiveFilter(int f, StringTokenizer st) {
	super(f, st);
    }

    double getScaleFactor(double w, Complex poles[]) {
	double x = 1;
	if (isHiPass() || isBandStop()) return 1;

	if (isBandPass()) {
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
	
	int i;
	for (i = 0; i != poles.length/2; i++)
	    x *= poles[i].magSquared();
	return x;
    }
    
    Complex [] polyMult(Complex p1[], Complex p2[]) {
	Complex pp[] = new Complex[p1.length+p2.length-1];
	int i, j;
	for (i = 0; i != pp.length; i++)
	    pp[i] = new Complex(0);
	Complex cc = new Complex();
	for (i = 0; i != p1.length; i++)
	    for (j = 0; j != p2.length; j++) {
		cc.set(p1[i]);
		cc.mult(p2[j]);
		pp[i+j].add(cc);
	    }
	return pp;
    }
    
    double [] getValues() {
	int poles = sim.countElm(CapacitorElm.class) +
	    sim.countElm(InductorElm.class);
	if (isBand())
	    poles /= 2;
	//double r = 50;
	double r = 1;
	int i;
	double wc = 2*Math.PI*frequency;
	Complex poly[] = new Complex[1];
	poly[0] = new Complex(1);
	Complex polearr[] = getPoles(true);
	for (i = 0; i != poles; i++) {
	    Complex poly2[] = new Complex[2];
	    poly2[0] = polearr[i];
	    // calculate the poles for a prototype 1 radian filter
	    // to avoid overflow problems
	    poly2[0].mult(-1/wc);
	    poly2[1] = new Complex(1);
	    poly = polyMult(poly, poly2);
	}
	/*for (i = poly.length-1; i >= 0; i--)
	  System.out.println(poly[i].asString() + " x^" + i);*/
	double rpoly[] = new double[poly.length];
	for (i = 0; i != rpoly.length; i++)
	    rpoly[i] = poly[i].re;
	double deven[] = new double[(rpoly.length % 2) == 1 ?
				    rpoly.length : rpoly.length-1];
	double dodd[] = new double[(rpoly.length % 2) == 0 ?
				   rpoly.length : rpoly.length-1];
	for (i = 0; i != rpoly.length; i++)
	    if (i % 2 == 0)
		deven[i] = rpoly[i]*r;
	    else
		dodd[i] = rpoly[i];
	double d1[] = deven;
	double d2[] = dodd;
	boolean swap = false;
	double values[] = new double[poles];
	i = 0;
	while (d1.length > 1) {
	    //System.out.println("d1 " + polyString(d1));
	    //System.out.println("d2 " + polyString(d2));
	    double ra = d1[d1.length-1]/d2[d2.length-1];
	    values[i++] = ra;
	    /*if (swap)
		System.out.println("c = " + ra);
	    else
		System.out.println("l = " + ra);*/
	    double q[] = polySub(d1, ra, 1, d2);
	    d1 = d2;
	    d2 = q;
	    swap = !swap;
	}
	return values;
    }

    double [] polySub(double p1[], double mult, int xmult, double p2[]) {
	double pa[] = new double[p1.length];
	int i;
	for (i = 0; i != pa.length; i++)
	    pa[i] = p1[i];
	for (i = 0; i != p2.length; i++)
	    pa[i+xmult] -= p2[i]*mult;
	//System.out.println("pa = " + polyString(pa));
	int len = pa.length;
	while (len > 1 && Math.abs(pa[len-1]) < 1e-8)
	    len--;
	if (len == pa.length)
	    return pa;
	double pb[] = new double[len];
	for (i = 0; i != len; i++)
	    pb[i] = pa[i];
	return pb;
    }
    
    String polyString(double p[]) {
	String s = "";
	int i;
	for (i = p.length-1; i >= 0; i--) {
	    if (s.length() > 0)
		s += " + ";
	    s += p[i] + " s^" + i;
	}
	return s;
    }
    
    void frequencyChanged() {
	double values[] = getValues();
	int poles2 = sim.countElm(BoxElm.class);
	int pn;
	int poles = poles2*2;
	double r = sim.getElm(0, ResistorElm.class).getValue();
	int vi = values.length-1;
	double w = 2*Math.PI*frequency;
	boolean doInd = !(isHiPass() || isBandStop());
	int ii = 0, ci = 0;
	//System.out.println("f0 " + frequency + " " + poles + " " + doInd);
	//System.out.println("ibs " + isBandStop() + " " + isBand());
	for (pn = 0; pn != poles; pn++) {
	    double val = values[vi--];
	    if (isHiPass() || isBandStop())
		val = 1/val;
	    //System.out.println("val = " + val + " " + r);
	    if (isBand()) {
		double cw = cfrequency*2*Math.PI;
		double cw2 = cw*cw;
		val /= w;
		if (!doInd) {
		    sim.getElm(ci++, CapacitorElm.class).setValue(val/r);
		    sim.getElm(ii++, InductorElm.class).setValue(r/(cw2*val));
		} else {
		    sim.getElm(ii++, InductorElm.class).setValue(val*r);
		    sim.getElm(ci++, CapacitorElm.class).
			setValue(1/(cw2*val*r));
		}
	    } else {
		if (doInd)
		    sim.getElm(ii++, InductorElm.class).setValue(val*r/w);
		else
		    sim.getElm(ci++, CapacitorElm.class).setValue(val/(r*w));
	    }
	    doInd = !doInd;
	}
	sim.needAnalyze();
    }
};
