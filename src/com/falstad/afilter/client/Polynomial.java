package com.falstad.afilter.client;

class Polynomial {
    double[] coeffs; // coeffs[i] = coefficient of s^i

    Polynomial(double... c) {
	if (c.length == 0) {
	    coeffs = new double[] { 0 };
	} else {
	    coeffs = new double[c.length];
	    for (int i = 0; i < c.length; i++)
		coeffs[i] = c[i];
	}
    }

    Polynomial(int degree) {
	coeffs = new double[degree + 1];
    }

    int degree() {
	for (int i = coeffs.length - 1; i > 0; i--)
	    if (coeffs[i] != 0)
		return i;
	return 0;
    }

    boolean isZero() {
	for (int i = 0; i < coeffs.length; i++)
	    if (coeffs[i] != 0)
		return false;
	return true;
    }

    Polynomial add(Polynomial b) {
	int len = Math.max(coeffs.length, b.coeffs.length);
	Polynomial r = new Polynomial(len - 1);
	for (int i = 0; i < coeffs.length; i++)
	    r.coeffs[i] += coeffs[i];
	for (int i = 0; i < b.coeffs.length; i++)
	    r.coeffs[i] += b.coeffs[i];
	return r;
    }

    Polynomial subtract(Polynomial b) {
	int len = Math.max(coeffs.length, b.coeffs.length);
	Polynomial r = new Polynomial(len - 1);
	for (int i = 0; i < coeffs.length; i++)
	    r.coeffs[i] += coeffs[i];
	for (int i = 0; i < b.coeffs.length; i++)
	    r.coeffs[i] -= b.coeffs[i];
	return r;
    }

    Polynomial multiply(Polynomial b) {
	int d = degree() + b.degree();
	Polynomial r = new Polynomial(d);
	for (int i = 0; i <= degree(); i++)
	    for (int j = 0; j <= b.degree(); j++)
		r.coeffs[i + j] += coeffs[i] * b.coeffs[j];
	return r;
    }

    Polynomial negate() {
	Polynomial r = new Polynomial(coeffs.length - 1);
	for (int i = 0; i < coeffs.length; i++)
	    r.coeffs[i] = -coeffs[i];
	return r;
    }

    Polynomial scale(double s) {
	Polynomial r = new Polynomial(coeffs.length - 1);
	for (int i = 0; i < coeffs.length; i++)
	    r.coeffs[i] = coeffs[i] * s;
	return r;
    }

    // Exact division: this / divisor with no remainder.
    // Used in Bareiss algorithm where divisions are guaranteed exact.
    Polynomial exactDiv(Polynomial divisor) {
	if (divisor.isZero())
	    return new Polynomial(0);
	// Polynomial long division
	int n = degree();
	int d = divisor.degree();
	if (n < d)
	    return new Polynomial(0);
	double[] rem = new double[n + 1];
	for (int i = 0; i <= n; i++)
	    rem[i] = (i < coeffs.length) ? coeffs[i] : 0;
	double[] result = new double[n - d + 1];
	for (int i = n - d; i >= 0; i--) {
	    result[i] = rem[i + d] / divisor.coeffs[d];
	    for (int j = 0; j <= d; j++)
		rem[i + j] -= result[i] * divisor.coeffs[j];
	}
	return new Polynomial(result);
    }

    // Evaluate polynomial at complex value s using Horner's method
    Complex evaluate(Complex s) {
	int d = degree();
	Complex result = new Complex(coeffs[d]);
	for (int i = d - 1; i >= 0; i--) {
	    result.mult(s);
	    result.add(coeffs[i]);
	}
	return result;
    }

    // Strip leading zero coefficients (highest-degree zeros)
    // and also strip trailing zero coefficients (common s factors)
    Polynomial stripLeadingZeros() {
	int hi = degree();
	int lo = 0;
	while (lo < hi && coeffs[lo] == 0)
	    lo++;
	double[] c = new double[hi - lo + 1];
	for (int i = 0; i < c.length; i++)
	    c[i] = coeffs[i + lo];
	return new Polynomial(c);
    }

    // Return the lowest power of s with a nonzero coefficient.
    // e.g. for 3s^2 + 5s^4, returns 2.
    int lowestPower() {
	for (int i = 0; i < coeffs.length; i++)
	    if (coeffs[i] != 0)
		return i;
	return 0;
    }

    // Divide out s^n, shifting coefficients down by n.
    Polynomial divideByS(int n) {
	if (n == 0)
	    return this;
	int hi = degree();
	if (n > hi)
	    return new Polynomial(0.0);
	double[] c = new double[hi - n + 1];
	for (int i = 0; i < c.length; i++)
	    c[i] = coeffs[i + n];
	return new Polynomial(c);
    }

    // Strip only trailing zero coefficients (common s^n factor from bottom)
    Polynomial stripTrailingZeros() {
	return divideByS(lowestPower());
    }

    String asString() {
	StringBuilder sb = new StringBuilder();
	for (int i = degree(); i >= 0; i--) {
	    if (coeffs[i] == 0 && degree() > 0) continue;
	    if (sb.length() > 0 && coeffs[i] >= 0) sb.append("+");
	    sb.append(coeffs[i]);
	    if (i > 0) sb.append("s^" + i);
	}
	return sb.toString();
    }
}
