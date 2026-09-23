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

function binarySearch(arr: Int32Array, from: number, to: number, key: number): number {
    let low = from;
    let high = to - 1;
    while (low <= high) {
        const mid = (low + high) >>> 1;
        const midVal = arr[mid];
        if (midVal < key) low = mid + 1;
        else if (midVal > key) high = mid - 1;
        else return mid;
    }
    return -(low + 1);
}

/**
 * Value of an element in a sparse matrix
 */
export class CoordinateRealValue {
    /** The coordinate */
    row: number = 0;
    col: number = 0;
    /** The value of the coordinate */
    value: number = 0;
}

export class DMatrixSparseCSC {
    /**
     * Storage for non-zero values. Only valid up to length-1.
     */
    nz_values: Float64Array = new Float64Array(0);
    /**
     * Length of data. Number of non-zero values in the matrix
     */
    nz_length: number;
    /**
     * Specifies which row a specific non-zero value corresponds to. If they are sorted or not with in each column
     * is specified by the {@link indicesSorted} flag.
     */
    nz_rows: Int32Array = new Int32Array(0);
    /**
     * Stores the range of indexes in the non-zero lists that belong to each column. Column 'i' corresponds to
     * indexes col_idx[i] to col_idx[i+1]-1, inclusive.
     */
    col_idx: Int32Array;

    /**
     * Number of rows in the matrix
     */
    numRows: number;
    /**
     * Number of columns in the matrix
     */
    numCols: number;

    /**
     * Flag that's used to indicate of the row indices are sorted or not.
     */
    indicesSorted: boolean = false;

    static EPS: number = Math.pow(2.0, -52.0);

    /**
     * Constructor with a default arrayLength of zero.
     *
     * @param numRows Number of rows
     * @param numCols Number of columns
     */
    constructor(numRows: number, numCols: number, arrayLength: number = 0) {
        if (numRows < 0 || numCols < 0 || arrayLength < 0)
            throw new Error("Rows, columns, and arrayLength must be not be negative");
        this.numRows = numRows;
        this.numCols = numCols;
        this.nz_length = 0;
        this.col_idx = new Int32Array(numCols + 1);
        this.growMaxLength(arrayLength, false);
    }

    static fromMatrix(original: DMatrixSparseCSC): DMatrixSparseCSC {
        const m = new DMatrixSparseCSC(original.numRows, original.numCols, original.nz_length);
        m.setTo(original);
        return m;
    }

    getNumRows(): number {
        return this.numRows;
    }

    getNumCols(): number {
        return this.numCols;
    }

    copy(): DMatrixSparseCSC {
        return DMatrixSparseCSC.fromMatrix(this);
    }

    createLike(): DMatrixSparseCSC {
        return new DMatrixSparseCSC(this.numRows, this.numCols);
    }

    setTo(original: DMatrixSparseCSC): void {
        const o = original;
        this.reshape(o.numRows, o.numCols, o.nz_length);
        this.nz_length = o.nz_length;

        this.nz_values.set(o.nz_values.subarray(0, this.nz_length));
        this.nz_rows.set(o.nz_rows.subarray(0, this.nz_length));
        this.col_idx.set(o.col_idx.subarray(0, this.numCols + 1));
        this.indicesSorted = o.indicesSorted;
    }

    isAssigned(row: number, col: number): boolean {
        return this.nz_index(row, col) >= 0;
    }

    get(row: number, col: number, fallBackValue?: number): number {
        if (row < 0 || row >= this.numRows || col < 0 || col >= this.numCols)
            throw new Error("Outside of matrix bounds");

        if (fallBackValue !== undefined)
            return this.unsafe_get_fallback(row, col, fallBackValue);
        return this.unsafe_get(row, col);
    }

    unsafe_get(row: number, col: number): number {
        const index = this.nz_index(row, col);
        if (index >= 0)
            return this.nz_values[index];
        return 0;
    }

    unsafe_get_fallback(row: number, col: number, fallBackValue: number): number {
        const index = this.nz_index(row, col);
        if (index >= 0)
            return this.nz_values[index];
        return fallBackValue;
    }

