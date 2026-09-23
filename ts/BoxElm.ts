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

import { GraphicElm } from "./GraphicElm";
import { CircuitElm } from "./CircuitElm";
import { Graphics } from "./Graphics";
import { Rectangle } from "./Rectangle";
import { Color } from "./Color";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";

export class BoxElm extends GraphicElm {

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.x2 = xxOrXa;
            this.y2 = yyOrYa;
            this.setBbox(this.x, this.y, this.x2, this.y2);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.x2 = xb;
            this.y2 = yb!;
            this.setBbox(this.x, this.y, this.x2, this.y2);
        }
    }

    getDumpType(): number { return 'b'.charCodeAt(0); }

    drag(xx: number, yy: number): void {
        this.x2 = xx;
        this.y2 = yy;
    }

    creationFailed(): boolean {
        return Math.abs(this.x2 - this.x) < 32 || Math.abs(this.y2 - this.y) < 32;
    }

    draw(g: Graphics): void {
        //g.setColor(needsHighlight() ? selectColor : lightGrayColor);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : Color.GRAY);
        this.setBbox(this.x, this.y, this.x2, this.y2);
        g.setLineDash(16, 6);
        if (this.x < this.x2 && this.y < this.y2)
            g.drawRect(this.x, this.y, this.x2 - this.x, this.y2 - this.y);
        else if (this.x > this.x2 && this.y < this.y2)
            g.drawRect(this.x2, this.y, this.x - this.x2, this.y2 - this.y);
        else if (this.x < this.x2 && this.y > this.y2)
            g.drawRect(this.x, this.y2, this.x2 - this.x, this.y - this.y2);
        else
            g.drawRect(this.x2, this.y2, this.x - this.x2, this.y - this.y2);
        g.setLineDash(0, 0);
    }

    getEditInfo(n: number): EditInfo | null {
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
    }

    getInfo(arr: string[]): void {
    }

    getShortcut(): number { return 0; }

    getMouseDistance(gx: number, gy: number): number {
        const thresh = 10;
        const dx1 = Math.abs(gx - this.x);
        const dy1 = Math.abs(gy - this.y);
        const dx2 = Math.abs(gx - this.x2);
        const dy2 = Math.abs(gy - this.y2);
        if (Math.abs(dx1) < thresh)
            return dx1 * dx1;
        if (Math.abs(dx2) < thresh)
            return dx2 * dx2;
        if (Math.abs(dy1) < thresh)
            return dy1 * dy1;
        if (Math.abs(dy2) < thresh)
            return dy2 * dy2;
        return -1;
    }

    selectRect(r: Rectangle, add: boolean): void {
        if (r.contains(this.boundingBox))
            this.selected = true;
        else if (!add)
            this.selected = false;
    }
}
