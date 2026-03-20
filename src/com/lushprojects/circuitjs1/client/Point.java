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

package com.lushprojects.circuitjs1.client;

public class Point {
	public int x;
	public int y;
	public int z;

	 public Point(int i, int j) {
		x=i;
		y=j;
	}

	 public Point(int i, int j, int k) {
		x=i;
		y=j;
		z=k;
	}

	 public Point(Point p) {
		x=p.x;
		y=p.y;
		z=p.z;
	}

	 public Point() {
		 x=0;
		 y=0;
	 }

	 public void setLocation(Point p) {
		 x=p.x;
		 y=p.y;
		 z=p.z;
	 }

         public String toString() {
             if (z != 0)
                 return "Point(" + x + "," + y + "," + z + ")";
             return "Point(" + x + "," + y + ")";
         }

         @Override public boolean equals(Object other) {
             boolean result = false;
             if (other instanceof Point) {
                 Point that = (Point) other;
                 result = (this.x == that.x && this.y == that.y && this.z == that.z);
             }
             return result;
         }

         @Override public int hashCode() {
             return 41 * (41 * (41 + x) + y) + z;
         }

	public void move(int dx, int dy) {
	     x += dx;
	     y += dy;
	}
}
