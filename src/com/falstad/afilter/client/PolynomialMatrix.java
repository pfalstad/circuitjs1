package com.falstad.afilter.client;

// Finds the poles and zeros of a circuit's transfer function directly as
// generalized eigenvalues, without expanding any determinants into
// polynomials (finding roots from polynomial coefficients is badly
// conditioned, and cofactor expansion is exponential in the matrix size).
//
// The input is the s-multiplied polynomial matrix built by the poly stamps,
// so every entry is s*(P0/s + P1 + s*P2) for constant matrices P0, P1, P2.
// That is turned into a linear pencil G + sC.  Infinite eigenvalues (from
// algebraic constraints like voltage sources) and eigenvalues at s=0 are
// removed exactly by deflation, and the rest are the eigenvalues of -C^-1 G.
// Zeros are found the same way from the matrix bordered by the right side
// and the output row.
class PolynomialMatrix {

    static class Result {
	Complex[] poles, zeros;
	double gain; // H(s) = gain * prod(s - zeros) / prod(s - poles)
	boolean singular; // circuit matrix is singular for all s
    }

    // Linear pencil G + sC
    static class Pencil {
	double[][] g, c;
	double[] gScale, cScale;
	int n;
	int auxCount;
    }

    // Returns null if the matrix can't be handled (entries of degree > 2
    // or the eigenvalue iteration failed); the caller should fall back to
    // solving at each frequency.
    static Result solve(Polynomial[][] mat, Polynomial[] rhs, int n, int out) {
	Result res = new Result();

	// denominator: det(mat)
	Pencil den = linearize(mat, n);
	if (den == null)
	    return null;
	int denAux = den.auxCount;
	if (!equilibrate(den) || deflate(den, false) < 0) {
	    res.singular = true;
	    return res;
	}
	int denOrigin = deflate(den, true);
	Complex[] poles = finiteEigs(den);
	if (poles == null)
	    return null;

	// numerator (up to sign): det of mat bordered by the right side
	// (column) and the output selector (row).  The row is multiplied by s
	// like everything else.
	Polynomial[][] bord = new Polynomial[n+1][n+1];
	Polynomial zero = new Polynomial(0);
	for (int i = 0; i < n; i++) {
	    for (int j = 0; j < n; j++)
		bord[i][j] = mat[i][j];
	    bord[i][n] = rhs[i];
	    bord[n][i] = zero;
	}
	bord[n][out] = new Polynomial(0, 1);
	bord[n][n] = zero;
	Pencil num = linearize(bord, n+1);
	if (num == null)
	    return null;
	int numAux = num.auxCount;
	if (!equilibrate(num) || deflate(num, false) < 0) {
	    // numerator is identically zero
	    res.poles = poles;
	    res.zeros = new Complex[0];
	    res.gain = 0;
	    return res;
	}
	int numOrigin = deflate(num, true);
	Complex[] zeros = finiteEigs(num);
	if (zeros == null)
	    return null;

	// det(pencil) = const * s^(auxCount - size) * det(matrix), so the
	// auxiliary variables shift the order of the root at the origin.
	// Common roots at the origin cancel.
	int origin = numOrigin - denOrigin + denAux - numAux;
	if (origin > 0)
	    zeros = appendOrigin(zeros, origin);
	else if (origin < 0)
	    poles = appendOrigin(poles, -origin);
	res.poles = poles;
	res.zeros = zeros;
	res.gain = findGain(mat, rhs, n, out, poles, zeros);
	return res;
    }

    static double coef(Polynomial p, int k) {
	return (k < p.coeffs.length) ? p.coeffs[k] : 0;
    }

