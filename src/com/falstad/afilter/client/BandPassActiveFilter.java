package com.falstad.afilter.client;

class BandPassActiveFilter extends ActiveFilter {
    public BandPassActiveFilter(int f, StringTokenizer st) {
	super(f, st);
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

    int getMaxPoles() { return 10; }

    // multiple-feedback bandpass stage.  Caps are longer than usual so
    // there's room to display their values.
    static final int BPW = SW+16;
    int getStageWidth() { return BPW; }
    void buildStage(int i, int x, boolean real) {
	int y = Y;
	res[i] = new ResistorElm[3];
	caps[i] = new CapacitorElm[2];
	res[i][1] = addRes(x, y, x+48, y);            // input
	res[i][2] = addRes(x+48, y, x+48, y+88);      // to ground
	addGround(x+48, y+88);
	caps[i][0] = addCap(x+48, y, x+112, y);       // to inverting input
	addWire(x+48, y-64, x+48, y);
	caps[i][1] = addCap(x+48, y-64, x+112, y-64); // to output
	res[i][0] = addRes(x+112, y-64, x+112, y);    // feedback
	addWire(x+112, y-64, x+BPW, y-64);
	addOpAmp(x+128, y+8, x+BPW, y+8, false);
	addWire(x+128, y, x+112, y);
	addGround(x+128, y+16);
	addWire(x+BPW, y+8, x+BPW, y);
	addWire(x+BPW, y, x+BPW, y-64);
    }

    // returns k, the gain of the stage, given the gain wanted
    double setStage(int i, Complex c1, double k, boolean set) {
	double wp = c1.mag();
	double q = getQ(c1);
	double p = 1;
	while (p <= 4*q*q)
	    p++;
	// c3 = f*cx
	double f = (p-2*q*q-Math.sqrt(p*p-4*p*q*q))/(2*q*q);
	double cx = pickCap(q*wp*(1+f));
	double c3 = f*cx;
	double r1 = 1/(q*wp*(cx+c3));
	double r4v = p*r1;
	while (c3*r4v < r1*k*(cx+c3))
	    k *= .9;
	if (set) {
	    res[i][0].setValue(r4v);
	    res[i][1].setValue(c3*r4v/(k*(cx+c3)));
	    res[i][2].setValue(c3*r1*r4v/(c3*r4v-r1*k*(cx+c3)));
	    caps[i][0].setValue(c3);
	    caps[i][1].setValue(cx);
	}
	return k;
    }

    void setValues() {
	int i;
	if (isInvCheby()) {
	    // notch stages first, then the bandpass stage (odd orders) makes up
	    // the gain at the center frequency, if it can
	    for (i = 0; i != stagePoles.length; i++)
		if (isBoctor(i))
		    circuitGain *= setBoctor(i);
	    for (i = 0; i != stagePoles.length; i++)
		if (!isBoctor(i))
		    circuitGain *= setStage(i, stagePoles[i], 1/circuitGain, true);
	    return;
	}
	Complex parr[] = getPoles();
	double gainneeded = getScaleFactor(0, parr)/getCircuitScaleFactor(parr);

	// calculate add'l gain needed due to stages that can't achieve gain=1
	for (i = 0; i != stagePoles.length; i++)
	    gainneeded /= setStage(i, stagePoles[i], 1, false);

	for (i = 0; i != stagePoles.length; i++) {
	    double k = setStage(i, stagePoles[i], gainneeded, true);
	    if (k > 1)
		gainneeded /= k;
	}
    }
};
