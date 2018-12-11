package com.falstad.afilter.client;

class RLCFilter extends FilterCustomizer {
    double qfactor;
    Scrollbar qslider;
    final double minQ = .01;
    final double maxQ = 1000;
    public RLCFilter(int f, StringTokenizer st) {
	super(f, st);
	qfactor = new Double(st.nextToken()).doubleValue();
    }
    void create() {
	super.create();
//	labels[1].hide();
//	bars[1].hide();
	int x = (int) (Math.log(qfactor/minQ)*1000/Math.log(maxQ/minQ));
	qslider = createSlider("Q Factor", x, 0, 1000);
//	sim.main.validate();
    }
    void slidersChanged(Scrollbar s) {
	super.slidersChanged(s);
	if (s == qslider) {
	    qfactor = minQ*Math.exp(qslider.getValue()*Math.log(maxQ/minQ)/1000.);
	    frequencyChanged();
	}
    }
    void getInfo(String info[], int i) {
	info[i] = "Res Freq: " +
	    CircuitElm.getUnitText(cfrequency, "Hz");
	info[i+1] = "Q = " + CircuitElm.showFormat.format(qfactor);
	info[i+2] = "Poles: 2";
    }
    void frequencyChanged() {
	// w = 1/sqrt(lc)
	// q = sqrt(l/c) / r
	// wq = 1/cr
	double w = 2*Math.PI*cfrequency;
	double r = ((ResistorElm) sim.getElm(0, ResistorElm.class)).
	    getResistance();
	double q = !isBandStop() ? 1/qfactor : qfactor;
	double c = 1/(r*w*q);
	double l = 1/(w*w*c);
	((CapacitorElm) sim.getElm(0, CapacitorElm.class)).
	    setCapacitance(c);
	((InductorElm) sim.getElm(0, InductorElm.class)).
	    setInductance(l);
	sim.needAnalyze();
    }
    /*
      Commented out because it changes C and L to adapt to the change
      in R so the response doesn't change.  This is confusing; we want
      to update Q instead.
      
    boolean editPerformed(Editable ce) {
	if (ce == sim.getElm(0, ResistorElm.class)) {
	    frequencyChanged();
	    return true;
	}
	return false;
	}*/
    
    double getScaleFactor(double w, Complex x[]) {
	if (isBandStop())
	    return 1;
	double w0 = 2*Math.PI*cfrequency;
	return w0/qfactor;
    }
    
    Complex [] getPoles() {
	double w = 2*Math.PI*cfrequency;
	double alpha = w/(2*qfactor);
	Complex a = new Complex(alpha*alpha-w*w, 0);
	a.sqrt();
	Complex b = new Complex(a);
	a.add(-alpha);
	b.mult(-1);
	b.add(-alpha);
	return new Complex[] { a, b };
    }
    int getPoleCount() { return 2; }
    Complex [] getZeros() {
	if (!isBandStop())
	    return new Complex[] { new Complex(0, 0) };
	double w = 2*Math.PI*cfrequency;
	return new Complex[] { new Complex(0, w), new Complex(0, -w) };
    }
};
