package com.falstad.afilter.client;

// Synthesis of LC ladder lowpass prototypes from an all-pole transfer function.
// Element values are normalized to a 1 rad/s prototype and a 1 ohm reference
// resistance; g[0] is the element nearest the source.
class LadderSynth {
    double g[];      // normalized element values (L for series, C for shunt)
    double load;     // normalized load resistance
    double gain;     // ratio of actual voltage gain to 1/E(s)

    // denominator polynomial with real coefficients from a set of normalized poles,
    // scaled so that E(0) = 1.  coefficient i is for s^i.
    static double [] polyFromPoles(Complex poles[]) {
	int n = poles.length;
	Complex poly[] = new Complex[n+1];
	int i, j;
	for (i = 0; i <= n; i++)
	    poly[i] = new Complex(0);
	poly[0].set(1);
	// multiply by (1 - s/p) for each pole
	for (i = 0; i != n; i++) {
	    Complex m = new Complex(-1);
	    m.divide(poles[i]);
	    for (j = i+1; j >= 1; j--) {
		Complex c = new Complex(poly[j-1]);
		c.mult(m);
		poly[j].add(c);
	    }
	}
	double e[] = new double[n+1];
	for (i = 0; i <= n; i++)
	    e[i] = poly[i].re;
	return e;
    }

    // Ideal voltage source (Rs = 0) driving a ladder terminated in a 1 ohm load.
    // The first element must be in series.
    static LadderSynth singlyTerminated(double e[]) {
	int n = e.length-1;
	double deven[] = new double[(n % 2 == 0) ? n+1 : n];
	double dodd[]  = new double[(n % 2 == 1) ? n+1 : n];
	int i;
	for (i = 0; i <= n; i++)
	    if (i % 2 == 0)
		deven[i] = e[i];
	    else
		dodd[i] = e[i];
	// continued fraction expansion of the even/odd parts, starting
	// with the part of higher degree.  this generates the elements
	// starting from the load end.
	double d1[] = (n % 2 == 0) ? deven : dodd;
	double d2[] = (n % 2 == 0) ? dodd : deven;
	double vals[] = new double[n];
	i = 0;
	while (d1.length > 1 && i < n) {
	    double ra = d1[d1.length-1]/d2[d2.length-1];
	    vals[i++] = ra;
	    double q[] = subtractShifted(d1, ra, d2, Math.max(d2.length-1, 1));
	    d1 = d2;
	    d2 = q;
	}
	LadderSynth ls = new LadderSynth();
	ls.g = new double[n];
	for (i = 0; i != n; i++)
	    ls.g[i] = vals[n-1-i];
	ls.load = 1;
	ls.gain = 1;
	return ls;
    }

    // Source and load resistance both present (Darlington synthesis), normalized
    // to Rs = 1.  The load is chosen to give maximum power transfer at the peak of
    // the response; it equals the source except for even-order Chebyshev filters.
    static LadderSynth doublyTerminated(double e[], boolean shuntFirst) {
	int n = e.length-1;
	int i, j;

	// k^2 = 1/max |1/E(jw)|^2, so that |S21| peaks at 1
	double m = maxGainSquared(e);
	double k2 = 1/m;

	// P(s) = E(s)E(-s) - k^2 = F(s)F(-s).  P is even, so find roots in w = s^2.
	double p[] = new double[2*n+1];
	for (i = 0; i <= n; i++)
	    for (j = 0; j <= n; j++)
		p[i+j] += e[i]*e[j]*((j % 2 == 0) ? 1 : -1);
	p[0] -= k2;
	double q[] = new double[n+1];
	double qmax = 0;
	for (i = 0; i <= n; i++) {
	    q[i] = p[2*i];
	    qmax = Math.max(qmax, Math.abs(q[i]));
	}
	// roots at w = 0 (reflection zeros at s = 0)
	int zc = 0;
	while (zc < n && Math.abs(q[zc]) < 1e-10*qmax)
	    zc++;
	double qr[] = new double[n+1-zc];
	for (i = 0; i != qr.length; i++)
	    qr[i] = q[i+zc];
	Complex wroots[] = findRoots(qr);

	// pick the left half plane root of each pair s = +/- sqrt(w)
	Complex sroots[] = new Complex[n];
	int sc = 0;
	for (i = 0; i != zc; i++)
	    sroots[sc++] = new Complex(0);
	int axisCount = 0;
	for (i = 0; i != wroots.length; i++) {
	    Complex s = new Complex(wroots[i]);
	    s.sqrt();
	    s.mult(-1);
	    sroots[sc++] = s;
	}
	// roots on the jw axis appear in pairs (double roots of P).  give the
	// members of each pair opposite signs so F has real coefficients.
	Complex axis[] = new Complex[n];
	for (i = 0; i != n; i++) {
	    Complex s = sroots[i];
	    if (s.mag() > 1e-8 && Math.abs(s.re) < 1e-6*s.mag()) {
		s.set(0, Math.abs(s.im));
		axis[axisCount++] = s;
	    }
	}
	for (i = 0; i != axisCount; i++)
	    for (j = i+1; j != axisCount; j++)
		if (axis[j].im < axis[i].im) {
		    Complex t = axis[i]; axis[i] = axis[j]; axis[j] = t;
		}
	for (i = 1; i < axisCount; i += 2) {
	    // the two members of a double root are only accurate to about
	    // sqrt(machine epsilon), but their mean is accurate
	    double mean = (axis[i-1].im + axis[i].im)/2;
	    axis[i-1].im = mean;
	    axis[i].im = -mean;
	}

	// F(s) = c * prod(s - s_i), with c = +/- leading coeff of E.  The sign
	// determines whether the input impedance starts with a series or shunt element.
	Complex f[] = new Complex[n+1];
	for (i = 0; i <= n; i++)
	    f[i] = new Complex(0);
	f[0].set(1);
	for (i = 0; i != n; i++) {
	    Complex nr = new Complex(sroots[i]);
	    nr.mult(-1);
	    for (j = i+1; j >= 0; j--) {
		Complex c = new Complex(f[j]);
		c.mult(nr);
		if (j > 0)
		    c.add(f[j-1]);
		f[j] = c;
	    }
	}
	double c = shuntFirst ? -e[n] : e[n];
	double epf[] = new double[n+1];
	double emf[] = new double[n+1];
	for (i = 0; i <= n; i++) {
	    epf[i] = e[i] + c*f[i].re;
	    emf[i] = e[i] - c*f[i].re;
	}

	// Zin = (E+F)/(E-F).  expand as a continued fraction.  num/den is an
	// impedance when isZ is true, otherwise an admittance.
	boolean isZ = !shuntFirst;
	double num[] = isZ ? epf : emf;
	double den[] = trim(isZ ? emf : epf, n);
	LadderSynth ls = new LadderSynth();
	ls.g = new double[n];
	for (i = 0; i != n; i++) {
	    double v = num[num.length-1]/den[den.length-1];
	    ls.g[i] = v;
	    double rem[] = subtractShifted(num, v, den, Math.max(den.length-1, 1));
	    num = den;
	    den = rem;
	    isZ = !isZ;
	}
	ls.load = isZ ? num[0]/den[0] : den[0]/num[0];
	ls.gain = .5*Math.sqrt(ls.load)/Math.sqrt(m);
	return ls;
    }

