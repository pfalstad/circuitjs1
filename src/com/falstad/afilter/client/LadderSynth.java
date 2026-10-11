package com.falstad.afilter.client;

// Synthesis of LC ladder lowpass prototypes from a transfer function N(s)/E(s),
// where N(s) is even with zeros on the jw axis (or 1 for an all-pole filter).
// Element values are normalized to a 1 rad/s prototype and a 1 ohm reference
// resistance; g[0] is the element nearest the source.
class LadderSynth {
    double g[];      // normalized element values (L for series, C for shunt)
    double wz[];     // if nonzero, the element has a companion (C across a series L,
                     // or L in series with a shunt C) of value 1/(g*wz^2), resonating
                     // at wz to give a transmission zero there
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

    // numerator polynomial with zeros at +/- j*z[i], scaled so that N(0) = 1
    static double [] polyFromZeros(double z[]) {
	double nz[] = new double[2*z.length+1];
	nz[0] = 1;
	int i, j;
	// multiply by (1 + s^2/z^2) for each pair
	for (i = 0; i != z.length; i++)
	    for (j = 2*i+2; j >= 2; j--)
		nz[j] += nz[j-2]/(z[i]*z[i]);
	return nz;
    }

    // Ideal voltage source (Rs = 0) driving a ladder terminated in a 1 ohm load.
    // The first element must be in series.  zeros are the finite transmission
    // zeros (the roots of nz are +/- j*zeros[i]).
    static LadderSynth singlyTerminated(double e[], double zeros[]) {
	int n = e.length-1;
	double deven[] = new double[(n % 2 == 0) ? n+1 : n];
	double dodd[]  = new double[(n % 2 == 1) ? n+1 : n];
	int i;
	for (i = 0; i <= n; i++)
	    if (i % 2 == 0)
		deven[i] = e[i];
	    else
		dodd[i] = e[i];
	// y22 = even/odd part of E, since y21 = N/odd part.  expand it starting
	// with the part of higher degree, which generates the elements starting
	// from the load end.
	boolean isZ = (n % 2 == 1);
	LadderSynth ls = expand(isZ ? dodd : deven, isZ ? deven : dodd, isZ, zeros, n);
	double g[] = ls.g, wz[] = ls.wz;
	ls.g = new double[n];
	ls.wz = new double[n];
	for (i = 0; i != n; i++) {
	    ls.g[i] = g[n-1-i];
	    ls.wz[i] = wz[n-1-i];
	}
	ls.load = 1;
	ls.gain = 1;
	return ls;
    }

    // Source and load resistance both present (Darlington synthesis), normalized
    // to Rs = 1.  The load is chosen to give maximum power transfer at the peak of
    // the response; it equals the source except for even-order Chebyshev filters.
    static LadderSynth doublyTerminated(double e[], double zeros[], boolean shuntFirst) {
	int n = e.length-1;
	int i, j;
	double nz[] = polyFromZeros(zeros);

	// k^2 = 1/max |N(jw)/E(jw)|^2, so that |S21| peaks at 1
	double m = maxGainSquared(e, nz);
	double k2 = 1/m;

	// P(s) = E(s)E(-s) - k^2 N(s)^2 = F(s)F(-s).  P is even, so find roots in w = s^2.
	double p[] = new double[2*n+1];
	for (i = 0; i <= n; i++)
	    for (j = 0; j <= n; j++)
		p[i+j] += e[i]*e[j]*((j % 2 == 0) ? 1 : -1);
	for (i = 0; i != nz.length; i++)
	    for (j = 0; j != nz.length; j++)
		p[i+j] -= k2*nz[i]*nz[j];
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

	// Zin = (E+F)/(E-F).  num/den is an impedance when isZ is true,
	// otherwise an admittance.
	boolean isZ = !shuntFirst;
	LadderSynth ls = expand(isZ ? epf : emf, trim(isZ ? emf : epf, n), isZ, zeros, n);
	ls.gain = .5*Math.sqrt(ls.load)/Math.sqrt(m);
	return ls;
    }

    // Expand an LC immittance num/den with a pole at infinity into n ladder
    // elements, realizing the given finite transmission zeros, and take what
    // remains as the load.  The rest of the transmission zeros are at infinity;
    // the last element realizes one of them, and the others may be realized
    // anywhere in between.  The order affects whether all elements are positive,
    // so try every order.
    static LadderSynth expand(double num[], double den[], boolean isZ, double zeros[], int n) {
	int m = zeros.length;
	int ninf = n-2*m;
	int perm[] = new int[m+ninf-1];
	int i;
	for (i = 0; i != perm.length; i++)
	    perm[i] = Math.min(i, m);
	LadderSynth first = null;
	while (true) {
	    double z[] = new double[perm.length];
	    for (i = 0; i != perm.length; i++)
		z[i] = (perm[i] == m) ? Double.POSITIVE_INFINITY : zeros[perm[i]];
	    LadderSynth ls = expandOrder(num, den, isZ, z, n);
	    if (first == null)
		first = ls;
	    if (ls.isPositive())
		return ls;
	    if (!nextPermutation(perm))
		return first;
	}
    }

