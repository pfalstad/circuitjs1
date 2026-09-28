//    Extracted from file
//    Copyright 1995-2006 Sun Microsystems, Inc.  All Rights Reserved
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 2 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.

// via http://grepcode.com/file/repository.grepcode.com/java/root/jdk/openjdk/6-b14/java/awt/Polygon.java

export class Polygon {
//  ArrayList<Point> poly;

    private static readonly MIN_LENGTH = 4;
    npoints: number = 0;
    xpoints: number[];
    ypoints: number[];

    constructor() {
//      poly = new ArrayList<Point>();
        this.xpoints = new Array(Polygon.MIN_LENGTH).fill(0);
        this.ypoints = new Array(Polygon.MIN_LENGTH).fill(0);
    }

//  addPoint(x: number, y: number): void {
//      poly.add(new Point(x,y));
//  }

    addPoint(x: number, y: number): void {
        if (this.npoints >= this.xpoints.length || this.npoints >= this.ypoints.length) {
            let newLength = this.npoints * 2;
            // Make sure that newLength will be greater than MIN_LENGTH and
            // aligned to the power of 2
            if (newLength < Polygon.MIN_LENGTH) {
                newLength = Polygon.MIN_LENGTH;
            } else if ((newLength & (newLength - 1)) !== 0) {
                newLength = Math.pow(2, Math.ceil(Math.log2(newLength)));
            }

            this.xpoints = this.expand(this.xpoints, newLength);
            this.ypoints = this.expand(this.ypoints, newLength);
        }
        this.xpoints[this.npoints] = x;
        this.ypoints[this.npoints] = y;
        this.npoints++;
//      if (bounds != null) {
//          updateBounds(x, y);
//      }
    }

    private expand(inp: number[], newlen: number): number[] {
        const out = new Array(newlen).fill(0);
        for (let i = 0; i < inp.length; i++)
            out[i] = inp[i];
        return out;
    }
}
