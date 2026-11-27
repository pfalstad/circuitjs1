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

import { DGrowArray } from "./DGrowArray";
import { DMatrixSparseCSC } from "./DMatrixSparseCSC";
import { IGrowArray } from "./IGrowArray";

export class SparseLU {

    constructor() {}

    private readonly gw: IGrowArray = new IGrowArray();
    private readonly L: DMatrixSparseCSC = new DMatrixSparseCSC(0, 0, 0);
    private readonly U: DMatrixSparseCSC = new DMatrixSparseCSC(0, 0, 0);
    private x: Float64Array = new Float64Array(0);

    private initialize(A: DMatrixSparseCSC): void {
        const m = A.numRows;
        const n = A.numCols;
        const o = Math.min(m, n);
        this.L.reshape(m, m, 4 * A.nz_length + o);
        this.L.nz_length = 0;
        this.U.reshape(m, n, 4 * A.nz_length + o);
        this.U.nz_length = 0;
        this.singular = false;
        if (this.pinv.length !== m) {
            this.pinv = new Int32Array(m);
            this.x = new Float64Array(m);
        }

        for (let i = 0; i < m; ++i) {
            this.pinv[i] = -1;
            this.L.col_idx[i] = 0;
        }
    }

    private readonly gxi: IGrowArray = new IGrowArray();
    private pinv: Int32Array = new Int32Array(0);

    private singular: boolean = false;

    private performLU(A: DMatrixSparseCSC): boolean {
        const m = A.numRows;
        const n = A.numCols;
        const q: Int32Array | null = null;
        const w = SparseLU.adjustIZero(this.gw, m * 2, m);

        let k;
        for (k = 0; k < n; ++k) {
            this.L.col_idx[k] = this.L.nz_length;
            this.U.col_idx[k] = this.U.nz_length;
            if (this.L.nz_length + n > this.L.nz_values.length) {
                this.L.growMaxLength(2 * this.L.nz_values.length + n, true);
            }

            if (this.U.nz_length + n > this.U.nz_values.length) {
                this.U.growMaxLength(2 * this.U.nz_values.length + n, true);
            }

            const col = q !== null ? q[k] : k;
            const top = SparseLU.solveColB(this.L, true, A, col, this.x, this.pinv, this.gxi, w);
            const xi = this.gxi.data;
            let ipiv = -1;
            let a = -1.7976931348623157E+308;

            for (let p = top; p < n; ++p) {
                const i = xi[p];
                if (this.pinv[i] < 0) {
                    let t;
                    if ((t = Math.abs(this.x[i])) > a) {
                        a = t;
                        ipiv = i;
                    }
                } else {
                    this.U.nz_rows[this.U.nz_length] = this.pinv[i];
                    this.U.nz_values[this.U.nz_length++] = this.x[i];
                }
            }

            if (ipiv === -1 || a <= 0.0) {
                this.singular = true;
                return false;
            }

            const pivot = this.x[ipiv];
            this.U.nz_rows[this.U.nz_length] = k;
            this.U.nz_values[this.U.nz_length++] = pivot;
            this.pinv[ipiv] = k;
            this.L.nz_rows[this.L.nz_length] = ipiv;
            this.L.nz_values[this.L.nz_length++] = 1.0;

            for (let p = top; p < n; ++p) {
                const i = xi[p];
                if (this.pinv[i] < 0) {
                    this.L.nz_rows[this.L.nz_length] = i;
                    this.L.nz_values[this.L.nz_length++] = this.x[i] / pivot;
                }

                this.x[i] = 0.0;
            }
        }

        this.L.col_idx[n] = this.L.nz_length;
        this.U.col_idx[n] = this.U.nz_length;

        for (k = 0; k < this.L.nz_length; ++k) {
            this.L.nz_rows[k] = this.pinv[this.L.nz_rows[k]];
        }

        return true;
    }

    AnumRows: number = 0;
    AnumCols: number = 0;

    setA(A: DMatrixSparseCSC): boolean {
        this.AnumRows = A.numRows;
        this.AnumCols = A.numCols;
        return this.decompose(A);
    }

    decompose(A: DMatrixSparseCSC): boolean {
        this.initialize(A);
        return this.performLU(A);
    }

    private readonly gx: DGrowArray = new DGrowArray();
    private readonly gb: DGrowArray = new DGrowArray();

    solve(B: number[], X: number[]): void {
        if (B.length !== this.AnumRows) {
            throw new Error("Unexpected number of rows in B based on shape of A. Found=" + B.length + " Expected=" + this.AnumRows);
        }

        const x = SparseLU.adjustD(this.gx, X.length);
        const b = SparseLU.adjustD(this.gb, B.length);
        const L = this.L;
        const U = this.U;

        for (let i = 0; i < B.length; i++) {
            b[i] = B[i];
        }

        SparseLU.permuteInv(this.pinv, b, x, X.length);
        SparseLU.solveL(L, x);
        SparseLU.solveU(U, x);

        for (let i = 0; i < X.length; i++) {
            X[i] = x[i];
        }
    }

