/*
    Copyright (C) Paul Falstad and Iain Sharp

    This file is part of CircuitJS1.

    CircuitJS1 is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    CircuitJS1 is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with CircuitJS1.  If not, see <http://www.gnu.org/licenses/>.
*/

#include "LZString.h"

#include <unordered_map>
#include <unordered_set>

namespace {

const char *keyStrUriSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

// LZString._compress() with bitsPerChar = 6
std::string compress(const std::u16string &uncompressed, int bitsPerChar) {
    std::unordered_map<std::u16string, int> dictionary;
    std::unordered_set<std::u16string> dictionaryToCreate;
    std::u16string w;
    int enlargeIn = 2;
    int dictSize = 3;
    int numBits = 2;
    std::string data;
    int dataVal = 0;
    int dataPosition = 0;

    // shift one bit into the output
    auto writeBit = [&](int bit) {
        dataVal = (dataVal << 1) | bit;
        if (dataPosition == bitsPerChar - 1) {
            dataPosition = 0;
            data += keyStrUriSafe[dataVal];
            dataVal = 0;
        } else {
            dataPosition++;
        }
    };
    // write the low n bits of value, least significant first
    auto writeBits = [&](int value, int n) {
        for (int i = 0; i < n; i++) {
            writeBit(value & 1);
            value >>= 1;
        }
    };
    auto decEnlarge = [&] {
        if (--enlargeIn == 0) {
            enlargeIn = 1 << numBits;
            numBits++;
        }
    };
    // output the code for w
    auto outputW = [&] {
        if (dictionaryToCreate.count(w)) {
            int c = w[0];
            if (c < 256) {
                writeBits(0, numBits);
                writeBits(c, 8);
            } else {
                writeBits(1, numBits);
                writeBits(c, 16);
            }
            decEnlarge();
            dictionaryToCreate.erase(w);
        } else {
            writeBits(dictionary[w], numBits);
        }
        decEnlarge();
    };

    for (char16_t ch : uncompressed) {
        std::u16string c(1, ch);
        if (!dictionary.count(c)) {
            dictionary[c] = dictSize++;
            dictionaryToCreate.insert(c);
        }
        std::u16string wc = w + c;
        if (dictionary.count(wc)) {
            w = wc;
        } else {
            outputW();
            dictionary[wc] = dictSize++;
            w = c;
        }
    }

    if (!w.empty())
        outputW();

    // mark the end of the stream
    writeBits(2, numBits);

    // flush the last char
    while (true) {
        dataVal <<= 1;
        if (dataPosition == bitsPerChar - 1) {
            data += keyStrUriSafe[dataVal];
            break;
        }
        dataPosition++;
    }
    return data;
}

}  // namespace

std::string LZString::compressToEncodedURIComponent(const std::u16string &input) {
    return compress(input, 6);
}
