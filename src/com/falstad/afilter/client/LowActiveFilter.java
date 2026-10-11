package com.falstad.afilter.client;

class LowActiveFilter extends ActiveFilter {
    public LowActiveFilter(int f, StringTokenizer st) {
	super(f, st);
    }

    void buildStage(int i, int x, boolean real) {
	buildSallenKey(i, x, real, false);
    }

    void setValues() {
	int i;
	for (i = 0; i != stagePoles.length; i++) {
	    if (isBoctor(i)) {
		circuitGain *= setBoctor(i);
		continue;
	    }
	    Complex c1 = stagePoles[i];
	    double wp = c1.mag();
	    if (isReal(c1)) {
		double cx = pickCap(wp);
		res[i][0].setValue(1/(wp*cx));
		caps[i][0].setValue(cx);
		continue;
	    }
	    double q = getQ(c1);
	    double p = 1;
	    double cx = pickCap(q*wp*(1+p));
	    double r1 = 1/(q*wp*cx*(1+p));
	    res[i][0].setValue(r1);
	    res[i][1].setValue(p*r1);
	    caps[i][0].setValue(cx);
	    caps[i][1].setValue(q*q*cx*(1+p)*(1+p)/p);
	}
    }
};