    static solveColB(G: DMatrixSparseCSC, lower: boolean, B: DMatrixSparseCSC, colB: number, x: Float64Array, pinv: Int32Array, g_xi: IGrowArray, w: Int32Array): number {
        const X_rows = G.numCols;
        const xi = SparseLU.adjustI(g_xi, X_rows);
        const top = SparseLU.searchNzRowsInX(G, B, colB, pinv, xi, w);

        let idxB0;
        for (idxB0 = top; idxB0 < X_rows; ++idxB0) {
            x[xi[idxB0]] = 0.0;
        }

        idxB0 = B.col_idx[colB];
        const idxB1 = B.col_idx[colB + 1];

        let px;
        for (px = idxB0; px < idxB1; ++px) {
            x[B.nz_rows[px]] = B.nz_values[px];
        }

        for (px = top; px < X_rows; ++px) {
            const j = xi[px];
            const J = pinv !== null ? pinv[j] : j;
            if (J >= 0) {
                let p;
                let q;
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
                    const var10001 = G.nz_rows[p];
                    x[var10001] -= G.nz_values[p] * x[j];
                    ++p;
                }
            }
        }

        return top;
    }

    static searchNzRowsInX(G: DMatrixSparseCSC, B: DMatrixSparseCSC, colB: number, pinv: Int32Array, xi: Int32Array, w: Int32Array): number {
        const X_rows = G.numCols;
        if (xi.length < X_rows) {
            throw new Error("xi must be at least G.numCols=" + G.numCols);
        } else if (w.length < 2 * X_rows) {
            throw new Error("w must be at least 2*G.numCols in length (2*number of rows in X) and first N elements must be zero");
        } else {
            const idx0 = B.col_idx[colB];
            const idx1 = B.col_idx[colB + 1];
            let top = X_rows;

            let i;
            for (i = idx0; i < idx1; ++i) {
                const rowB = B.nz_rows[i];
                if (rowB < X_rows && w[rowB] === 0) {
                    top = SparseLU.searchNzRowsInX_DFS(rowB, G, top, pinv, xi, w);
                }
            }

            for (i = top; i < X_rows; ++i) {
                w[xi[i]] = 0;
            }

            return top;
        }
    }

    private static searchNzRowsInX_DFS(rowB: number, G: DMatrixSparseCSC, top: number, pinv: Int32Array, xi: Int32Array, w: Int32Array): number {
        const N = G.numCols;
        let head = 0;
        xi[head] = rowB;

        while (head >= 0) {
            const G_col = xi[head];
            const G_col_new = pinv !== null ? pinv[G_col] : G_col;
            if (w[G_col] === 0) {
                w[G_col] = 1;
                w[N + head] = G_col_new >= 0 && G_col_new < N ? G.col_idx[G_col_new] : 0;
            }

            let done = true;
            const idx0 = w[N + head];
            const idx1 = G_col_new >= 0 && G_col_new < N ? G.col_idx[G_col_new + 1] : 0;

            for (let j = idx0; j < idx1; ++j) {
                const jrow = G.nz_rows[j];
                if (jrow < N && w[jrow] === 0) {
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

    static solveL(L: DMatrixSparseCSC, x: Float64Array): void {
        const N = L.numCols;
        let idx0 = L.col_idx[0];

        for (let col = 0; col < N; ++col) {
            const idx1 = L.col_idx[col + 1];
            const x_j = x[col] /= L.nz_values[idx0];

            for (let i = idx0 + 1; i < idx1; ++i) {
                const row = L.nz_rows[i];
                x[row] -= L.nz_values[i] * x_j;
            }

            idx0 = idx1;
        }
    }

    static solveU(U: DMatrixSparseCSC, x: Float64Array): void {
        const N = U.numCols;
        let idx1 = U.col_idx[N];

        for (let col = N - 1; col >= 0; --col) {
            const idx0 = U.col_idx[col];
            const x_j = x[col] /= U.nz_values[idx1 - 1];

            for (let i = idx0; i < idx1 - 1; ++i) {
                const row = U.nz_rows[i];
                x[row] -= U.nz_values[i] * x_j;
            }

            idx1 = idx0;
        }
    }

    static adjustIZero(gwork: IGrowArray, desired: number, zeroToM: number): Int32Array {
        const w = SparseLU.adjustI(gwork, desired);
        w.fill(0, 0, zeroToM);
        return w;
    }

    static adjustI(gwork: IGrowArray | null, desired: number): Int32Array {
        if (gwork === null) {
            gwork = new IGrowArray();
        }

        gwork.reshape(desired);
        return gwork.data;
    }

    static adjustD(gwork: DGrowArray | null, desired: number): Float64Array {
        if (gwork === null) {
            gwork = new DGrowArray();
        }

        gwork.reshape(desired);
        return gwork.data;
    }

    static permuteInv(perm: Int32Array, input: Float64Array, output: Float64Array, N: number): void {
        for (let k = 0; k < N; ++k) {
            output[perm[k]] = input[k];
        }
    }
}