    static LadderSynth expandOrder(double num[], double den[], boolean isZ, double zeros[], int n) {
	LadderSynth ls = new LadderSynth();
	ls.g = new double[n];
	ls.wz = new double[n];
	int pos = 0, zi = 0;
	while (pos < n) {
	    double w = (zi < zeros.length) ? zeros[zi++] : Double.POSITIVE_INFINITY;
	    if (w != Double.POSITIVE_INFINITY && pos+1 < n) {
		// partial removal of the pole at infinity, leaving zeros at s = +/- jw
		Complex wv = evalAt(num, w);
		wv.divide(evalAt(den, w));
		double v = wv.im/w;
		ls.g[pos++] = v;
		// num - v*s*den now has a factor of s^2+w^2
		double q[] = divideQuad(subtractShifted(num, v, den, num.length), w);
		// the reciprocal den/q(s^2+w^2) has poles at +/- jw.  remove them
		// completely as a resonator with residue K s/(s^2+w^2).
		Complex kv = evalAt(den, w);
		kv.divide(evalAt(q, w));
		kv.divide(new Complex(0, w));
		double k = kv.re;
		ls.g[pos] = k/(w*w);
		ls.wz[pos++] = w;
		// what remains is r/q, and its reciprocal has a pole at infinity
		// so the next element is of the same kind as the one before the resonator
		double r[] = divideQuad(subtractShifted(den, k, q, den.length), w);
		num = q;
		den = r;
	    } else {
		// full removal of the pole at infinity
		double v = num[num.length-1]/den[den.length-1];
		ls.g[pos++] = v;
		double rem[] = subtractShifted(num, v, den, Math.max(den.length-1, 1));
		num = den;
		den = rem;
		isZ = !isZ;
	    }
	}
	ls.load = isZ ? num[0]/den[0] : den[0]/num[0];
	return ls;
    }

    boolean isPositive() {
	int i;
	for (i = 0; i != g.length; i++)
	    if (!(g[i] > 0))
		return false;
	return true;
    }

    // advance to the next permutation in lexicographic order
    static boolean nextPermutation(int p[]) {
	int i = p.length-2;
	while (i >= 0 && p[i] >= p[i+1])
	    i--;
	if (i < 0)
	    return false;
	int j = p.length-1;
	while (p[j] <= p[i])
	    j--;
	int t = p[i]; p[i] = p[j]; p[j] = t;
	for (i++, j = p.length-1; i < j; i++, j--) {
	    t = p[i]; p[i] = p[j]; p[j] = t;
	}
	return true;
    }

    // a(s)/(s^2+w^2), discarding the remainder
    static double [] divideQuad(double a[], double w) {
	int d = a.length-1;
	if (d < 2)
	    return new double[1];
	double q[] = new double[d-1];
	int k;
	for (k = d-2; k >= 0; k--)
	    q[k] = a[k+2] - ((k+2 <= d-2) ? w*w*q[k+2] : 0);
	return q;
    }

    // a(jw)
    static Complex evalAt(double a[], double w) {
	Complex s = new Complex(0, w);
	Complex x = new Complex(a[a.length-1]);
	int i;
	for (i = a.length-2; i >= 0; i--) {
	    x.mult(s);
	    x.add(a[i]);
	}
	return x;
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

    // |N(jw)/E(jw)|^2
    static double gainSquared(double e[], double nz[], double w) {
	return evalAt(nz, w).magSquared()/evalAt(e, w).magSquared();
    }

    // max over w of |N(jw)/E(jw)|^2
    static double maxGainSquared(double e[], double nz[]) {
	int steps = 4000;
	double wmax = 4;
	int i, best = 0;
	double bestv = gainSquared(e, nz, 0);
	for (i = 1; i <= steps; i++) {
	    double v = gainSquared(e, nz, i*wmax/steps);
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
	    if (gainSquared(e, nz, x1) > gainSquared(e, nz, x2))
		b = x2;
	    else
		a = x1;
	}
	return Math.max(bestv, gainSquared(e, nz, (a+b)/2));
    }
}
