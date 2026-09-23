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

import { ScopePlot } from "./ScopePlot";

export class ScopeDataIterator implements Iterable<number> {
    plot: ScopePlot;
    ipa: number;
    validCount: number;
    currentIp: number = 0;
    startIndex: number = 0;
    scopePointCount: number;

    // Accept pre-computed values to avoid circular imports with Scope
    constructor(scopePointCount: number, ipa: number, validCount: number, plot: ScopePlot) {
        this.plot = plot;
        this.scopePointCount = scopePointCount;
        this.ipa = ipa;
        this.validCount = validCount;
    }

    skipNonzeroValues(): number {
        for (; this.startIndex < this.validCount; this.startIndex++) {
            const ip = (this.startIndex + this.ipa) & (this.scopePointCount - 1);
            if (this.plot.maxValues[ip] !== 0)
                return this.plot.maxValues[ip];
        }
        return 0;
    }

    getMin(): number { return this.plot.minValues[this.currentIp]; }
    getMax(): number { return this.plot.maxValues[this.currentIp]; }

    [Symbol.iterator](): Iterator<number> {
        let i = this.startIndex;
        const self = this;
        return {
            next(): IteratorResult<number> {
                if (i < self.validCount) {
                    self.currentIp = (i + self.ipa) & (self.scopePointCount - 1);
                    return { value: i++, done: false };
                }
                return { value: 0, done: true };
            }
        };
    }
}
