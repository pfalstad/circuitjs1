package com.falstad.afilter.client;

// Elliptic filter lowpass prototype, using Landen transformations to compute
// the Jacobi elliptic functions (S. J. Orfanidis, "Lecture Notes on Elliptic
// Filter Design").  The prototype has its passband edge at 1 rad/s.
class Elliptic {
    Complex poles[];  // conjugate pairs at i and n-1-i, real pole in the middle
    double zeros[];   // positive frequencies of the finite zeros, increasing
    double k;         // selectivity, passband edge/stopband edge
    double peak;      // highest frequency in the passband with unity gain

    Elliptic(int n, double passDb, double stopDb) {
	double ep = Math.sqrt(Math.pow(10, passDb/10)-1);
	double es = Math.sqrt(Math.pow(10, stopDb/10)-1);
	double k1 = ep/es;
	double k1p = Math.sqrt((1-k1)*(1+k1));

	// solve the degree equation n K'/K = K1'/K1 for k, using whichever of
	// the nome and the complementary nome is smaller for accuracy
	double r = agm(1, k1p)/(n*agm(1, k1));  // K'/K = K1'/(n K1)
	double kp;
	if (r >= 1) {
	    k = nomeModulus(Math.exp(-Math.PI*r));
	    kp = Math.sqrt((1-k)*(1+k));
	} else {
	    kp = nomeModulus(Math.exp(-Math.PI/r));
	    k = Math.sqrt((1-kp)*(1+kp));
	}
	double v[] = landen(k, kp);
	peak = cde(new Complex(1./n, 0), v).re;

	// v0 = asne(j/ep, k1)/(jn)
	double v1[] = landen(k1, k1p);
	double y = 1/ep;
	int i;
	for (i = 0; i != v1.length; i++) {
	    double kprev = (i == 0) ? k1 : v1[i-1];
	    y = y/(1+Math.sqrt(1+y*y*kprev*kprev)) * 2/(1+v1[i]);
	}
	double v0 = 2/Math.PI*Math.log(y+Math.sqrt(y*y+1))/n;

	int l = n/2;
	poles = new Complex[n];
	zeros = new double[l];
	for (i = 0; i != l; i++) {
	    double u = (2*i+1)/(double) n;
	    // zero at j/(k cd(u K))
	    zeros[i] = 1/(k*cde(new Complex(u, 0), v).re);
	    // pole at j cd((u - j v0) K)
	    Complex p = cde(new Complex(u, -v0), v);
	    p.mult(0, 1);
	    poles[i] = p;
	    poles[n-1-i] = new Complex(p);
	    poles[n-1-i].conjugate();
	}
	if (n % 2 == 1) {
	    // real pole at j sn(j v0 K)
	    Complex p = sne(new Complex(0, v0), v);
	    p.mult(0, 1);
	    poles[l] = p;
	}
    }

    // arithmetic-geometric mean; K(k) = pi/(2 agm(1, k'))
    static double agm(double a, double b) {
	while (Math.abs(a-b) > 1e-15*a) {
	    double m = (a+b)/2;
	    b = Math.sqrt(a*b);
	    a = m;
	}
	return a;
    }

    // modulus from the nome q (small q only)
    static double nomeModulus(double q) {
	double num = 0, den = 1;
	int m;
	for (m = 0; m != 8; m++) {
	    num += Math.pow(q, m*(m+1));
	    if (m > 0)
		den += 2*Math.pow(q, m*m);
	}
	double x = num/den;
	return 4*Math.sqrt(q)*x*x;
    }

    // descending Landen sequence of moduli starting from k (not included).
    // the complementary moduli are carried along to avoid cancellation.
    static double [] landen(double k, double kp) {
	double v[] = new double[20];
	int n = 0;
	while (n < v.length) {
	    double kn = k/(1+kp);
	    kn *= kn;
	    kp = 2*Math.sqrt(kp)/(1+kp);
	    k = kn;
	    v[n++] = k;
	    if (k < 1e-16)
		break;
	}
	double r[] = new double[n];
	for (int i = 0; i != n; i++)
	    r[i] = v[i];
	return r;
    }

    // cd(uK, k) and sn(uK, k), using ascending Landen transformations from
    // the trigonometric functions
    static Complex cde(Complex u, double v[]) {
	double a = u.re*Math.PI/2, b = u.im*Math.PI/2;
	return ascend(new Complex(Math.cos(a)*cosh(b), -Math.sin(a)*sinh(b)), v);
    }

    static Complex sne(Complex u, double v[]) {
	double a = u.re*Math.PI/2, b = u.im*Math.PI/2;
	return ascend(new Complex(Math.sin(a)*cosh(b), Math.cos(a)*sinh(b)), v);
    }

    static Complex ascend(Complex w, double v[]) {
	int i;
	for (i = v.length-1; i >= 0; i--) {
	    // w = (1+v) w/(1 + v w^2)
	    Complex d = new Complex(w);
	    d.square();
	    d.mult(v[i]);
	    d.add(1);
	    w.mult(1+v[i]);
	    w.divide(d);
	}
	return w;
    }

    static double cosh(double x) { return .5*(Math.exp(x)+Math.exp(-x)); }
    static double sinh(double x) { return .5*(Math.exp(x)-Math.exp(-x)); }
}
