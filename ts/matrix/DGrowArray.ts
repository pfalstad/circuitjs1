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

export class DGrowArray {
    data: Float64Array;
    length: number;

    constructor(length: number = 0) {
        this.data = new Float64Array(length);
        this.length = length;
    }

    reset(): void { this.reshape(0); }

    /**
     * Changes the array's length and doesn't attempt to preserve previous values if a new array is required
     *
     * @param length New array length
     */
    reshape(length: number): DGrowArray {
        if (this.data.length < length) {
            this.data = new Float64Array(length);
        }
        this.length = length;
        return this;
    }

    /**
     * Increases the internal array's length by the specified amount. Previous values are preserved.
     * The length value is not modified since this does not change the 'meaning' of the array, just
     * increases the amount of data which can be stored in it.
     *
     * this.data = new data_type[ data.length + amount ]
     *
     * @param amount Number of elements added to the internal array's length
     */
    growInternal(amount: number): void {
        const tmp = new Float64Array(this.data.length + amount);
        tmp.set(this.data);
        this.data = tmp;
    }

    setTo(original: DGrowArray): void {
        this.reshape(original.length);
        this.data.set(original.data.subarray(0, original.length));
    }

    add(value: number): void {
        if (this.length >= this.data.length) {
            this.growInternal(Math.min(500000, this.data.length + 10));
        }
        this.data[this.length++] = value;
    }

    get(index: number): number {
        if (index < 0 || index >= this.length)
            throw new Error("Out of bounds");
        return this.data[index];
    }

    set(index: number, value: number): void {
        if (index < 0 || index >= this.length)
            throw new Error("Out of bounds");
        this.data[index] = value;
    }

    free(): void {
        this.data = new Float64Array(0);
        this.length = 0;
    }
}
