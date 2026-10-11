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

#include <optional>
#include <vector>

/**
 * Value of an element in a sparse matrix
 */
class CoordinateRealValue {
public:
    /** The coordinate */
    int row = 0;
    int col = 0;
    /** The value of the coordinate */
    double value = 0;
};

// nz_values.size() and nz_rows.size() are the TS typed arrays' lengths (the capacity), as
// col_idx.size() is
class DMatrixSparseCSC {
public:
    /**
     * Storage for non-zero values. Only valid up to length-1.
     */
    std::vector<double> nz_values;
    /**
     * Length of data. Number of non-zero values in the matrix
     */
    int nz_length;
    /**
     * Specifies which row a specific non-zero value corresponds to. If they are sorted or not with in each column
     * is specified by the {@link indicesSorted} flag.
     */
    std::vector<int> nz_rows;
    /**
     * Stores the range of indexes in the non-zero lists that belong to each column. Column 'i' corresponds to
     * indexes col_idx[i] to col_idx[i+1]-1, inclusive.
     */
    std::vector<int> col_idx;

    /**
     * Number of rows in the matrix
     */
    int numRows;
    /**
     * Number of columns in the matrix
     */
    int numCols;

    /**
     * Flag that's used to indicate of the row indices are sorted or not.
     */
    bool indicesSorted = false;

    static const double EPS;

    /**
     * Constructor with a default arrayLength of zero.
     *
     * @param numRows Number of rows
     * @param numCols Number of columns
     */
    DMatrixSparseCSC(int numRows, int numCols, int arrayLength = 0);

    static DMatrixSparseCSC fromMatrix(const DMatrixSparseCSC &original);

    int getNumRows() const { return numRows; }
    int getNumCols() const { return numCols; }

    DMatrixSparseCSC copy() const { return fromMatrix(*this); }
    DMatrixSparseCSC createLike() const { return DMatrixSparseCSC(numRows, numCols); }

    void setTo(const DMatrixSparseCSC &original);

    bool isAssigned(int row, int col) const { return nz_index(row, col) >= 0; }

    double get(int row, int col, std::optional<double> fallBackValue = std::nullopt) const;
    double unsafe_get(int row, int col) const;
    double unsafe_get_fallback(int row, int col, double fallBackValue) const;

    /**
     * Returns the index in nz_rows for the element at (row,col) if it already exists in the matrix. If not then -1
     * is returned.
     *
     * @param row row coordinate
     * @param col column coordinate
     * @return nz_row index or -1 if the element does not exist
     */
    int nz_index(int row, int col) const;

    void set(int row, int col, double val);
    void unsafe_set(int row, int col, double val);
    void remove(int row, int col);
    void zero();

    DMatrixSparseCSC create(int numRows, int numCols) const { return DMatrixSparseCSC(numRows, numCols); }

    int getNonZeroLength() const { return nz_length; }

    void reshape(int numRows, int numCols, int arrayLength = 0);
    void shrinkArrays();

    /**
     * Increases the maximum size of the data array so that it can store sparse data up to 'length'. The class
     * parameter nz_length is not modified by this function call.
     *
     * @param arrayLength   Desired maximum length of sparse data
     * @param preserveValue If true the old values will be copied into the new arrays. If false that step will be skipped.
     */
    void growMaxLength(int arrayLength, bool preserveValue);

    /**
     * Increases the maximum number of columns in the matrix.
     *
     * @param desiredColumns Desired number of columns.
     * @param preserveValue  If the array needs to be expanded should it copy the previous values?
     */
    void growMaxColumns(int desiredColumns, bool preserveValue);

    /**
     * Given the histogram of columns compute the col_idx for the matrix. nz_length is automatically set and
     * nz_values will grow if needed.
     *
     * @param histogram histogram of column values in the sparse matrix. modified, see above.
     */
    void histogramToStructure(const std::vector<int> &histogram);

    /**
     * Copies the non-zero structure of orig into "this"
     *
     * @param orig Matrix who's structure is to be copied
     */
    void copyStructure(const DMatrixSparseCSC &orig);

    /**
     * If the indices has been sorted or not
     *
     * @return true if sorted or false if not sorted
     */
    bool isIndicesSorted() const { return indicesSorted; }

    /**
     * Returns true if number of non-zero elements is the maximum size
     *
     * @return true if no more non-zero elements can be added
     */
    bool isFull() const { return nz_length == numRows * numCols; }

    static DMatrixSparseCSC convert(const std::vector<std::vector<double>> &circuitMatrix, double tol);

    class CoordinateIterator {
    public:
        explicit CoordinateIterator(const DMatrixSparseCSC &matrix);
        bool hasNext() const;
        const CoordinateRealValue &next();

    private:
        void incrementColumn();
        const DMatrixSparseCSC &matrix;
        CoordinateRealValue coordinate;
        int nz_index = 0;  // the index of the non-zero value and row
        int column = 0;    // which column it's in
    };

    CoordinateIterator createCoordinateIterator() const { return CoordinateIterator(*this); }
};
