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
import { Color } from "./Color";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";

export class LineElm extends GraphicElm {

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

    getDumpType(): number { return 423; }

    drag(xx: number, yy: number): void {
        this.x2 = xx;
        this.y2 = yy;
    }

    creationFailed(): boolean {
        return Math.hypot(this.x - this.x2, this.y - this.y2) < 16;
    }

    draw(g: Graphics): void {
        //g.setColor(needsHighlight() ? selectColor : lightGrayColor);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : Color.GRAY);
        this.setBbox(this.x, this.y, this.x2, this.y2);
        g.drawLine(this.x, this.y, this.x2, this.y2);
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
        const d2 = this.lineDistanceSq(this.x, this.y, this.x2, this.y2, gx, gy);
        if (d2 <= thresh * thresh)
            return d2;
        return -1;
    }
}
