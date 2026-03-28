package com.falstad.afilter.client;

class RootFinder {

    // Find complex roots of a real-coefficient polynomial using
    // Laguerre's method with deflation.
    static Complex[] findRoots(Polynomial p) {
	int n = p.degree();
	if (n == 0)
	    return new Complex[0];

	// Work with a copy of the coefficients
	double[] coeffs = new double[n + 1];
	for (int i = 0; i <= n; i++)
	    coeffs[i] = (i < p.coeffs.length) ? p.coeffs[i] : 0;

	Complex[] roots = new Complex[n];

	// Deflate and find roots one at a time
	double[] poly = new double[n + 1];
	for (int i = 0; i <= n; i++)
	    poly[i] = coeffs[i];

	for (int i = n; i >= 1; i--) {
	    // Find one root of the degree-i polynomial in poly[0..i]
	    Complex root = laguerreRoot(poly, i, new Complex(0, 0));

	    // Polish: refine against original polynomial
	    root = laguerreRoot(coeffs, n, root);

	    // If imaginary part is very small relative to real part,
	    // snap to real axis
	    if (Math.abs(root.im) < Math.abs(root.re) * 1e-10)
		root.im = 0;

	    roots[n - i] = root;

	    // Deflate: divide poly by (x - root)
	    if (root.im == 0) {
		// Real root: synthetic division by (x - root.re)
		double[] newpoly = new double[i];
		newpoly[i - 1] = poly[i];
		for (int j = i - 2; j >= 0; j--)
		    newpoly[j] = poly[j + 1] + newpoly[j + 1] * root.re;
		poly = newpoly;
	    } else {
		// Complex root: also extract conjugate, divide by
		// (x - root)(x - conj(root)) = x^2 - 2*re*x + |root|^2
		roots[n - i + 1] = new Complex(root.re, -root.im);
		double a = -2 * root.re;
		double b = root.re * root.re + root.im * root.im;
		double[] newpoly = new double[i - 1];
		newpoly[i - 2] = poly[i];
		if (i - 3 >= 0)
		    newpoly[i - 3] = poly[i - 1] - a * newpoly[i - 2];
		for (int j = i - 4; j >= 0; j--)
		    newpoly[j] = poly[j + 2] - a * newpoly[j + 1]
			    - b * newpoly[j + 2];
		poly = newpoly;
		i--; // consumed two roots
	    }
	}

	return roots;
    }

    // Laguerre's method: find one root of polynomial with real coefficients.
    // poly[0..deg] are coefficients (poly[deg] is leading).
    private static Complex laguerreRoot(double[] poly, int deg,
	    Complex guess) {
	Complex x = new Complex(guess);
	int maxIter = 200;
	for (int iter = 0; iter < maxIter; iter++) {
	    // Evaluate p(x), p'(x), p''(x)
	    Complex p = new Complex(poly[deg]);
	    Complex dp = new Complex(0, 0);
	    Complex d2p = new Complex(0, 0);
	    for (int i = deg - 1; i >= 0; i--) {
		// d2p = d2p*x + 2*dp  (but we accumulate d2p = p''/2)
		d2p.mult(x);
		d2p.add(dp);
		// dp = dp*x + p
		dp.mult(x);
		dp.add(p);
		// p = p*x + coeff[i]
		p.mult(x);
		p.add(poly[i]);
	    }

	    double pm = p.mag();
	    if (pm == 0)
		break;

	    // G = p'/p, H = G^2 - p''/p = (p'/p)^2 - p''/p
	    // Note: d2p is actually p''/2, so we use 2*d2p
	    Complex g = new Complex(dp);
	    g.divide(p);

	    Complex h = new Complex(g);
	    h.mult(g); // G^2
	    Complex d2pOverP = new Complex(d2p);
	    d2pOverP.mult(2); // p'' (since d2p was p''/2 via Horner)

	    // Wait, the Horner accumulation of d2p gives p''/2, not p''.
	    // Actually let me redo: we have d2p = sum of second derivatives/2
	    // So H = G^2 - 2*d2p/p
	    d2pOverP.divide(p);
	    h.subtract(d2pOverP);

	    // Laguerre formula: a = n / (G ± sqrt((n-1)(nH - G^2)))
	    Complex sq = new Complex(h);
	    sq.mult(deg);
	    Complex g2 = new Complex(g);
	    g2.mult(g);
	    sq.subtract(g2);
	    sq.mult(deg - 1);
	    // sq = (n-1)(nH - G^2)

	    // Complex square root
	    double sqm = Math.sqrt(sq.re * sq.re + sq.im * sq.im);
	    double sqr, sqi;
	    if (sqm == 0) {
		sqr = sqi = 0;
	    } else {
		double sqarg = Math.atan2(sq.im, sq.re) / 2;
		double sqabs = Math.sqrt(sqm);
		sqr = sqabs * Math.cos(sqarg);
		sqi = sqabs * Math.sin(sqarg);
	    }

	    // Choose sign that gives larger denominator magnitude
	    Complex denomPlus = new Complex(g.re + sqr, g.im + sqi);
	    Complex denomMinus = new Complex(g.re - sqr, g.im - sqi);
	    Complex denom;
	    if (denomPlus.magSquared() > denomMinus.magSquared())
		denom = denomPlus;
	    else
		denom = denomMinus;

	    if (denom.magSquared() == 0) {
		// Stuck; nudge
		x.re += 1;
		x.im += 0.5;
		continue;
	    }

	    Complex a = new Complex(deg, 0);
	    a.divide(denom);

	    x.re -= a.re;
	    x.im -= a.im;

	    if (a.mag() < 1e-14 * (1 + x.mag()))
		break;

	    // Check for NaN
	    if (Double.isNaN(x.re) || Double.isNaN(x.im)) {
		x.set(guess.re + 1, guess.im + 0.5);
	    }
	}
	return x;
    }
}
