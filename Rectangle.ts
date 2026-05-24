/*
    Copyright 1995-2006 Sun Microsystems, Inc.  All Rights Reserved.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

// Via http://grepcode.com/file_/repository.grepcode.com/java/root/jdk/openjdk/6-b14/java/awt/Rectangle.java/?v=source

import { Point } from "./Point";

const INT_MAX = 2147483647;

export class Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;

    constructor();
    constructor(x: number, y: number, width: number, height: number);
    constructor(pt: Point);
    constructor(r: Rectangle);
    constructor(arg0?: number | Point | Rectangle, arg1?: number, arg2?: number, arg3?: number) {
        if (arg0 === undefined) {
            this.x = 0; this.y = 0; this.width = 0; this.height = 0;
        } else if (arg0 instanceof Point) {
            this.x = arg0.x; this.y = arg0.y; this.width = 0; this.height = 0;
        } else if (arg0 instanceof Rectangle) {
            this.x = arg0.x; this.y = arg0.y; this.width = arg0.width; this.height = arg0.height;
        } else {
            this.x = arg0; this.y = arg1 as number; this.width = arg2 as number; this.height = arg3 as number;
        }
    }

    setBounds(x: number, y: number, width: number, height: number): void {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    translate(dx: number, dy: number): void {
        this.x += dx;
        this.y += dy;
    }

    contains(x: number, y: number): boolean;
    contains(r: Rectangle): boolean;
    contains(arg0: number | Rectangle, arg1?: number): boolean {
        if (arg0 instanceof Rectangle)
            return this.contains(arg0.x, arg0.y) && this.contains(arg0.x + arg0.width, arg0.y + arg0.height);
        const X = arg0, Y = arg1 as number;
        const w = this.width;
        const h = this.height;
        if ((w | h) < 0) {
            // At least one of the dimensions is negative...
            return false;
        }
        // Note: if either dimension is zero, tests below must return false...
        const x = this.x;
        const y = this.y;
        if (X < x || Y < y) {
            return false;
        }
        const w2 = w + x;
        const h2 = h + y;
        //    overflow || intersect
        return ((w2 < x || w2 > X) &&
                (h2 < y || h2 > Y));
    }

    /*
    move(x: number, y: number): void {
        this.x = x;
        this.y = y;
    }
    */

    intersects(r: Rectangle): boolean {
        let tw = this.width;
        let th = this.height;
        let rw = r.width;
        let rh = r.height;
        if (rw <= 0 || rh <= 0 || tw <= 0 || th <= 0) {
            return false;
        }
        const tx = this.x;
        const ty = this.y;
        const rx = r.x;
        const ry = r.y;
        rw += rx;
        rh += ry;
        tw += tx;
        th += ty;
        //      overflow || intersect
        return ((rw < rx || rw > tx) &&
                (rh < ry || rh > ty) &&
                (tw < tx || tw > rx) &&
                (th < ty || th > ry));
    }

    union(r: Rectangle): Rectangle {
        let tx2 = this.width;
        let ty2 = this.height;
        if ((tx2 | ty2) < 0) {
            // This rectangle has negative dimensions...
            // If r has non-negative dimensions then it is the answer.
            // If r is non-existant (has a negative dimension), then both
            // are non-existant and we can return any non-existant rectangle
            // as an answer.  Thus, returning r meets that criterion.
            // Either way, r is our answer.
            return new Rectangle(r);
        }
        let rx2 = r.width;
        let ry2 = r.height;
        if ((rx2 | ry2) < 0) {
            return new Rectangle(this);
        }
        let tx1 = this.x;
        let ty1 = this.y;
        tx2 += tx1;
        ty2 += ty1;
        let rx1 = r.x;
        let ry1 = r.y;
        rx2 += rx1;
        ry2 += ry1;
        if (tx1 > rx1) tx1 = rx1;
        if (ty1 > ry1) ty1 = ry1;
        if (tx2 < rx2) tx2 = rx2;
        if (ty2 < ry2) ty2 = ry2;
        tx2 -= tx1;
        ty2 -= ty1;
        // tx2,ty2 will never underflow since both original rectangles
        // were already proven to be non-empty
        // they might overflow, though...
        if (tx2 > INT_MAX) tx2 = INT_MAX;
        if (ty2 > INT_MAX) ty2 = INT_MAX;
        return new Rectangle(tx1, ty1, tx2, ty2);
    }

    equals(other: unknown): boolean {
        if (other instanceof Rectangle) {
            const r = other;
            return ((this.x === r.x) &&
                    (this.y === r.y) &&
                    (this.width === r.width) &&
                    (this.height === r.height));
        }
        return false;
    }

    toString(): string { return "Rect(" + this.x + "," + this.y + "," + this.width + "," + this.height + ")"; }
}
