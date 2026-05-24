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

import { Point } from "./Point";

// Stub — to be implemented from WireRouter.java
export class WireRouter {
    static lastRouter: WireRouter | null = null;
    addObstacle(px1: number, py1: number, px2: number, py2: number): void;
    addObstacle(pts: Point[]): void;
    addObstacle(px1OrPts: number | Point[], py1?: number, px2?: number, py2?: number): void {
        if (Array.isArray(px1OrPts)) {
            const minX = Math.min(...px1OrPts.map(p => p.x));
            const minY = Math.min(...px1OrPts.map(p => p.y));
            const maxX = Math.max(...px1OrPts.map(p => p.x));
            const maxY = Math.max(...px1OrPts.map(p => p.y));
            this.addObstacle(minX, minY, maxX, maxY);
        }
    }
    addWire(px1: number, py1: number, px2: number, py2: number): void {}
}