    // Build a pencil whose determinant is det(p(s)) up to a constant factor
    // and a power of s.  Since p is s-multiplied, p(s)/s = P0/s + P1 + s*P2.
    // A row with a P0 term gets an auxiliary variable y = (P0 row . x)/s,
    // giving the equations (P1 + s*P2) x + y = 0 and (P0 row) x - s*y = 0.
    static Pencil linearize(Polynomial[][] p, int m) {
	int i, j;
	int aux = 0;
	boolean[] hasConst = new boolean[m];
	for (i = 0; i < m; i++)
	    for (j = 0; j < m; j++) {
		if (p[i][j].degree() > 2)
		    return null;
		if (coef(p[i][j], 0) != 0 && !hasConst[i]) {
		    hasConst[i] = true;
		    aux++;
		}
	    }
	Pencil pen = new Pencil();
	pen.n = m + aux;
	pen.auxCount = aux;
	pen.g = new double[pen.n][pen.n];
	pen.c = new double[pen.n][pen.n];
	int a = m;
	for (i = 0; i < m; i++) {
	    for (j = 0; j < m; j++) {
		pen.g[i][j] = coef(p[i][j], 1);
		pen.c[i][j] = coef(p[i][j], 2);
	    }
	    if (hasConst[i]) {
		pen.g[i][a] = 1;
		for (j = 0; j < m; j++)
		    pen.g[a][j] = coef(p[i][j], 0);
		pen.c[a][a] = -1;
		a++;
	    }
	}
	return pen;
    }

    // Remove the infinite eigenvalues of the pencil G + sC (or, if atZero is
    // set, the zero eigenvalues, which are the infinite eigenvalues of
    // C + tG with t = 1/s).  Returns the number removed, or -1 if the pencil
    // is singular (determinant identically zero).
    //
    // Row-reduce B (the matrix multiplying s) to expose rows that are zero.
    // A zero row of B is an equation with no s in it; use it to eliminate a
    // variable (column operations, which keep B's zero rows zero), leaving
    // that row with a single constant entry, then delete that row and
    // column.  That divides the determinant by a constant, so it removes
    // exactly one infinite eigenvalue.  Repeat until B is nonsingular.
    //
    // Whether an entry is zero is judged against the size of the entries
    // that went into its row (gScale/cScale), since cancellation leaves
    // rounding error proportional to those.
    static int deflate(Pencil p, boolean atZero) {
	final double tol = 1e-10;
	int removed = 0;
	double[][] a = atZero ? p.c : p.g;
	double[][] b = atZero ? p.g : p.c;
	double[] as = atZero ? p.cScale : p.gScale;
	double[] bs = atZero ? p.gScale : p.cScale;
	while (p.n > 0) {
	    int n = p.n;
	    int i, j, k;

	    // rank-revealing LU of b with complete pivoting (relative to each
	    // row's scale); apply the same row operations to a, and the column
	    // swaps (variable reordering) to both
	    int rank = n;
	    for (k = 0; k < n; k++) {
		int pr = k, pc = k;
		double max = 0;
		for (i = k; i < n; i++) {
		    if (bs[i] == 0)
			continue;
		    for (j = k; j < n; j++)
			if (Math.abs(b[i][j])/bs[i] > max) {
			    max = Math.abs(b[i][j])/bs[i];
			    pr = i;
			    pc = j;
			}
		}
		if (max <= tol) {
		    rank = k;
		    break;
		}
		swapRows(a, k, pr);
		swapRows(b, k, pr);
		swap(as, k, pr);
		swap(bs, k, pr);
		swapCols(a, n, k, pc);
		swapCols(b, n, k, pc);
		for (i = k+1; i < n; i++) {
		    double f = b[i][k]/b[k][k];
		    if (f == 0)
			continue;
		    for (j = k; j < n; j++)
			b[i][j] -= f*b[k][j];
		    for (j = 0; j < n; j++)
			a[i][j] -= f*a[k][j];
		    as[i] = Math.max(as[i], Math.abs(f)*as[k]);
		    bs[i] = Math.max(bs[i], Math.abs(f)*bs[k]);
		    b[i][k] = 0;
		}
	    }
	    if (rank == n)
		return removed;
	    for (i = rank; i < n; i++)
		for (j = 0; j < n; j++)
		    b[i][j] = 0;

	    // eliminate using each zero row, starting from the bottom so the
	    // deletions don't move the rows still to be processed
	    for (int r = n-1; r >= rank; r--) {
		int pc = -1;
		double max = 0;
		for (j = 0; j < n; j++)
		    if (Math.abs(a[r][j]) > max) {
			max = Math.abs(a[r][j]);
			pc = j;
		    }
		if (max <= tol*as[r])
		    return -1;
		for (k = 0; k < n; k++) {
		    if (k == pc)
			continue;
		    double f = a[r][k]/a[r][pc];
		    if (f == 0)
			continue;
		    for (i = 0; i < n; i++) {
			as[i] = Math.max(as[i], Math.abs(f*a[i][pc]));
			bs[i] = Math.max(bs[i], Math.abs(f*b[i][pc]));
			a[i][k] -= f*a[i][pc];
			b[i][k] -= f*b[i][pc];
		    }
		}
		removeRowCol(a, n, r, pc);
		removeRowCol(b, n, r, pc);
		for (i = r; i < n-1; i++) {
		    as[i] = as[i+1];
		    bs[i] = bs[i+1];
		}
		n--;
		removed++;
	    }
	    p.n = n;
	}
	return removed;
    }

