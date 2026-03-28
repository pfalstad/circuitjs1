package com.falstad.afilter.client;

import java.util.HashMap;

class PolynomialMatrix {

    // Determinant via Laplace cofactor expansion along first column,
    // with memoization. Avoids the floating-point division issues
    // of Bareiss. Feasible for matrices up to ~15x15.
    static Polynomial determinant(Polynomial[][] mat, int n) {
	if (n == 0)
	    return new Polynomial(1.0);
	if (n == 1)
	    return mat[0][0];
	if (n == 2)
	    return mat[0][0].multiply(mat[1][1]).subtract(
		   mat[0][1].multiply(mat[1][0]));

	// Use bitmask-based memoization for submatrices.
	// rows and cols are bitmasks of which rows/cols are included.
	HashMap<String, Polynomial> memo = new HashMap<String, Polynomial>();
	int allRows = (1 << n) - 1;
	int allCols = (1 << n) - 1;
	return det(mat, allRows, allCols, n, memo);
    }

    // Recursive determinant with memoization.
    // rowMask/colMask: bitmasks of included rows/columns.
    // size: number of bits set (= submatrix size).
    private static Polynomial det(Polynomial[][] mat,
	    int rowMask, int colMask, int size,
	    HashMap<String, Polynomial> memo) {
	if (size == 1) {
	    int r = Integer.numberOfTrailingZeros(rowMask);
	    int c = Integer.numberOfTrailingZeros(colMask);
	    return mat[r][c];
	}
	if (size == 2) {
	    int r0 = Integer.numberOfTrailingZeros(rowMask);
	    int r1 = Integer.numberOfTrailingZeros(rowMask & ~(1 << r0));
	    int c0 = Integer.numberOfTrailingZeros(colMask);
	    int c1 = Integer.numberOfTrailingZeros(colMask & ~(1 << c0));
	    return mat[r0][c0].multiply(mat[r1][c1]).subtract(
		   mat[r0][c1].multiply(mat[r1][c0]));
	}

	String key = rowMask + "," + colMask;
	Polynomial cached = memo.get(key);
	if (cached != null)
	    return cached;

	// Expand along the first included column
	int col = Integer.numberOfTrailingZeros(colMask);
	int newColMask = colMask & ~(1 << col);

	Polynomial result = new Polynomial(0.0);
	int sign = 1;
	int rm = rowMask;
	while (rm != 0) {
	    int row = Integer.numberOfTrailingZeros(rm);
	    rm &= ~(1 << row);

	    if (!mat[row][col].isZero()) {
		int newRowMask = rowMask & ~(1 << row);
		Polynomial minor = det(mat, newRowMask, newColMask,
			size - 1, memo);
		Polynomial term = mat[row][col].multiply(minor);
		if (sign == 1)
		    result = result.add(term);
		else
		    result = result.subtract(term);
	    }
	    sign = -sign;
	}

	memo.put(key, result);
	return result;
    }

    // Compute numerator for Cramer's rule: replace column 'col' with
    // the right-hand side vector and compute the determinant.
    static Polynomial cramerNumerator(Polynomial[][] mat, Polynomial[] rhs,
	    int n, int col) {
	Polynomial[][] m = new Polynomial[n][n];
	for (int i = 0; i < n; i++)
	    for (int j = 0; j < n; j++)
		m[i][j] = (j == col) ? rhs[i] : mat[i][j];
	return determinant(m, n);
    }
}