    /**
     * Returns the index in nz_rows for the element at (row,col) if it already exists in the matrix. If not then -1
     * is returned.
     *
     * @param row row coordinate
     * @param col column coordinate
     * @return nz_row index or -1 if the element does not exist
     */
    nz_index(row: number, col: number): number {
        const col0 = this.col_idx[col];
        const col1 = this.col_idx[col + 1];

        if (this.indicesSorted) {
            return binarySearch(this.nz_rows, col0, col1, row);
        } else {
            for (let i = col0; i < col1; i++) {
                if (this.nz_rows[i] === row) {
                    return i;
                }
            }
            return -1;
        }
    }

    set(row: number, col: number, val: number): void {
        if (row < 0 || row >= this.numRows || col < 0 || col >= this.numCols)
            throw new Error("Outside of matrix bounds");

        this.unsafe_set(row, col, val);
    }

    unsafe_set(row: number, col: number, val: number): void {
        let index = this.nz_index(row, col);
        if (index >= 0) {
            this.nz_values[index] = val;
        } else {
            const idx0 = this.col_idx[col];
            const idx1 = this.col_idx[col + 1];

            // determine the index the new element should be inserted at. This is done to keep it sorted if
            // it was already sorted
            for (index = idx0; index < idx1; index++) {
                if (row < this.nz_rows[index]) {
                    break;
                }
            }

            // shift all the col_idx after this point by 1
            for (let i = col + 1; i <= this.numCols; i++) {
                this.col_idx[i]++;
            }

            // if it's already at the maximum array length grow the arrays
            if (this.nz_length >= this.nz_values.length)
                this.growMaxLength(this.nz_length * 2 + 1, true);

            // shift everything by one
            for (let i = this.nz_length; i > index; i--) {
                this.nz_rows[i] = this.nz_rows[i - 1];
                this.nz_values[i] = this.nz_values[i - 1];
            }
            this.nz_rows[index] = row;
            this.nz_values[index] = val;
            this.nz_length++;
        }
    }

    remove(row: number, col: number): void {
        const index = this.nz_index(row, col);

        if (index < 0) // it's not in the nz structure
            return;

        // shift all the col_idx after this point by -1
        for (let i = col + 1; i <= this.numCols; i++) {
            this.col_idx[i]--;
        }

        this.nz_length--;
        for (let i = index; i < this.nz_length; i++) {
            this.nz_rows[i] = this.nz_rows[i + 1];
            this.nz_values[i] = this.nz_values[i + 1];
        }
    }

    zero(): void {
        this.col_idx.fill(0, 0, this.numCols + 1);
        this.nz_length = 0;
        this.indicesSorted = false; // see justification in reshape
    }

    create(numRows: number, numCols: number): DMatrixSparseCSC {
        return new DMatrixSparseCSC(numRows, numCols);
    }

    getNonZeroLength(): number {
        return this.nz_length;
    }

    reshape(numRows: number, numCols: number, arrayLength: number = 0): void {
        if (numRows < 0 || numCols < 0 || arrayLength < 0)
            throw new Error("Rows, columns, and arrayLength must be not be negative");

        // OK so technically it is sorted, but forgetting to correctly set this flag is a common mistake so
        // decided to be conservative and mark it as unsorted so that stuff doesn't blow up
        this.indicesSorted = false;
        this.numRows = numRows;
        this.numCols = numCols;
        this.growMaxLength(arrayLength, false);
        this.nz_length = 0;

        if (numCols + 1 > this.col_idx.length) {
            this.col_idx = new Int32Array(numCols + 1);
        } else {
            this.col_idx.fill(0, 0, numCols + 1);
        }
    }

    shrinkArrays(): void {
        if (this.nz_length < this.nz_values.length) {
            const tmp_values = new Float64Array(this.nz_length);
            const tmp_rows = new Int32Array(this.nz_length);

            tmp_values.set(this.nz_values.subarray(0, this.nz_length));
            tmp_rows.set(this.nz_rows.subarray(0, this.nz_length));

            this.nz_values = tmp_values;
            this.nz_rows = tmp_rows;
        }
    }