    // Scale rows and columns of the pencil by powers of 2 (which doesn't
    // change its eigenvalues) so the entries are as close to 1 as possible,
    // then record the size of each row.  g and c are compared after scaling
    // c by the ratio of their largest entries, since s has units.  Returns
    // false if some row or column is entirely zero, which makes the pencil
    // singular.
    static boolean equilibrate(Pencil p) {
	int i, j, pass;
	int n = p.n;
	double[][] g = p.g, c = p.c;
	double gmax = 0, cmax = 0;
	for (i = 0; i < n; i++)
	    for (j = 0; j < n; j++) {
		gmax = Math.max(gmax, Math.abs(g[i][j]));
		cmax = Math.max(cmax, Math.abs(c[i][j]));
	    }
	double w = (gmax > 0 && cmax > 0) ? gmax/cmax : 1;
	for (pass = 0; pass < 3; pass++) {
	    for (i = 0; i < n; i++) {
		double m = 0;
		for (j = 0; j < n; j++)
		    m = Math.max(m, Math.max(Math.abs(g[i][j]), w*Math.abs(c[i][j])));
		if (m == 0)
		    return false;
		double s = powerOf2(1/m);
		for (j = 0; j < n; j++) {
		    g[i][j] *= s;
		    c[i][j] *= s;
		}
	    }
	    for (j = 0; j < n; j++) {
		double m = 0;
		for (i = 0; i < n; i++)
		    m = Math.max(m, Math.max(Math.abs(g[i][j]), w*Math.abs(c[i][j])));
		if (m == 0)
		    return false;
		double s = powerOf2(1/m);
		for (i = 0; i < n; i++) {
		    g[i][j] *= s;
		    c[i][j] *= s;
		}
	    }
	}
	p.gScale = new double[n];
	p.cScale = new double[n];
	for (i = 0; i < n; i++)
	    for (j = 0; j < n; j++) {
		p.gScale[i] = Math.max(p.gScale[i], Math.abs(g[i][j]));
		p.cScale[i] = Math.max(p.cScale[i], Math.abs(c[i][j]));
	    }
	return true;
    }

    static void swap(double[] a, int i, int j) {
	double t = a[i];
	a[i] = a[j];
	a[j] = t;
    }

    static double powerOf2(double x) {
	return Math.pow(2, Math.round(Math.log(x)/Math.log(2)));
    }

    static void swapRows(double[][] a, int i, int j) {
	if (i == j)
	    return;
	double[] t = a[i];
	a[i] = a[j];
	a[j] = t;
    }

    static void swapCols(double[][] a, int n, int i, int j) {
	if (i == j)
	    return;
	for (int k = 0; k < n; k++) {
	    double t = a[k][i];
	    a[k][i] = a[k][j];
	    a[k][j] = t;
	}
    }

    static void removeRowCol(double[][] a, int n, int r, int c) {
	int i, j;
	double[] row = a[r];
	for (i = r; i < n-1; i++)
	    a[i] = a[i+1];
	a[n-1] = row;
	for (i = 0; i < n; i++)
	    for (j = c; j < n-1; j++)
		a[i][j] = a[i][j+1];
    }

    static Complex[] appendOrigin(Complex[] r, int count) {
	Complex[] nr = new Complex[r.length + count];
	for (int i = 0; i < r.length; i++)
	    nr[i] = r[i];
	for (int i = 0; i < count; i++)
	    nr[r.length + i] = new Complex(0, 0);
	return nr;
    }