    // roots of a polynomial using Aberth iteration.  this finds all roots
    // simultaneously without deflation, which behaves better than Laguerre
    // with deflation when there are multiple roots (as with Chebyshev).
    static Complex [] findRoots(double a[]) {
	int n = a.length-1;
	int i, j, iter;
	Complex z[] = new Complex[n];
	double rad = 0;
	for (i = 0; i != n; i++)
	    rad = Math.max(rad, Math.abs(a[i]/a[n]));
	rad = 1+rad;
	for (i = 0; i != n; i++) {
	    z[i] = new Complex();
	    z[i].setMagPhase(rad*.5, 2*Math.PI*i/n + .4);
	}
	for (iter = 0; iter != 1000; iter++) {
	    double maxStep = 0;
	    for (i = 0; i != n; i++) {
		// p(z) and p'(z) by Horner's method
		Complex p = new Complex(a[n]);
		Complex dp = new Complex(0);
		for (j = n-1; j >= 0; j--) {
		    dp.mult(z[i]);
		    dp.add(p);
		    p.mult(z[i]);
		    p.add(a[j]);
		}
		if (p.magSquared() == 0)
		    continue;
		Complex ratio = new Complex(p);
		ratio.divide(dp);
		Complex sum = new Complex(0);
		for (j = 0; j != n; j++) {
		    if (j == i)
			continue;
		    Complex d = new Complex(z[i]);
		    d.subtract(z[j]);
		    d.recip();
		    sum.add(d);
		}
		// step = ratio/(1 - ratio*sum)
		Complex den = new Complex(ratio);
		den.mult(sum);
		den.mult(-1);
		den.add(1);
		Complex step = new Complex(ratio);
		step.divide(den);
		z[i].subtract(step);
		maxStep = Math.max(maxStep, step.mag()/(1+z[i].mag()));
	    }
	    if (maxStep < 1e-15)
		break;
	}
	return z;
    }

    // a - mult*s*b, truncated to len coefficients
    static double [] subtractShifted(double a[], double mult, double b[], int len) {
	double r[] = new double[len];
	int i;
	for (i = 0; i != len; i++) {
	    r[i] = (i < a.length) ? a[i] : 0;
	    if (i >= 1 && i-1 < b.length)
		r[i] -= mult*b[i-1];
	}
	return r;
    }

    static double [] trim(double a[], int len) {
	double r[] = new double[len];
	int i;
	for (i = 0; i != len; i++)
	    r[i] = a[i];
	return r;
    }

    static double gainSquared(double e[], double w) {
	Complex s = new Complex(0, w);
	Complex x = new Complex(e[e.length-1]);
	int i;
	for (i = e.length-2; i >= 0; i--) {
	    x.mult(s);
	    x.add(e[i]);
	}
	return 1/x.magSquared();
    }

    // max over w of |1/E(jw)|^2
    static double maxGainSquared(double e[]) {
	int steps = 4000;
	double wmax = 4;
	int i, best = 0;
	double bestv = gainSquared(e, 0);
	for (i = 1; i <= steps; i++) {
	    double v = gainSquared(e, i*wmax/steps);
	    if (v > bestv) {
		bestv = v;
		best = i;
	    }
	}
	if (best == 0)
	    return bestv;
	// refine with golden section search
	double a = (best-1)*wmax/steps;
	double b = (best+1)*wmax/steps;
	double gr = (Math.sqrt(5)-1)/2;
	for (i = 0; i != 100; i++) {
	    double x1 = b - gr*(b-a);
	    double x2 = a + gr*(b-a);
	    if (gainSquared(e, x1) > gainSquared(e, x2))
		b = x2;
	    else
		a = x1;
	}
	return Math.max(bestv, gainSquared(e, (a+b)/2));
    }
}
