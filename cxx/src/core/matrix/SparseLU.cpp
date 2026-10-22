/*
 * Derived from EJML (Efficient Java Matrix Library)
 * Copyright (c) 2009-2020, Peter Abeles. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Adapted for CircuitJS1 by H-Dynamite (sharpie7/circuitjs1 PR #920).
 */

#include "SparseLU.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>

void SparseLU::initialize(const DMatrixSparseCSC &A) {
    int m = A.numRows;
    int n = A.numCols;
    int o = std::min(m, n);
    L.reshape(m, m, 4 * A.nz_length + o);
    L.nz_length = 0;
    U.reshape(m, n, 4 * A.nz_length + o);
    U.nz_length = 0;
    singular = false;
    if ((int)pinv.size() != m) {
        pinv.assign(m, 0);
        x.assign(m, 0.0);
    }

    for (int i = 0; i < m; ++i) {
        pinv[i] = -1;
        L.col_idx[i] = 0;
    }
}

bool SparseLU::performLU(const DMatrixSparseCSC &A) {
    int m = A.numRows;
    int n = A.numCols;
    const std::vector<int> *q = nullptr;
    std::vector<int> &w = adjustIZero(gw, m * 2, m);

    int k;
    for (k = 0; k < n; ++k) {
        L.col_idx[k] = L.nz_length;
        U.col_idx[k] = U.nz_length;
        if (L.nz_length + n > (int)L.nz_values.size()) {
            L.growMaxLength(2 * (int)L.nz_values.size() + n, true);
        }

        if (U.nz_length + n > (int)U.nz_values.size()) {
            U.growMaxLength(2 * (int)U.nz_values.size() + n, true);
        }

        int col = q != nullptr ? (*q)[k] : k;
        int top = solveColB(L, true, A, col, x, &pinv, gxi, w);
        const std::vector<int> &xi = gxi.data;
        int ipiv = -1;
        double a = -1.7976931348623157E+308;

        for (int p = top; p < n; ++p) {
            int i = xi[p];
            if (pinv[i] < 0) {
                double t;
                if ((t = std::abs(x[i])) > a) {
                    a = t;
                    ipiv = i;
                }
            } else {
                U.nz_rows[U.nz_length] = pinv[i];
                U.nz_values[U.nz_length++] = x[i];
            }
        }

        if (ipiv == -1 || a <= 0.0) {
            singular = true;
            return false;
        }

        double pivot = x[ipiv];
        U.nz_rows[U.nz_length] = k;
        U.nz_values[U.nz_length++] = pivot;
        pinv[ipiv] = k;
        L.nz_rows[L.nz_length] = ipiv;
        L.nz_values[L.nz_length++] = 1.0;

        for (int p = top; p < n; ++p) {
            int i = xi[p];
            if (pinv[i] < 0) {
                L.nz_rows[L.nz_length] = i;
                L.nz_values[L.nz_length++] = x[i] / pivot;
            }

            x[i] = 0.0;
        }
    }

    L.col_idx[n] = L.nz_length;
    U.col_idx[n] = U.nz_length;

    for (k = 0; k < L.nz_length; ++k) {
        L.nz_rows[k] = pinv[L.nz_rows[k]];
    }

    return true;
}

bool SparseLU::setA(const DMatrixSparseCSC &A) {
    AnumRows = A.numRows;
    AnumCols = A.numCols;
    return decompose(A);
}

bool SparseLU::decompose(const DMatrixSparseCSC &A) {
    initialize(A);
    return performLU(A);
}

void SparseLU::solve(const std::vector<double> &B, std::vector<double> &X) {
    if ((int)B.size() != AnumRows) {
        throw std::invalid_argument("Unexpected number of rows in B based on shape of A. Found=" +
                                    std::to_string(B.size()) + " Expected=" + std::to_string(AnumRows));
    }

    std::vector<double> &x = adjustD(gx, (int)X.size());
    std::vector<double> &b = adjustD(gb, (int)B.size());

    for (size_t i = 0; i < B.size(); i++) {
        b[i] = B[i];
    }

    permuteInv(pinv, b, x, (int)X.size());
    solveL(L, x);
    solveU(U, x);

    for (size_t i = 0; i < X.size(); i++) {
        X[i] = x[i];
    }
}

