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

export class Point {
    x: number = 0;
    y: number = 0;
    z: number = 0;

    constructor();
    constructor(x: number, y: number);
    constructor(x: number, y: number, z: number);
    constructor(p: Point);
    constructor(arg0?: number | Point, arg1?: number, arg2?: number) {
        if (arg0 === undefined) {
            // default constructor
        } else if (arg0 instanceof Point) {
            this.x = arg0.x;
            this.y = arg0.y;
            this.z = arg0.z;
        } else {
            this.x = arg0;
            this.y = arg1 as number;
            this.z = arg2 ?? 0;
        }
    }

    setLocation(p: Point): void {
        this.x = p.x;
        this.y = p.y;
        this.z = p.z;
    }

    move(dx: number, dy: number): void {
        this.x += dx;
        this.y += dy;
    }

    equals(other: unknown): boolean {
        if (other instanceof Point)
            return this.x === other.x && this.y === other.y && this.z === other.z;
        return false;
    }

    hashCode(): number {
        return 41 * (41 * (41 + this.x) + this.y) + this.z;
    }

    toString(): string {
        if (this.z !== 0)
            return `Point(${this.x},${this.y},${this.z})`;
        return `Point(${this.x},${this.y})`;
    }
}
