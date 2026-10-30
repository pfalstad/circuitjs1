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
import { Rectangle } from "./Rectangle";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class BoxElm extends ShapeElm {

    opacity = 0;	// fill, 0-100%; 0 = no fill
    cornerRadius = 0;

    // box-only memory of the last box drawn or edited
    static lastOpacity = 0;
    static lastCornerRadius = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.x2 = xxOrXa;
            this.y2 = yyOrYa;
            this.opacity = BoxElm.lastOpacity;
            this.cornerRadius = BoxElm.lastCornerRadius;
            this.setBbox(this.x, this.y, this.x2, this.y2);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.x2 = xb;
            this.y2 = yb!;
            this.setBbox(this.x, this.y, this.x2, this.y2);
        }
    }

    getDumpType(): number { return 'b'.charCodeAt(0); }
    defaultStyle(): number { return ShapeElm.STYLE_DASHED; }
    isBoxElm(): boolean { return true; }

    remember(): void {
        super.remember();
        BoxElm.lastOpacity = this.opacity;
        BoxElm.lastCornerRadius = this.cornerRadius;
    }

    creationFailed(): boolean {
        return Math.abs(this.x2 - this.x) < 32 || Math.abs(this.y2 - this.y) < 32;
    }

    // Shift: square, using the longer side
    constrain(): void {
        const dx = this.x2 - this.x, dy = this.y2 - this.y;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        this.x2 = this.x + (dx < 0 ? -d : d);
        this.y2 = this.y + (dy < 0 ? -d : d);
    }

    // used by CircuitElm.sortBoxes()
    area(): number { return Math.abs(this.x2 - this.x) * Math.abs(this.y2 - this.y); }

    draw(g: Graphics): void {
        this.setBbox(this.x, this.y, this.x2, this.y2);
        const bx = Math.min(this.x, this.x2), by = Math.min(this.y, this.y2);
        const bw = Math.abs(this.x2 - this.x), bh = Math.abs(this.y2 - this.y);
        const r = Math.min(this.cornerRadius, Math.trunc(Math.min(bw, bh) / 2));
        const ctx = g.context;
        if (this.opacity > 0) {
            g.setColor(this.shapeColor());
            ctx.save();
            ctx.globalAlpha = this.opacity / 100;
            BoxElm.boxPath(ctx, bx, by, bw, bh, r);
            ctx.fill();
            ctx.restore();
        }
        this.beginStroke(g);
        if (r === 0)
            g.drawRect(bx, by, bw, bh);
        else {
            BoxElm.boxPath(ctx, bx, by, bw, bh, r);
            ctx.stroke();
        }
        this.endStroke(g);
    }

    // rectangle outline with rounded corners (arcs, so it survives SVG export)
    static boxPath(ctx: CanvasRenderingContext2D, bx: number, by: number, bw: number, bh: number, r: number): void {
        ctx.beginPath();
        if (r === 0) {
            ctx.rect(bx, by, bw, bh);
            return;
        }
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + bw - r, by);
        ctx.arc(bx + bw - r, by + r, r, -Math.PI / 2, 0);
        ctx.lineTo(bx + bw, by + bh - r);
        ctx.arc(bx + bw - r, by + bh - r, r, 0, Math.PI / 2);
        ctx.lineTo(bx + r, by + bh);
        ctx.arc(bx + r, by + bh - r, r, Math.PI / 2, Math.PI);
        ctx.lineTo(bx, by + r);
        ctx.arc(bx + r, by + r, r, Math.PI, Math.PI * 1.5);
        ctx.closePath();
    }

    extraCount(): number { return 2; }

    getExtraEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Fill Opacity (%)", this.opacity, 0, 100).setDimensionless().setUnitStep().disallowSliders();
        if (n === 1)
            return new EditInfo("Corner Radius", this.cornerRadius, 0, 100).setDimensionless().setUnitStep().disallowSliders();
        return null;
    }

    setExtraEditValue(n: number, ei: EditInfo): void {
        const v = Math.round(ei.value);
        if (n === 0) {
            if (v < 0 || v > 100) {
                ei.setError("must be from 0 to 100");
                return;
            }
            this.opacity = v;
        }
        if (n === 1) {
            if (v < 0) {
                ei.setError("must be 0 or more");
                return;
            }
            this.cornerRadius = v;
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        if (this.opacity !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "op", this.opacity);
        if (this.cornerRadius !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "cr", this.cornerRadius);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.opacity = xml.parseIntAttr("op", 0);
        this.cornerRadius = xml.parseIntAttr("cr", 0);
    }

    // only the edges count, so whatever is inside the box can still be picked
    getMouseDistance(gx: number, gy: number): number {
        const thresh = Math.max(10, Math.trunc(this.thickness / 2) + 4);
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