int SparseLU::solveColB(const DMatrixSparseCSC &G, bool lower, const DMatrixSparseCSC &B, int colB,
                        std::vector<double> &x, const std::vector<int> *pinv, IGrowArray &g_xi,
                        std::vector<int> &w) {
    int X_rows = G.numCols;
    std::vector<int> &xi = adjustI(g_xi, X_rows);
    int top = searchNzRowsInX(G, B, colB, pinv, xi, w);

    int idxB0;
    for (idxB0 = top; idxB0 < X_rows; ++idxB0) {
        x[xi[idxB0]] = 0.0;
    }

    idxB0 = B.col_idx[colB];
    int idxB1 = B.col_idx[colB + 1];

    int px;
    for (px = idxB0; px < idxB1; ++px) {
        x[B.nz_rows[px]] = B.nz_values[px];
    }

    for (px = top; px < X_rows; ++px) {
        int j = xi[px];
        int J = pinv != nullptr ? (*pinv)[j] : j;
        if (J >= 0) {
            int p;
            int q;
            if (lower) {
                x[j] /= G.nz_values[G.col_idx[J]];
                p = G.col_idx[J] + 1;
                q = G.col_idx[J + 1];
            } else {
                x[j] /= G.nz_values[G.col_idx[J + 1] - 1];
                p = G.col_idx[J];
                q = G.col_idx[J + 1] - 1;
            }

            while (p < q) {
                int var10001 = G.nz_rows[p];
                x[var10001] -= G.nz_values[p] * x[j];
                ++p;
            }
        }
    }

    return top;
}

int SparseLU::searchNzRowsInX(const DMatrixSparseCSC &G, const DMatrixSparseCSC &B, int colB,
                              const std::vector<int> *pinv, std::vector<int> &xi, std::vector<int> &w) {
    int X_rows = G.numCols;
    if ((int)xi.size() < X_rows) {
        throw std::invalid_argument("xi must be at least G.numCols=" + std::to_string(G.numCols));
    } else if ((int)w.size() < 2 * X_rows) {
        throw std::invalid_argument(
            "w must be at least 2*G.numCols in length (2*number of rows in X) and first N elements must be zero");
    } else {
        int idx0 = B.col_idx[colB];
        int idx1 = B.col_idx[colB + 1];
        int top = X_rows;

        int i;
        for (i = idx0; i < idx1; ++i) {
            int rowB = B.nz_rows[i];
            if (rowB < X_rows && w[rowB] == 0) {
                top = searchNzRowsInX_DFS(rowB, G, top, pinv, xi, w);
            }
        }

        for (i = top; i < X_rows; ++i) {
            w[xi[i]] = 0;
        }

        return top;
    }
}

int SparseLU::searchNzRowsInX_DFS(int rowB, const DMatrixSparseCSC &G, int top, const std::vector<int> *pinv,
                                  std::vector<int> &xi, std::vector<int> &w) {
    int N = G.numCols;
    int head = 0;
    xi[head] = rowB;

    while (head >= 0) {
        int G_col = xi[head];
        int G_col_new = pinv != nullptr ? (*pinv)[G_col] : G_col;
        if (w[G_col] == 0) {
            w[G_col] = 1;
            w[N + head] = G_col_new >= 0 && G_col_new < N ? G.col_idx[G_col_new] : 0;
        }

        bool done = true;
        int idx0 = w[N + head];
        int idx1 = G_col_new >= 0 && G_col_new < N ? G.col_idx[G_col_new + 1] : 0;

        for (int j = idx0; j < idx1; ++j) {
            int jrow = G.nz_rows[j];
            if (jrow < N && w[jrow] == 0) {
                w[N + head] = j + 1;
                ++head;
                xi[head] = jrow;
                done = false;
                break;
            }
        }

        if (done) {
            --head;
            --top;
            xi[top] = G_col;
        }
    }

    return top;
}

void SparseLU::solveL(const DMatrixSparseCSC &L, std::vector<double> &x) {
    int N = L.numCols;
    int idx0 = L.col_idx[0];

    for (int col = 0; col < N; ++col) {
        int idx1 = L.col_idx[col + 1];
        double x_j = x[col] /= L.nz_values[idx0];

        for (int i = idx0 + 1; i < idx1; ++i) {
            int row = L.nz_rows[i];
            x[row] -= L.nz_values[i] * x_j;
        }

        idx0 = idx1;
    }
}

void SparseLU::solveU(const DMatrixSparseCSC &U, std::vector<double> &x) {
    int N = U.numCols;
    int idx1 = U.col_idx[N];

    for (int col = N - 1; col >= 0; --col) {
        int idx0 = U.col_idx[col];
        double x_j = x[col] /= U.nz_values[idx1 - 1];

        for (int i = idx0; i < idx1 - 1; ++i) {
            int row = U.nz_rows[i];
            x[row] -= U.nz_values[i] * x_j;
        }

        idx1 = idx0;
    }
}

std::vector<int> &SparseLU::adjustIZero(IGrowArray &gwork, int desired, int zeroToM) {
    std::vector<int> &w = adjustI(gwork, desired);
    std::fill(w.begin(), w.begin() + zeroToM, 0);
    return w;
}

std::vector<int> &SparseLU::adjustI(IGrowArray &gwork, int desired) {
    gwork.reshape(desired);
    return gwork.data;
}

std::vector<double> &SparseLU::adjustD(DGrowArray &gwork, int desired) {
    gwork.reshape(desired);
    return gwork.data;
}

void SparseLU::permuteInv(const std::vector<int> &perm, const std::vector<double> &input,
                          std::vector<double> &output, int N) {
    for (int k = 0; k < N; ++k) {
        output[perm[k]] = input[k];
    }
}