    // Eigenvalues of a pencil with nonsingular c: those of -c^-1 g.
    static Complex[] finiteEigs(Pencil p) {
	int n = p.n;
	int i, j, k;
	if (n == 0)
	    return new Complex[0];

	// LU factor c with partial pivoting
	double[][] lu = new double[n][n];
	for (i = 0; i < n; i++)
	    for (j = 0; j < n; j++)
		lu[i][j] = p.c[i][j];
	int[] perm = new int[n];
	for (k = 0; k < n; k++) {
	    int pr = k;
	    for (i = k+1; i < n; i++)
		if (Math.abs(lu[i][k]) > Math.abs(lu[pr][k]))
		    pr = i;
	    perm[k] = pr;
	    swapRows(lu, k, pr);
	    for (i = k+1; i < n; i++) {
		double f = lu[i][k] /= lu[k][k];
		for (j = k+1; j < n; j++)
		    lu[i][j] -= f*lu[k][j];
	    }
	}

	// m = -c^-1 g, a column at a time
	double[][] m = new double[n][n];
	double[] x = new double[n];
	for (j = 0; j < n; j++) {
	    for (i = 0; i < n; i++)
		x[i] = -p.g[i][j];
	    for (k = 0; k < n; k++) {
		double t = x[k];
		x[k] = x[perm[k]];
		x[perm[k]] = t;
	    }
	    for (i = 0; i < n; i++)
		for (k = 0; k < i; k++)
		    x[i] -= lu[i][k]*x[k];
	    for (i = n-1; i >= 0; i--) {
		for (k = i+1; k < n; k++)
		    x[i] -= lu[i][k]*x[k];
		x[i] /= lu[i][i];
	    }
	    for (i = 0; i < n; i++)
		m[i][j] = x[i];
	}
	return eigenvalues(m, n);
    }

    // Eigenvalues of a real general matrix: balance, reduce to Hessenberg
    // form, then shifted QR (after balanc/elmhes/hqr in Numerical Recipes).
    // Complex eigenvalues come back in exact conjugate pairs.  Returns null
    // if the QR iteration doesn't converge.
    static Complex[] eigenvalues(double[][] m, int n) {
	int i, j;
	// 1-indexed copy, to keep the QR iteration close to the original
	double[][] a = new double[n+1][n+1];
	for (i = 0; i < n; i++)
	    for (j = 0; j < n; j++)
		a[i+1][j+1] = m[i][j];
	balance(a, n);
	hessenberg(a, n);
	double[] wr = new double[n+1];
	double[] wi = new double[n+1];
	if (!hqr(a, n, wr, wi))
	    return null;
	Complex[] ev = new Complex[n];
	for (i = 0; i < n; i++)
	    ev[i] = new Complex(wr[i+1], wi[i+1]);
	return ev;
    }

    static void balance(double[][] a, int n) {
	final double radix = 2;
	final double sqrdx = radix*radix;
	boolean done = false;
	while (!done) {
	    done = true;
	    for (int i = 1; i <= n; i++) {
		double r = 0, c = 0;
		for (int j = 1; j <= n; j++)
		    if (j != i) {
			c += Math.abs(a[j][i]);
			r += Math.abs(a[i][j]);
		    }
		if (c == 0 || r == 0)
		    continue;
		double g = r/radix;
		double f = 1;
		double s = c+r;
		while (c < g) {
		    f *= radix;
		    c *= sqrdx;
		}
		g = r*radix;
		while (c > g) {
		    f /= radix;
		    c /= sqrdx;
		}
		if ((c+r)/f < .95*s) {
		    done = false;
		    g = 1/f;
		    for (int j = 1; j <= n; j++)
			a[i][j] *= g;
		    for (int j = 1; j <= n; j++)
			a[j][i] *= f;
		}
	    }
	}
    }

    // reduce to upper Hessenberg form by elimination with pivoting
    static void hessenberg(double[][] a, int n) {
	int i, j, m;
	for (m = 2; m < n; m++) {
	    double x = 0;
	    i = m;
	    for (j = m; j <= n; j++)
		if (Math.abs(a[j][m-1]) > Math.abs(x)) {
		    x = a[j][m-1];
		    i = j;
		}
	    if (i != m) {
		for (j = m-1; j <= n; j++) {
		    double t = a[i][j];
		    a[i][j] = a[m][j];
		    a[m][j] = t;
		}
		for (j = 1; j <= n; j++) {
		    double t = a[j][i];
		    a[j][i] = a[j][m];
		    a[j][m] = t;
		}
	    }
	    if (x != 0) {
		for (i = m+1; i <= n; i++) {
		    double y = a[i][m-1];
		    if (y != 0) {
			y /= x;
			a[i][m-1] = y;
			for (j = m; j <= n; j++)
			    a[i][j] -= y*a[m][j];
			for (j = 1; j <= n; j++)
			    a[j][m] += y*a[j][i];
		    }
		}
	    }
	}
	// clear the multipliers left below the subdiagonal
	for (i = 3; i <= n; i++)
	    for (j = 1; j < i-1; j++)
		a[i][j] = 0;
    }

