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

import { CircuitNode } from "./CircuitNode";
import { VoltageSource } from "./VoltageSource";
import { SparseLU } from "./matrix/SparseLU";

export class CircuitMatrix {
    matrix: number[][] = [];
    rightSide: number[] = [];
    origRightSide: number[] = [];
    origMatrix: number[][] = [];
    permute: number[] = [];
    size: number = 0;
    nodeCount: number = 0;   // number of node rows (vs rows come after)
    nonLinear: boolean = false;
    nodeVoltages: number[] = [];
    lastNodeVoltages: number[] | null = null;
    sparseLU: SparseLU | null = null;
    nodeList: CircuitNode[] = [];
    voltageSourceList: VoltageSource[] = [];

    // the entries stamped since clear(), as col*size+row; every other entry of
    // matrix and origMatrix is zero, so the sparse solver resets and converts only these
    // instead of all size*size entries
    stamped: number[] = [];
    stampedSorted: boolean = true;
    private stampedFlags: Uint8Array = new Uint8Array(0);

    clear(): void {
        const sz = this.size;
        this.matrix = Array.from({length: sz}, () => new Array(sz).fill(0));
        this.origMatrix = Array.from({length: sz}, () => new Array(sz).fill(0));
        this.stampedFlags = new Uint8Array(sz * sz);
        this.stamped = [];
        this.stampedSorted = true;
    }

    stamp(row: number, col: number, x: number): void {
        this.matrix[row][col] += x;
        const k = col * this.size + row;
        if (!this.stampedFlags[k]) {
            this.stampedFlags[k] = 1;
            this.stamped.push(k);
            this.stampedSorted = false;
        }
    }
}
