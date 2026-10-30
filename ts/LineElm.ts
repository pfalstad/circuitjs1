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

import { ShapeElm } from "./ShapeElm";
import { Graphics } from "./Graphics";
import { Polygon } from "./Polygon";
import { Choice } from "./Choice";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class LineElm extends ShapeElm {

    static readonly ARROW_NONE = 0;
    static readonly ARROW_END = 1;
    static readonly ARROW_START = 2;
    static readonly ARROW_BOTH = 3;
    arrows = 0;

    // line-only memory of the last line drawn or edited
    static lastArrows = 0;

    // session setting, not saved: each new line starts where the last one ended
    static daisyChain = false;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.x2 = xxOrXa;
            this.y2 = yyOrYa;
            this.arrows = LineElm.lastArrows;
            this.setBbox(this.x, this.y, this.x2, this.y2);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.x2 = xb;
            this.y2 = yb!;
            this.setBbox(this.x, this.y, this.x2, this.y2);
        }
    }

    getDumpType(): number { return 423; }
    defaultStyle(): number { return ShapeElm.STYLE_SOLID; }
    isLineElm(): boolean { return true; }

    // MouseManager asks this after a line is finished (it doesn't import LineElm)
    daisyChains(): boolean { return LineElm.daisyChain; }

    remember(): void {
        super.remember();
        LineElm.lastArrows = this.arrows;
    }

    creationFailed(): boolean {
        return Math.hypot(this.x - this.x2, this.y - this.y2) < 16;
    }

    // Shift: lock to the nearest 0/45/90 degrees from the start point
    constrain(): void {
        const dx = this.x2 - this.x, dy = this.y2 - this.y;
        if (dx === 0 && dy === 0)
            return;
        const oct = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));	// -4..4, in 45 degree steps
        if (oct % 4 === 0)
            this.y2 = this.y;		// horizontal
        else if (Math.abs(oct) === 2)
            this.x2 = this.x;		// vertical
        else {
            const d = Math.max(Math.abs(dx), Math.abs(dy));
            this.x2 = this.x + (dx < 0 ? -d : d);
            this.y2 = this.y + (dy < 0 ? -d : d);
        }
    }

    draw(g: Graphics): void {
        this.setBbox(this.x, this.y, this.x2, this.y2);
        const len = Math.hypot(this.x2 - this.x, this.y2 - this.y);
        const aStart = (this.arrows & LineElm.ARROW_START) !== 0;
        const aEnd = (this.arrows & LineElm.ARROW_END) !== 0;
        // arrowhead size grows with thickness; shorten the line so a thick
        // stroke doesn't poke out past the arrow's tip
        const alen = Math.min(6 + 3 * this.thickness, len / 2);
        let sx = this.x, sy = this.y, ex = this.x2, ey = this.y2;
        if (len > 0) {
            const ux = (this.x2 - this.x) / len, uy = (this.y2 - this.y) / len;
            if (aStart) { sx = Math.round(this.x + ux * alen * .8); sy = Math.round(this.y + uy * alen * .8); }
            if (aEnd)   { ex = Math.round(this.x2 - ux * alen * .8); ey = Math.round(this.y2 - uy * alen * .8); }
        }
        this.beginStroke(g);
        g.drawLine(sx, sy, ex, ey);
        this.endStroke(g);
        if (len > 0) {
            if (aStart)
                g.fillPolygon(LineElm.arrowHead(this.x2, this.y2, this.x, this.y, len, alen));
            if (aEnd)
                g.fillPolygon(LineElm.arrowHead(this.x, this.y, this.x2, this.y2, len, alen));
        }
    }

    // filled arrowhead with its tip at (tx,ty), pointing away from (fx,fy)
    static arrowHead(fx: number, fy: number, tx: number, ty: number, len: number, alen: number): Polygon {
        const ux = (tx - fx) / len, uy = (ty - fy) / len;
        const bx = tx - ux * alen, by = ty - uy * alen;
        const hw = alen * .45;
        const p = new Polygon();
        p.addPoint(tx, ty);
        p.addPoint(Math.round(bx - uy * hw), Math.round(by + ux * hw));
        p.addPoint(Math.round(bx + uy * hw), Math.round(by - ux * hw));
        return p;
    }

    extraCount(): number { return 1; }

    getExtraEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Arrowheads", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("None");
            ei.choice.add("End");
            ei.choice.add("Start");
            ei.choice.add("Both Ends");
            ei.choice.select(this.arrows);
            return ei;
        }
        return null;
    }

    setExtraEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.arrows = ei.choice!.getSelectedIndex();
    }

    // daisy chain goes below the snap checkboxes
    daisyRow(): number { return 3 + this.extraCount() + 2; }

    getEditInfo(n: number): EditInfo | null {
        if (n === this.daisyRow())
            return EditInfo.createCheckbox("Daisy Chain", LineElm.daisyChain);
        return super.getEditInfo(n);
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === this.daisyRow()) {
            LineElm.daisyChain = ei.checkbox!.getState();
            return;
        }
        super.setEditValue(n, ei);
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        if (this.arrows !== LineElm.ARROW_NONE)
            CircuitXMLSerializer.dumpAttr(elem, "ar", this.arrows);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.arrows = xml.parseIntAttr("ar", LineElm.ARROW_NONE);
    }

    getMouseDistance(gx: number, gy: number): number {
        const thresh = Math.max(10, Math.trunc(this.thickness / 2) + 4);
        const d2 = this.lineDistanceSq(this.x, this.y, this.x2, this.y2, gx, gy);
        if (d2 <= thresh * thresh)
            return d2;
        return -1;
    }
}
