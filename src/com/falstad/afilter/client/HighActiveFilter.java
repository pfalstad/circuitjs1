package com.falstad.afilter.client;

class HighActiveFilter extends ActiveFilter {
    public HighActiveFilter(int f, StringTokenizer st) {
	super(f, st);
    }

    void buildStage(int i, int x, boolean real) {
	buildSallenKey(i, x, real, true);
    }

    void setValues() {
	int i;
	for (i = 0; i != stagePoles.length; i++) {
	    Complex c1 = stagePoles[i];
	    double wp = c1.mag();
	    if (isReal(c1)) {
		double cx = pickCap(wp);
		caps[i][0].setValue(cx);
		res[i][0].setValue(1/(wp*cx));
		continue;
	    }
	    double q = getQ(c1);
	    double p = 1;
	    while (p < 4*q*q)
		p++;
	    // second capacitor is f*cx
	    double f = (p-2*q*q-Math.sqrt(p*p-4*p*q*q))/(2*q*q);
	    double cx = pickCap(q*wp*(1+f));
	    double r2 = 1/(q*wp*cx*(1+f));
	    caps[i][0].setValue(cx);
	    caps[i][1].setValue(f*cx);
	    res[i][0].setValue(p*r2);  // to ground
	    res[i][1].setValue(r2);    // feedback
	}
    }
};