    /**
     * Increases the maximum size of the data array so that it can store sparse data up to 'length'. The class
     * parameter nz_length is not modified by this function call.
     *
     * @param arrayLength   Desired maximum length of sparse data
     * @param preserveValue If true the old values will be copied into the new arrays. If false that step will be skipped.
     */
    growMaxLength(arrayLength: number, preserveValue: boolean): void {
        if (arrayLength < 0)
            throw new Error("Negative array length. Overflow?");

        if (arrayLength > this.nz_values.length) {
            const data = new Float64Array(arrayLength);
            const row_idx = new Int32Array(arrayLength);

            if (preserveValue) {
                data.set(this.nz_values.subarray(0, this.nz_length));
                row_idx.set(this.nz_rows.subarray(0, this.nz_length));
            }

            this.nz_values = data;
            this.nz_rows = row_idx;
        }
    }

    /**
     * Increases the maximum number of columns in the matrix.
     *
     * @param desiredColumns Desired number of columns.
     * @param preserveValue  If the array needs to be expanded should it copy the previous values?
     */
    growMaxColumns(desiredColumns: number, preserveValue: boolean): void {
        if (this.col_idx.length < desiredColumns + 1) {
            const c = new Int32Array(desiredColumns + 1);
            if (preserveValue)
                c.set(this.col_idx);
            this.col_idx = c;
        }
    }

    /**
     * Given the histogram of columns compute the col_idx for the matrix. nz_length is automatically set and
     * nz_values will grow if needed.
     *
     * @param histogram histogram of column values in the sparse matrix. modified, see above.
     */
    histogramToStructure(histogram: Int32Array): void {
        this.col_idx[0] = 0;
        let index = 0;
        for (let i = 1; i <= this.numCols; i++) {
            this.col_idx[i] = index += histogram[i - 1];
        }
        this.nz_length = index;
        this.growMaxLength(this.nz_length, false);
        if (this.col_idx[this.numCols] !== this.nz_length)
            throw new Error("Egads");
    }

    /**
     * Copies the non-zero structure of orig into "this"
     *
     * @param orig Matrix who's structure is to be copied
     */
    copyStructure(orig: DMatrixSparseCSC): void {
        this.reshape(orig.numRows, orig.numCols, orig.nz_length);
        this.nz_length = orig.nz_length;
        this.col_idx.set(orig.col_idx.subarray(0, orig.numCols + 1));
        this.nz_rows.set(orig.nz_rows.subarray(0, orig.nz_length));
    }

    /**
     * If the indices has been sorted or not
     *
     * @return true if sorted or false if not sorted
     */
    isIndicesSorted(): boolean {
        return this.indicesSorted;
    }

    /**
     * Returns true if number of non-zero elements is the maximum size
     *
     * @return true if no more non-zero elements can be added
     */
    isFull(): boolean {
        return this.nz_length === this.numRows * this.numCols;
    }

    static convert(circuitMatrix: number[][], tol: number): DMatrixSparseCSC {
        let nonzero = 0;
        for (let i = 0; i !== circuitMatrix.length; i++)
            for (let j = 0; j !== circuitMatrix.length; j++) {
                if (circuitMatrix[i][j] !== 0) {
                    nonzero++;
                }
            }
        const dst = new DMatrixSparseCSC(circuitMatrix.length, circuitMatrix.length, nonzero);
        dst.nz_length = 0;
        dst.col_idx[0] = 0;
        let i, j;
        for (i = 0; i !== circuitMatrix.length; i++) {
            for (j = 0; j !== circuitMatrix.length; j++) {
                const value = circuitMatrix[j][i];
                if (!(Math.abs(value) <= tol)) {
                    dst.nz_rows[dst.nz_length] = j;
                    dst.nz_values[dst.nz_length] = value;
                    ++dst.nz_length;
                }
            }
            dst.col_idx[i + 1] = dst.nz_length;
        }

        return dst;
    }

    createCoordinateIterator(): { hasNext(): boolean; next(): CoordinateRealValue } {
        const matrix = this;
        const coordinate = new CoordinateRealValue();
        let nz_index = 0; // the index of the non-zero value and row
        let column = 0; // which column it's in

        const incrementColumn = () => {
            while (column + 1 <= matrix.numCols && nz_index >= matrix.col_idx[column + 1]) {
                column++;
            }
        };

        incrementColumn();

        return {
            hasNext(): boolean {
                return nz_index < matrix.nz_length;
            },
            next(): CoordinateRealValue {
                coordinate.row = matrix.nz_rows[nz_index];
                coordinate.col = column;
                coordinate.value = matrix.nz_values[nz_index];
                nz_index++;
                incrementColumn();
                return coordinate;
            }
        };
    }
}
