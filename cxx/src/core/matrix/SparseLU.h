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

#pragma once

#include <vector>

#include "DGrowArray.h"
#include "DMatrixSparseCSC.h"
#include "IGrowArray.h"

class SparseLU {
public:
    SparseLU() {}

    int AnumRows = 0;
    int AnumCols = 0;

    bool setA(const DMatrixSparseCSC &A);
    bool decompose(const DMatrixSparseCSC &A);

    // B and X may be the same vector
    void solve(const std::vector<double> &B, std::vector<double> &X);

    // pinv may be null, as in the TS version
    static int solveColB(const DMatrixSparseCSC &G, bool lower, const DMatrixSparseCSC &B, int colB,
                         std::vector<double> &x, const std::vector<int> *pinv, IGrowArray &g_xi,
                         std::vector<int> &w);
    static int searchNzRowsInX(const DMatrixSparseCSC &G, const DMatrixSparseCSC &B, int colB,
                               const std::vector<int> *pinv, std::vector<int> &xi, std::vector<int> &w);
    static void solveL(const DMatrixSparseCSC &L, std::vector<double> &x);
    static void solveU(const DMatrixSparseCSC &U, std::vector<double> &x);
    static std::vector<int> &adjustIZero(IGrowArray &gwork, int desired, int zeroToM);
    static std::vector<int> &adjustI(IGrowArray &gwork, int desired);
    static std::vector<double> &adjustD(DGrowArray &gwork, int desired);
    static void permuteInv(const std::vector<int> &perm, const std::vector<double> &input,
                           std::vector<double> &output, int N);

private:
    IGrowArray gw;
    DMatrixSparseCSC L{0, 0, 0};
    DMatrixSparseCSC U{0, 0, 0};
    std::vector<double> x;

    void initialize(const DMatrixSparseCSC &A);

    IGrowArray gxi;
    std::vector<int> pinv;

    bool singular = false;

    bool performLU(const DMatrixSparseCSC &A);

    DGrowArray gx;
    DGrowArray gb;

    static int searchNzRowsInX_DFS(int rowB, const DMatrixSparseCSC &G, int top, const std::vector<int> *pinv,
                                   std::vector<int> &xi, std::vector<int> &w);
};
