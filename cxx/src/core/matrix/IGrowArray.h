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

#include <algorithm>
#include <stdexcept>
#include <vector>

// data.size() plays the part of the TS Int32Array's length (the capacity), and length is
// the number of elements in use
class IGrowArray {
public:
    std::vector<int> data;
    int length;

    explicit IGrowArray(int length = 0) : data(length, 0), length(length) {}

    void reshape(int length) {
        if ((int)data.size() < length) {
            data.assign(length, 0);
        }
        this->length = length;
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
    void growInternal(int amount) {
        data.resize(data.size() + amount, 0);
    }

    void setTo(const IGrowArray &original) {
        reshape(original.length);
        std::copy(original.data.begin(), original.data.begin() + original.length, data.begin());
    }

    int get(int index) const {
        if (index < 0 || index >= length)
            throw std::out_of_range("Out of bounds");
        return data[index];
    }

    void set(int index, int value) {
        if (index < 0 || index >= length)
            throw std::out_of_range("Out of bounds");
        data[index] = value;
    }

    void add(int value) {
        if (length == (int)data.size()) {
            growInternal(std::min(10000, 1 + (int)data.size()));
        }
        data[length++] = value;
    }

    void clear() {
        length = 0;
    }

    void free() {
        data.clear();
        data.shrink_to_fit();
        length = 0;
    }
};
