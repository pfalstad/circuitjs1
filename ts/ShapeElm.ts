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
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { Checkbox } from "./Checkbox";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

// Common base for the editable drawing shapes (BoxElm, LineElm): colour, thickness and
// line style, plus a "last used" memory so a new shape copies the one most recently drawn
// or edited.  Snap mode is a session setting shared by all shapes and isn't saved.
// Edit dialog rows: the 3 common rows, the subclass's own rows (getExtraEditInfo), then
// the 2 snap checkboxes.
export abstract class ShapeElm extends GraphicElm {

    static readonly SNAP_FREE = 0;
    static readonly SNAP_GRID = 1;
    static readonly SNAP_MID  = 2;
    static readonly STYLE_SOLID = 0;
    static readonly STYLE_DASHED = 1;
    static readonly STYLE_DOTTED = 2;
    static readonly STYLE_LONG_DASH = 3;
    static readonly STYLE_DASH_DOT = 4;
    static readonly STYLE_DASH_DOT_DOT = 5;
    static readonly styleNames = [ "Solid", "Dashed", "Dotted", "Long Dash", "Dash-Dot", "Dash-Dot-Dot" ];

    // dash/gap patterns for thickness 1-2; they step up every 2 thicknesses (x2 at 3-4,
    // x3 at 5-6...).  Line ends are round, so a near-zero dash draws a round dot.
    static readonly DOT = .01;
    static readonly dashPatterns: (number[] | null)[] = [
        null, [ 16, 6 ], [ ShapeElm.DOT, 4 ], [ 32, 10 ],
        [ 16, 5, ShapeElm.DOT, 5 ], [ 16, 5, ShapeElm.DOT, 5, ShapeElm.DOT, 5 ] ];

    // session setting, not saved: snap mode for drawing and moving shapes
    static snap = ShapeElm.SNAP_GRID;

    // memory of the last shape drawn or edited, shared by boxes and lines
    static lastColor: string | null = null;
    static lastThickness = 1;
    static lastStyle = -1;	// -1 = each shape's own default (box dashed, line solid)

    color: string | null = null;	// null = default gray
    thickness = 1;
    lineStyle = 0;
    // set by MouseManager while drawing: Shift held locks a line to 0/45/90 degrees,
    // a box to a square
    shiftLock = false;

    // the two snap checkboxes in the open edit dialog, so ticking one can untick the other
    gridBox: Checkbox | null = null;
    midBox: Checkbox | null = null;