    static double sign(double a, double b) {
	return (b >= 0) ? Math.abs(a) : -Math.abs(a);
    }

    // eigenvalues of an upper Hessenberg matrix by shifted QR
    static boolean hqr(double[][] a, int n, double[] wr, double[] wi) {
	int nn, m, l, k, j, its, i, mmin;
	double z = 0, y, x, w, v, u, t, s, r = 0, q = 0, p = 0, anorm = 0;
	for (i = 1; i <= n; i++)
	    for (j = Math.max(i-1, 1); j <= n; j++)
		anorm += Math.abs(a[i][j]);
	nn = n;
	t = 0;
	while (nn >= 1) {
	    its = 0;
	    do {
		for (l = nn; l >= 2; l--) {
		    s = Math.abs(a[l-1][l-1]) + Math.abs(a[l][l]);
		    if (s == 0)
			s = anorm;
		    if (Math.abs(a[l][l-1]) + s == s) {
			a[l][l-1] = 0;
			break;
		    }
		}
		x = a[nn][nn];
		if (l == nn) {
		    wr[nn] = x+t;
		    wi[nn--] = 0;
		} else {
		    y = a[nn-1][nn-1];
		    w = a[nn][nn-1]*a[nn-1][nn];
		    if (l == nn-1) {
			p = .5*(y-x);
			q = p*p+w;
			z = Math.sqrt(Math.abs(q));
			x += t;
			if (q >= 0) {
			    z = p+sign(z, p);
			    wr[nn-1] = wr[nn] = x+z;
			    if (z != 0)
				wr[nn] = x-w/z;
			    wi[nn-1] = wi[nn] = 0;
			} else {
			    wr[nn-1] = wr[nn] = x+p;
			    wi[nn-1] = -(wi[nn] = z);
			}
			nn -= 2;
		    } else {
			if (its == 60)
			    return false;
			if (its == 10 || its == 20 || its == 40) {
			    // exceptional shift
			    t += x;
			    for (i = 1; i <= nn; i++)
				a[i][i] -= x;
			    s = Math.abs(a[nn][nn-1]) + Math.abs(a[nn-1][nn-2]);
			    y = x = .75*s;
			    w = -.4375*s*s;
			}
			++its;
			for (m = nn-2; m >= l; m--) {
			    z = a[m][m];
			    r = x-z;
			    s = y-z;
			    p = (r*s-w)/a[m+1][m] + a[m][m+1];
			    q = a[m+1][m+1]-z-r-s;
			    r = a[m+2][m+1];
			    s = Math.abs(p)+Math.abs(q)+Math.abs(r);
			    p /= s;
			    q /= s;
			    r /= s;
			    if (m == l)
				break;
			    u = Math.abs(a[m][m-1])*(Math.abs(q)+Math.abs(r));
			    v = Math.abs(p)*(Math.abs(a[m-1][m-1])+Math.abs(z)+
					     Math.abs(a[m+1][m+1]));
			    if (u+v == v)
				break;
			}
			for (i = m+2; i <= nn; i++) {
			    a[i][i-2] = 0;
			    if (i != m+2)
				a[i][i-3] = 0;
			}
			for (k = m; k <= nn-1; k++) {
			    if (k != m) {
				p = a[k][k-1];
				q = a[k+1][k-1];
				r = 0;
				if (k != nn-1)
				    r = a[k+2][k-1];
				if ((x = Math.abs(p)+Math.abs(q)+Math.abs(r)) != 0) {
				    p /= x;
				    q /= x;
				    r /= x;
				}
			    }
			    if ((s = sign(Math.sqrt(p*p+q*q+r*r), p)) != 0) {
				if (k == m) {
				    if (l != m)
					a[k][k-1] = -a[k][k-1];
				} else
				    a[k][k-1] = -s*x;
				p += s;
				x = p/s;
				y = q/s;
				z = r/s;
				q /= p;
				r /= p;
				for (j = k; j <= nn; j++) {
				    p = a[k][j]+q*a[k+1][j];
				    if (k != nn-1) {
					p += r*a[k+2][j];
					a[k+2][j] -= p*z;
				    }
				    a[k+1][j] -= p*y;
				    a[k][j] -= p*x;
				}
				mmin = (nn < k+3) ? nn : k+3;
				for (i = l; i <= mmin; i++) {
				    p = x*a[i][k]+y*a[i][k+1];
				    if (k != nn-1) {
					p += z*a[i][k+2];
					a[i][k+2] -= p*r;
				    }
				    a[i][k+1] -= p*q;
				    a[i][k] -= p;
				}
			    }
			}
		    }
		}
	    } while (l < nn-1);
	}
	return true;
    }

