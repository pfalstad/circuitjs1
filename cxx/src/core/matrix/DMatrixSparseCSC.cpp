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

#include "DMatrixSparseCSC.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>

static int binarySearch(const std::vector<int> &arr, int from, int to, int key) {
    int low = from;
    int high = to - 1;
    while (low <= high) {
        int mid = (int)(((unsigned)low + (unsigned)high) >> 1);
        int midVal = arr[mid];
        if (midVal < key) low = mid + 1;
        else if (midVal > key) high = mid - 1;
        else return mid;
    }
    return -(low + 1);
}

const double DMatrixSparseCSC::EPS = 2.220446049250313e-16;  // Math.pow(2.0, -52.0)

DMatrixSparseCSC::DMatrixSparseCSC(int numRows, int numCols, int arrayLength) {
    if (numRows < 0 || numCols < 0 || arrayLength < 0)
        throw std::invalid_argument("Rows, columns, and arrayLength must be not be negative");
    this->numRows = numRows;
    this->numCols = numCols;
    nz_length = 0;
    col_idx.assign(numCols + 1, 0);
    growMaxLength(arrayLength, false);
}

DMatrixSparseCSC DMatrixSparseCSC::fromMatrix(const DMatrixSparseCSC &original) {
    DMatrixSparseCSC m(original.numRows, original.numCols, original.nz_length);
    m.setTo(original);
    return m;
}

void DMatrixSparseCSC::setTo(const DMatrixSparseCSC &original) {
    const DMatrixSparseCSC &o = original;
    reshape(o.numRows, o.numCols, o.nz_length);
    nz_length = o.nz_length;

    std::copy(o.nz_values.begin(), o.nz_values.begin() + nz_length, nz_values.begin());
    std::copy(o.nz_rows.begin(), o.nz_rows.begin() + nz_length, nz_rows.begin());
    std::copy(o.col_idx.begin(), o.col_idx.begin() + numCols + 1, col_idx.begin());
    indicesSorted = o.indicesSorted;
}

double DMatrixSparseCSC::get(int row, int col, std::optional<double> fallBackValue) const {
    if (row < 0 || row >= numRows || col < 0 || col >= numCols)
        throw std::out_of_range("Outside of matrix bounds");

    if (fallBackValue)
        return unsafe_get_fallback(row, col, *fallBackValue);
    return unsafe_get(row, col);
}

double DMatrixSparseCSC::unsafe_get(int row, int col) const {
    int index = nz_index(row, col);
    if (index >= 0)
        return nz_values[index];
    return 0;
}

double DMatrixSparseCSC::unsafe_get_fallback(int row, int col, double fallBackValue) const {
    int index = nz_index(row, col);
    if (index >= 0)
        return nz_values[index];
    return fallBackValue;
}

int DMatrixSparseCSC::nz_index(int row, int col) const {
    int col0 = col_idx[col];
    int col1 = col_idx[col + 1];

    if (indicesSorted) {
        return binarySearch(nz_rows, col0, col1, row);
    } else {
        for (int i = col0; i < col1; i++) {
            if (nz_rows[i] == row) {
                return i;
            }
        }
        return -1;
    }
}

void DMatrixSparseCSC::set(int row, int col, double val) {
    if (row < 0 || row >= numRows || col < 0 || col >= numCols)
        throw std::out_of_range("Outside of matrix bounds");

    unsafe_set(row, col, val);
}

void DMatrixSparseCSC::unsafe_set(int row, int col, double val) {
    int index = nz_index(row, col);
    if (index >= 0) {
        nz_values[index] = val;
    } else {
        int idx0 = col_idx[col];
        int idx1 = col_idx[col + 1];

        // determine the index the new element should be inserted at. This is done to keep it sorted if
        // it was already sorted
        for (index = idx0; index < idx1; index++) {
            if (row < nz_rows[index]) {
                break;
            }
        }

        // shift all the col_idx after this point by 1
        for (int i = col + 1; i <= numCols; i++) {
            col_idx[i]++;
        }

        // if it's already at the maximum array length grow the arrays
        if (nz_length >= (int)nz_values.size())
            growMaxLength(nz_length * 2 + 1, true);

        // shift everything by one
        for (int i = nz_length; i > index; i--) {
            nz_rows[i] = nz_rows[i - 1];
            nz_values[i] = nz_values[i - 1];
        }
        nz_rows[index] = row;
        nz_values[index] = val;
        nz_length++;
    }
}

void DMatrixSparseCSC::remove(int row, int col) {
    int index = nz_index(row, col);

    if (index < 0)  // it's not in the nz structure
        return;

    // shift all the col_idx after this point by -1
    for (int i = col + 1; i <= numCols; i++) {
        col_idx[i]--;
    }

    nz_length--;
    for (int i = index; i < nz_length; i++) {
        nz_rows[i] = nz_rows[i + 1];
        nz_values[i] = nz_values[i + 1];
    }
}

