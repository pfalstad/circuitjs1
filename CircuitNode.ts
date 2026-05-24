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

import { CircuitNodeLink } from "./CircuitNodeLink";
import { CircuitMatrix } from "./CircuitMatrix";

export class CircuitNode {
    static ground: CircuitNode;
    links: CircuitNodeLink[] = [];
    internal: boolean = false;
    index: number = 0;
    matrix: CircuitMatrix | null = null;
    row: number = 0;  // row in matrix (0 = ground/excluded)

    toString(): string { return "node " + this.index; }
}

// Initialize static ground node after class definition
CircuitNode.ground = new CircuitNode();
