package com.falstad.afilter.client;

import java.util.HashMap;

class PolynomialMatrix {

    // Determinant via Laplace cofactor expansion with memoization.
    // Uses int[] index arrays instead of bitmasks to support any matrix size.
    static Polynomial determinant(Polynomial[][] mat, int n) {
	if (n == 0)
	    return new Polynomial(1.0);
	if (n == 1)
	    return mat[0][0];
	if (n == 2)
	    return mat[0][0].multiply(mat[1][1]).subtract(
		   mat[0][1].multiply(mat[1][0]));

	int[] rows = new int[n];
	int[] cols = new int[n];
	for (int i = 0; i < n; i++) {
	    rows[i] = i;
	    cols[i] = i;
	}
	HashMap<String, Polynomial> memo = new HashMap<String, Polynomial>();
	return det(mat, rows, cols, n, memo);
    }

    // Build a memoization key from the row and column index arrays.
    private static String makeKey(int[] rows, int[] cols, int size) {
	StringBuilder sb = new StringBuilder();
	for (int i = 0; i < size; i++) {
	    if (i > 0) sb.append(',');
	    sb.append(rows[i]);
	}
	sb.append('|');
	for (int i = 0; i < size; i++) {
	    if (i > 0) sb.append(',');
	    sb.append(cols[i]);
	}
	return sb.toString();
    }

    // Recursive determinant with memoization.
    // rows[0..size-1] and cols[0..size-1] are the included row/column indices.
    private static Polynomial det(Polynomial[][] mat,
	    int[] rows, int[] cols, int size,
	    HashMap<String, Polynomial> memo) {
	if (size == 1)
	    return mat[rows[0]][cols[0]];
	if (size == 2)
	    return mat[rows[0]][cols[0]].multiply(mat[rows[1]][cols[1]])
		.subtract(
		   mat[rows[0]][cols[1]].multiply(mat[rows[1]][cols[0]]));

	String key = makeKey(rows, cols, size);
	Polynomial cached = memo.get(key);
	if (cached != null)
	    return cached;

	// Expand along the first included column (cols[0])
	int col = cols[0];
	// Build reduced column array (remove first column)
	int[] newCols = new int[size - 1];
	for (int j = 0; j < size - 1; j++)
	    newCols[j] = cols[j + 1];

	Polynomial result = new Polynomial(0.0);
	int[] newRows = new int[size - 1];
	for (int i = 0; i < size; i++) {
	    if (mat[rows[i]][col].isZero()) continue;

	    // Build reduced row array (remove row i)
	    int idx = 0;
	    for (int k = 0; k < size; k++)
		if (k != i)
		    newRows[idx++] = rows[k];

	    Polynomial minor = det(mat, newRows, newCols, size - 1, memo);
	    Polynomial term = mat[rows[i]][col].multiply(minor);
	    if (i % 2 == 0)
		result = result.add(term);
	    else
		result = result.subtract(term);
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