    // The gain constant: solve the circuit at one point s0 away from all
    // poles and zeros, and compare with the product of root factors there.
    static double findGain(Polynomial[][] mat, Polynomial[] rhs, int n,
	    int out, Complex[] poles, Complex[] zeros) {
	// put s0 at the typical root magnitude, at the angle that keeps it
	// farthest from any root
	double logSum = 0;
	int count = 0;
	for (int i = 0; i < poles.length + zeros.length; i++) {
	    Complex c = (i < poles.length) ? poles[i] : zeros[i-poles.length];
	    if (c.mag() > 0) {
		logSum += Math.log(c.mag());
		count++;
	    }
	}
	double rad = (count > 0) ? Math.exp(logSum/count) : 1;
	Complex s0 = null;
	double best = -1;
	for (int ai = 1; ai < 12; ai++) {
	    Complex s = new Complex(0, 0);
	    s.setMagPhase(rad, Math.PI*ai/12);
	    double d = Double.MAX_VALUE;
	    for (int i = 0; i < poles.length + zeros.length; i++) {
		Complex c = (i < poles.length) ? poles[i] : zeros[i-poles.length];
		d = Math.min(d, Math.hypot(s.re-c.re, s.im-c.im));
	    }
	    if (d > best) {
		best = d;
		s0 = s;
	    }
	}

	Complex h = solveAt(mat, rhs, n, out, s0);
	if (h == null)
	    return 0;
	// h * prod(s0-p) / prod(s0-z), interleaved to avoid overflow
	for (int i = 0; i < Math.max(poles.length, zeros.length); i++) {
	    if (i < poles.length)
		h.mult(new Complex(s0.re-poles[i].re, s0.im-poles[i].im));
	    if (i < zeros.length)
		h.divide(new Complex(s0.re-zeros[i].re, s0.im-zeros[i].im));
	}
	return h.re;
    }

    // solve mat(s0) x = rhs(s0) and return x[out]
    static Complex solveAt(Polynomial[][] mat, Polynomial[] rhs, int n,
	    int out, Complex s0) {
	int i, j, k;
	Complex[][] a = new Complex[n][n];
	Complex[] b = new Complex[n];
	for (i = 0; i < n; i++) {
	    for (j = 0; j < n; j++)
		a[i][j] = mat[i][j].evaluate(s0);
	    b[i] = rhs[i].evaluate(s0);
	}
	for (k = 0; k < n; k++) {
	    int pr = k;
	    for (i = k+1; i < n; i++)
		if (a[i][k].magSquared() > a[pr][k].magSquared())
		    pr = i;
	    if (a[pr][k].magSquared() == 0)
		return null;
	    Complex[] t = a[k];
	    a[k] = a[pr];
	    a[pr] = t;
	    Complex tb = b[k];
	    b[k] = b[pr];
	    b[pr] = tb;
	    for (i = k+1; i < n; i++) {
		Complex f = new Complex(a[i][k]);
		f.divide(a[k][k]);
		for (j = k; j < n; j++) {
		    Complex x = new Complex(a[k][j]);
		    x.mult(f);
		    a[i][j].subtract(x);
		}
		Complex x = new Complex(b[k]);
		x.mult(f);
		b[i].subtract(x);
	    }
	}
	for (i = n-1; i >= 0; i--) {
	    for (k = i+1; k < n; k++) {
		Complex x = new Complex(a[i][k]);
		x.mult(b[k]);
		b[i].subtract(x);
	    }
	    b[i].divide(a[i][i]);
	}
	return b[out];
    }
}