void DMatrixSparseCSC::zero() {
    std::fill(col_idx.begin(), col_idx.begin() + numCols + 1, 0);
    nz_length = 0;
    indicesSorted = false;  // see justification in reshape
}

void DMatrixSparseCSC::reshape(int numRows, int numCols, int arrayLength) {
    if (numRows < 0 || numCols < 0 || arrayLength < 0)
        throw std::invalid_argument("Rows, columns, and arrayLength must be not be negative");

    // OK so technically it is sorted, but forgetting to correctly set this flag is a common mistake so
    // decided to be conservative and mark it as unsorted so that stuff doesn't blow up
    indicesSorted = false;
    this->numRows = numRows;
    this->numCols = numCols;
    growMaxLength(arrayLength, false);
    nz_length = 0;

    if (numCols + 1 > (int)col_idx.size()) {
        col_idx.assign(numCols + 1, 0);
    } else {
        std::fill(col_idx.begin(), col_idx.begin() + numCols + 1, 0);
    }
}

void DMatrixSparseCSC::shrinkArrays() {
    if (nz_length < (int)nz_values.size()) {
        nz_values.resize(nz_length);
        nz_values.shrink_to_fit();
        nz_rows.resize(nz_length);
        nz_rows.shrink_to_fit();
    }
}

void DMatrixSparseCSC::growMaxLength(int arrayLength, bool preserveValue) {
    if (arrayLength < 0)
        throw std::invalid_argument("Negative array length. Overflow?");

    if (arrayLength > (int)nz_values.size()) {
        std::vector<double> data(arrayLength, 0.0);
        std::vector<int> row_idx(arrayLength, 0);

        if (preserveValue) {
            std::copy(nz_values.begin(), nz_values.begin() + nz_length, data.begin());
            std::copy(nz_rows.begin(), nz_rows.begin() + nz_length, row_idx.begin());
        }

        nz_values = std::move(data);
        nz_rows = std::move(row_idx);
    }
}

void DMatrixSparseCSC::growMaxColumns(int desiredColumns, bool preserveValue) {
    if ((int)col_idx.size() < desiredColumns + 1) {
        std::vector<int> c(desiredColumns + 1, 0);
        if (preserveValue)
            std::copy(col_idx.begin(), col_idx.end(), c.begin());
        col_idx = std::move(c);
    }
}

void DMatrixSparseCSC::histogramToStructure(const std::vector<int> &histogram) {
    col_idx[0] = 0;
    int index = 0;
    for (int i = 1; i <= numCols; i++) {
        col_idx[i] = index += histogram[i - 1];
    }
    nz_length = index;
    growMaxLength(nz_length, false);
    if (col_idx[numCols] != nz_length)
        throw std::logic_error("Egads");
}

void DMatrixSparseCSC::copyStructure(const DMatrixSparseCSC &orig) {
    reshape(orig.numRows, orig.numCols, orig.nz_length);
    nz_length = orig.nz_length;
    std::copy(orig.col_idx.begin(), orig.col_idx.begin() + orig.numCols + 1, col_idx.begin());
    std::copy(orig.nz_rows.begin(), orig.nz_rows.begin() + orig.nz_length, nz_rows.begin());
}

DMatrixSparseCSC DMatrixSparseCSC::convert(const std::vector<std::vector<double>> &circuitMatrix, double tol) {
    int n = (int)circuitMatrix.size();
    int nonzero = 0;
    for (int i = 0; i != n; i++)
        for (int j = 0; j != n; j++) {
            if (circuitMatrix[i][j] != 0) {
                nonzero++;
            }
        }
    DMatrixSparseCSC dst(n, n, nonzero);
    dst.nz_length = 0;
    dst.col_idx[0] = 0;
    int i, j;
    for (i = 0; i != n; i++) {
        for (j = 0; j != n; j++) {
            double value = circuitMatrix[j][i];
            // written this way so NaN is kept, as in the TS version
            if (!(std::abs(value) <= tol)) {
                dst.nz_rows[dst.nz_length] = j;
                dst.nz_values[dst.nz_length] = value;
                ++dst.nz_length;
            }
        }
        dst.col_idx[i + 1] = dst.nz_length;
    }

    return dst;
}

DMatrixSparseCSC::CoordinateIterator::CoordinateIterator(const DMatrixSparseCSC &m) : matrix(m) {
    incrementColumn();
}

void DMatrixSparseCSC::CoordinateIterator::incrementColumn() {
    while (column + 1 <= matrix.numCols && nz_index >= matrix.col_idx[column + 1]) {
        column++;
    }
}

bool DMatrixSparseCSC::CoordinateIterator::hasNext() const {
    return nz_index < matrix.nz_length;
}

const CoordinateRealValue &DMatrixSparseCSC::CoordinateIterator::next() {
    coordinate.row = matrix.nz_rows[nz_index];
    coordinate.col = column;
    coordinate.value = matrix.nz_values[nz_index];
    nz_index++;
    incrementColumn();
    return coordinate;
}
