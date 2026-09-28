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
import { CircuitMatrix } from "./CircuitMatrix";

export class VoltageSource {
    index: number = 0;
    elm: any = null;  // CircuitElm — typed as any to avoid circular import
    matrix: CircuitMatrix | null = null;
    row: number = 0;  // row in matrix (nodeCount + 1-based offset)
    n1: CircuitNode | null = null;  // nodes this VS is stamped between
    n2: CircuitNode | null = null;

    // save the nodes this voltage source is stamped between.
    // used later to determine which matrix it belongs to.
    setNodes(n1: CircuitNode, n2: CircuitNode): void {
        this.n1 = n1;
        this.n2 = n2;
    }

    // assign matrix from saved nodes (use non-ground node's matrix)
    assignMatrix(): void {
        if (this.n1 != null && this.n1 !== CircuitNode.ground && this.n1.matrix != null)
            this.matrix = this.n1.matrix;
        else if (this.n2 != null && this.n2 !== CircuitNode.ground && this.n2.matrix != null)
            this.matrix = this.n2.matrix;
        else
            // fallback: use element's last node
            this.matrix = this.elm.getNode(this.elm.getPostCount()-1).matrix;
        if (this.matrix == null) {
            console.log("null matrix! " + this.elm + " n1=" + (this.n1 == null ? "null" : this.n1.index + " m=" + this.n1.matrix) + " n2=" + (this.n2 == null ? "null" : this.n2.index + " m=" + this.n2.matrix) + " fallback=" + this.elm.getNode(this.elm.getPostCount()-1).index);
        }
    }
}