    // new shape being drawn (also used when loading, see undumpXml): copy the last one
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number) {
        if (xb === undefined) {
            super(xa, ya);
            this.color = ShapeElm.lastColor;
            this.thickness = ShapeElm.lastThickness;
            this.lineStyle = (ShapeElm.lastStyle < 0) ? this.defaultStyle() : ShapeElm.lastStyle;
        } else {
            super(xa, ya, xb, yb!, f!);
            this.lineStyle = this.defaultStyle();
        }
    }

    abstract defaultStyle(): number;

    isShapeElm(): boolean { return true; }

    remember(): void {
        ShapeElm.lastColor = this.color;
        ShapeElm.lastThickness = this.thickness;
        ShapeElm.lastStyle = this.lineStyle;
    }

    draggingDone(): void { this.remember(); }

    // ---- snapping and drawing out ----

    snapCoord(v: number): number {
        if (ShapeElm.snap === ShapeElm.SNAP_GRID)
            return CircuitElm.app.snapGrid(v);
        if (ShapeElm.snap === ShapeElm.SNAP_MID) {
            const h = Math.trunc(CircuitElm.app.gridSize / 2);
            return CircuitElm.app.snapGrid(v - h) + h;
        }
        return v;
    }

    // first point of a new shape, from the raw (unsnapped) mouse position
    placeStart(xx: number, yy: number): void {
        this.x = this.x2 = this.snapCoord(xx);
        this.y = this.y2 = this.snapCoord(yy);
        this.setBbox(this.x, this.y, this.x2, this.y2);
    }

    drag(xx: number, yy: number): void {
        this.x2 = this.snapCoord(xx);
        this.y2 = this.snapCoord(yy);
        if (this.shiftLock)
            this.constrain();
    }

    // Shift held while drawing; each shape decides what that means
    constrain(): void { }

    // drag one endpoint to a raw mouse position
    movePostTo(n: number, xx: number, yy: number): void {
        xx = this.snapCoord(xx);
        yy = this.snapCoord(yy);
        if (n === 0 ? (xx === this.x2 && yy === this.y2) : (xx === this.x && yy === this.y))
            return;	// don't collapse to zero size
        if (n === 0) { this.x = xx; this.y = yy; } else { this.x2 = xx; this.y2 = yy; }
        this.setBbox(this.x, this.y, this.x2, this.y2);
        this.setPoints();
    }

    // shapes have no posts, but both stored points are resize handles
    getNumHandles(): number { return 2; }

    // show both handles, the grabbed one bigger
    drawHandles(g: Graphics, c: Color): void {
        g.setColor(c);
        if (this.lastHandleGrabbed === 0)
            g.fillRect(this.x - 4, this.y - 4, 9, 9);
        else
            g.fillRect(this.x - 3, this.y - 3, 7, 7);
        if (this.lastHandleGrabbed === 1)
            g.fillRect(this.x2 - 4, this.y2 - 4, 9, 9);
        else
            g.fillRect(this.x2 - 3, this.y2 - 3, 7, 7);
    }

    // ---- drawing helpers ----

    // set colour, width and dash for stroking; call endStroke() afterwards
    beginStroke(g: Graphics): void {
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : this.shapeColor());
        g.setLineWidth(this.thickness);
        const p = ShapeElm.dashPatterns[this.lineStyle];
        // (Graphics.setLineDash() only takes one dash/gap pair)
        if (p != null && typeof g.context.setLineDash === "function") {
            const step = Math.trunc((this.thickness + 1) / 2);
            g.context.setLineDash(p.map(v => v * step));
        }
    }

    endStroke(g: Graphics): void {
        g.setLineDash(0, 0);
        g.setLineWidth(1.0);
    }

    shapeColor(): Color { return this.color != null ? new Color(this.color) : Color.GRAY; }

    // ---- edit dialog ----

    showPropertiesOnCreate(): boolean { return false; }

    extraCount(): number { return 0; }
    getExtraEditInfo(n: number): EditInfo | null { return null; }
    setExtraEditValue(n: number, ei: EditInfo): void { }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Color", this.color != null ? this.color : Color.GRAY.getHexValue()).setIsColor();
        if (n === 1)
            return new EditInfo("Thickness", this.thickness, 1, 10).setDimensionless().setUnitStep().disallowSliders();
        if (n === 2) {
            const ei = new EditInfo("Line Style", 0, -1, -1);
            ei.choice = new Choice();
            for (const s of ShapeElm.styleNames)
                ei.choice.add(s);
            ei.choice.select(this.lineStyle);
            return ei;
        }
        n -= 3;
        if (n < this.extraCount())
            return this.getExtraEditInfo(n);
        n -= this.extraCount();
        // neither ticked = free placement.  only affects what's drawn or moved from now on
        if (n === 0) {
            const ei = EditInfo.createCheckbox("Snap to Grid", ShapeElm.snap === ShapeElm.SNAP_GRID);
            this.gridBox = ei.checkbox;
            return ei;
        }
        if (n === 1) {
            const ei = EditInfo.createCheckbox("Snap to Mid-Grid", ShapeElm.snap === ShapeElm.SNAP_MID);
            this.midBox = ei.checkbox;
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            const c = (ei.textf as HTMLInputElement).value;
            this.color = c.toLowerCase() === Color.GRAY.getHexValue().toLowerCase() ? null : c;
        } else if (n === 1) {
            const t = Math.round(ei.value);
            if (t < 1 || t > 10) {
                ei.setError("must be from 1 to 10");
                return;
            }
            this.thickness = t;
        } else if (n === 2) {
            this.lineStyle = ei.choice!.getSelectedIndex();
        } else if (n - 3 < this.extraCount()) {
            this.setExtraEditValue(n - 3, ei);
        } else {
            const k = n - 3 - this.extraCount();
            const mode = (k === 0) ? ShapeElm.SNAP_GRID : ShapeElm.SNAP_MID;
            if (ei.checkbox!.getState()) {
                ShapeElm.snap = mode;
                const other = (k === 0) ? this.midBox : this.gridBox;
                if (other != null)
                    other.setState(false);	// no event fired, so no loop
            } else if (ShapeElm.snap === mode)
                ShapeElm.snap = ShapeElm.SNAP_FREE;
        }
        this.remember();
    }

    // ---- save/load (attributes left out when they're the default) ----

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        if (this.color != null)
            CircuitXMLSerializer.dumpAttr(elem, "co", this.color);
        if (this.thickness !== 1)
            CircuitXMLSerializer.dumpAttr(elem, "th", this.thickness);
        if (this.lineStyle !== this.defaultStyle())
            CircuitXMLSerializer.dumpAttr(elem, "ls", this.lineStyle);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        // loading goes through the new-shape constructor, which copied the remembered
        // settings; a missing attribute means the default, not the remembered value
        this.color = xml.parseStringAttr("co", null);
        this.thickness = xml.parseIntAttr("th", 1);
        this.lineStyle = xml.parseIntAttr("ls", this.defaultStyle());
    }

    getInfo(arr: string[]): void { }

    getShortcut(): number { return 0; }
}
