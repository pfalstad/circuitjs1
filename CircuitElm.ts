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

import { Color } from "./Color";
import { Point } from "./Point";
import { Font } from "./Font";
import { Rectangle } from "./Rectangle";
import { Graphics } from "./Graphics";
import { Polygon } from "./Polygon";
import { CircuitNode } from "./CircuitNode";
import { VoltageSource } from "./VoltageSource";
import { WireRouter } from "./WireRouter";
import { Scope } from "./Scope";
import { EditInfo } from "./EditInfo";
import type { Editable } from "./Editable";
import { FindPathInfo } from "./FindPathInfo";
import { MouseManager } from "./MouseManager";
import { NumberFormat } from "./NumberFormat";
import { Locale } from "./Locale";
import { CirSim } from "./CirSim";
import { SimulationManager } from "./SimulationManager";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { parseIntStrict } from "./NumberParse";

// circuit element class
export abstract class CircuitElm implements Editable {
    static voltageRange: number = 5;
    static colorScaleCount: number = 201; // odd so ground = gray
    static colorScale: Color[];
    static currentMult: number;
    static powerMult: number;

    // scratch points for convenience
    static ps1: Point;
    static ps2: Point;

    static app: CirSim;
    static sim: SimulationManager;
    static whiteColor: Color;
    static lightGrayColor: Color;
    static selectColor: Color;
    static positiveColor: Color;
    static negativeColor: Color;
    static neutralColor: Color;
    static currentColor: Color;
    static unitsFont: Font;
    static valueFont: Font;
    static valueFontSize: number = 12;

    static showFormat: NumberFormat;
    static shortFormat: NumberFormat;
    static fixedFormat: NumberFormat;
    static readonly pi: number = 3.14159265358979323846;
    static mouseElmRef: CircuitElm | null = null;

    static readonly SCALE_AUTO = 0;
    static readonly SCALE_1    = 1;
    static readonly SCALE_M    = 2;
    static readonly SCALE_MU   = 3;

    static decimalDigits: number;
    static shortDecimalDigits: number;

    // initial point where user created element.  For simple two-terminal elements, this is the first node/post.
    x: number;

    // point to which user dragged out element.  For simple two-terminal elements, this is the second node/post
    y: number;
    x2: number;
    y2: number;

    flags: number;
    voltSource: VoltageSource | null = null;
    nodes!: CircuitNode[];

    // length along x and y axes, and sign of difference
    dx: number = 0;
    dy: number = 0;
    dsign: number = 0;

    lastHandleGrabbed: number = -1;

    // length of element
    dn: number = 0;

    dpx1: number = 0;
    dpy1: number = 0;

    // (x,y) and (x2,y2) as Point objects
    point1: Point = new Point();
    point2: Point = new Point();

    // lead points (ends of wire stubs for simple two-terminal elements)
    lead1: Point | null = null;
    lead2: Point | null = null;

    current: number = 0;
    curcount: number = 0;
    boundingBox!: Rectangle;

    // if subclasses set this to true, element will be horizontal or vertical only
    noDiagonal: boolean = false;

    selected: boolean = false;
    // the CompositeElm (subcircuit chip) this element is a child of, if any
    parent: CircuitElm | null = null;


//    abstract getDumpType(): number;
    getDumpType(): number {
        return 0;

        //throw new Error("not implemented"); // Seems necessary to work-around what appears to be a compiler
        // bug affecting OTAElm to make sure this method (which should really be abstract) throws
        // an exception.  If you're getting this, try making small update to CompositeElm.java and try again
    }

    getXmlDumpType(): string {
        const t = this.getDumpType();
        if (t > 64 && t < 127)
            return String.fromCharCode(t);
        return this.getClassName().replace("Elm", "");
    }

    // leftover from java, doesn't do anything anymore.
    getDumpClass(): Function { return this.constructor as Function; }

    getDefaultFlags(): number { return 0; }

    hasFlag(f: number): boolean { return (this.flags & f) !== 0; }

    static initClass(app_: CirSim, sim_: SimulationManager): void {
        CircuitElm.sim = sim_;
        CircuitElm.app = app_;

        CircuitElm.colorScale = new Array(CircuitElm.colorScaleCount);

        CircuitElm.ps1 = new Point();
        CircuitElm.ps2 = new Point();

        const stor = typeof localStorage !== 'undefined' ? localStorage : null;
        CircuitElm.decimalDigits = 3;
        CircuitElm.shortDecimalDigits = 1;
        if (stor != null) {
            const s1 = stor.getItem("decimalDigits");
            const s2 = stor.getItem("decimalDigitsShort");
            if (s1 != null)
                CircuitElm.decimalDigits = parseIntStrict(s1);
            if (s2 != null)
                CircuitElm.shortDecimalDigits = parseIntStrict(s2);
            const sf = stor.getItem("valueFontSize");
            if (sf != null)
                CircuitElm.valueFontSize = parseIntStrict(sf);
        }
        CircuitElm.setDecimalDigits(CircuitElm.decimalDigits, false, false);
        CircuitElm.setDecimalDigits(CircuitElm.shortDecimalDigits, true, false);
        CircuitElm.unitsFont = new Font("SansSerif", 0, 12);
        CircuitElm.valueFont = new Font("SansSerif", 0, CircuitElm.valueFontSize);
	CircuitElm.currentMult = 0;
    }

    static setValueFontSize(size: number): void {
        CircuitElm.valueFontSize = size;
        CircuitElm.valueFont = new Font("SansSerif", 0, CircuitElm.valueFontSize);
        const stor = typeof localStorage !== 'undefined' ? localStorage : null;
        if (stor != null)
            stor.setItem("valueFontSize", String(CircuitElm.valueFontSize));
    }

    static setDecimalDigits(num: number, sf: boolean, save: boolean): void {
        if (sf)
            CircuitElm.shortDecimalDigits = num;
        else
            CircuitElm.decimalDigits = num;

        let s = "####.";
        let ct = num;
        for (; ct > 0; ct--)
            s += '#';
        const nf = NumberFormat.getFormat(s);
        if (sf)
            CircuitElm.shortFormat = nf;
        else
            CircuitElm.showFormat = nf;

        if (save) {
            const stor = typeof localStorage !== 'undefined' ? localStorage : null;
            if (stor != null)
                stor.setItem(sf ? "decimalDigitsShort" : "decimalDigits", num.toString());
        }

        if (!sf) {
            s = "####.";
            ct = num;
            for (; ct > 0; ct--)
                s += '0';
            CircuitElm.fixedFormat = NumberFormat.getFormat(s);
        }
    }

    static setColorScale(): void {
        let i: number;

        if (CircuitElm.positiveColor == null)
            CircuitElm.positiveColor = Color.green;
        if (CircuitElm.negativeColor == null)
            CircuitElm.negativeColor = Color.red;
        if (CircuitElm.neutralColor == null)
            CircuitElm.neutralColor = Color.gray;

        for (i = 0; i !== CircuitElm.colorScaleCount; i++) {
            const v = i * 2. / CircuitElm.colorScaleCount - 1;
            if (v < 0) {
                CircuitElm.colorScale[i] = new Color(CircuitElm.neutralColor, CircuitElm.negativeColor, -v);
            } else {
                CircuitElm.colorScale[i] = new Color(CircuitElm.neutralColor, CircuitElm.positiveColor, v);
            }
        }
    }

    // create new element with one post at xx,yy, to be dragged out by user
    constructor(xx: number, yy: number);
    // create element between xa,ya and xb,yb from undump
    constructor(xa: number, ya: number, xb: number, yb: number, f: number);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number) {
        if (xb === undefined) {
            // create new element with one post at xx,yy, to be dragged out by user
            this.x = xa; this.x2 = xa;
            this.y = ya; this.y2 = ya;
            this.flags = this.getDefaultFlags();
        } else {
            // create element between xa,ya and xb,yb from undump
            this.x = xa; this.y = ya; this.x2 = xb; this.y2 = yb!; this.flags = f!;
        }
        this.allocNodes();
        this.initBoundingBox();
    }

    initBoundingBox(): void {
        this.boundingBox = new Rectangle();
        this.boundingBox.setBounds(CircuitElm.min(this.x, this.x2), CircuitElm.min(this.y, this.y2),
                                   CircuitElm.abs(this.x2-this.x)+1, CircuitElm.abs(this.y2-this.y)+1);
    }

    // allocate nodes/volts arrays we need
    allocNodes(): void {
        const n = this.getNodeCount() || 1;

        // preserve voltages if possible
        if (this.nodes == null || this.nodes.length !== n) {
            this.nodes = new Array(n).fill(CircuitNode.ground);
        }
    }

    // dump component state for export/undo
    dump(): string {
        const t = this.getDumpType();
        return (t < 127 ? String.fromCharCode(t)+" " : t+" ") + this.x + " " + this.y + " " +
            this.x2 + " " + this.y2 + " " + this.flags;
    }

    // handle reset button
    reset(): void {
        this.curcount = 0;
    }

    draw(g: Graphics): void {}

    // override this in elements that use highVoltage (gates, chips, inverters, etc.)
    setHighVoltage(hv: number): void {}

    // set current for voltage source vn to c.  vn will be the same value as in a previous call to setVoltageSource(n, vn)
    setCurrent(vs: VoltageSource, c: number): void { this.current = c; }

    // set current for wire-like elements (called from calcWireCurrents, one call per bit for bus wires)
    setWireCurrent(bit: number, c: number): void { this.current = c; }

    // get current for one- or two-terminal elements
    getCurrent(): number { return this.current; }

    setParentList(elmList: CircuitElm[]): void {}

    getChildElmList(): CircuitElm[] | null { return null; }

    // called before makeNodeList to allow elements to set up internal node counts, etc.
    preStamp(): void {}

    // stamp matrix values for linear elements.
    // for non-linear elements, use this to stamp values that don't change each iteration, and call stampRightSide() or stampNonLinear() as needed
    stamp(): void {}

    // add this element as an obstacle to the wire router grid
    addRoutingObstacle(router: WireRouter): void {
        if (this.x === this.x2 || this.y === this.y2) {
            router.addWire(this.x, this.y, this.x2, this.y2);
            if (this.lead1 != null && this.lead2 != null)
                router.addObstacle(this.lead1.x, this.lead1.y, this.lead2.x, this.lead2.y);
        }
    }

    addRoutingObstacleWithLeads(router: WireRouter, width: number): void {
        if (this.x === this.x2 || this.y === this.y2) {
            router.addWire(this.x, this.y, this.x2, this.y2);
            const pa = this.interpPoint(this.lead1!, this.lead2!, 0, width);
            const pb = this.interpPoint(this.lead1!, this.lead2!, 1, -width);
            router.addObstacle(pa.x, pa.y, pb.x, pb.y);
        }
    }

    // stamp matrix values for non-linear elements
    doStep(): void {}

    delete(): void {
        if (CircuitElm.mouseElmRef === this)
            CircuitElm.mouseElmRef = null;
        CircuitElm.app.deleteSliders(this);
    }

    startIteration(): void {}

    // get voltage of x'th node
    getPostVoltage(x: number): number { return this.nodes[x].v; }

    // calculate current in response to node voltages changing
    calculateCurrent(): void {}

    // calculate post locations and other convenience values used for drawing.  Called when element is moved
    setPoints(): void {
        this.dx = this.x2 - this.x; this.dy = this.y2 - this.y;
        this.dn = Math.sqrt(this.dx*this.dx + this.dy*this.dy);
        this.dpx1 = this.dy / this.dn;
        this.dpy1 = -this.dx / this.dn;
        this.dsign = (this.dy === 0) ? CircuitElm.sign(this.dx) : CircuitElm.sign(this.dy);
        this.point1 = new Point(this.x, this.y);
        this.point2 = new Point(this.x2, this.y2);
    }

    // calculate lead points for an element of length len.  Handy for simple two-terminal elements.
    // Posts are where the user connects wires; leads are ends of wire stubs drawn inside the element.
    calcLeads(len: number): void {
        if (this.dn < len || len === 0) {
            this.lead1 = this.point1;
            this.lead2 = this.point2;
            return;
        }
        this.lead1 = this.interpPoint(this.point1, this.point2, (this.dn-len)/(2*this.dn));
        this.lead2 = this.interpPoint(this.point1, this.point2, (this.dn+len)/(2*this.dn));
    }

    // Returns true if (px,py) lies strictly inside the axis-aligned segment (ax,ay)-(bx,by).
    static pointOnSegmentInterior(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
        if ((px === ax && py === ay) || (px === bx && py === by)) return false;
        if (ax === bx && px === ax) {
            const miny = Math.min(ay, by), maxy = Math.max(ay, by);
            return py > miny && py < maxy;
        } else if (ay === by && py === ay) {
            const minx = Math.min(ax, bx), maxx = Math.max(ax, bx);
            return px > minx && px < maxx;
        }
        return false;
    }

    // Returns which post (0 or 1) has a lead stub containing (px, py), or -1 if neither.
    getLeadPost(px: number, py: number): number {
        if (this.lead1 != null && this.lead1 !== this.point1 &&
            CircuitElm.pointOnSegmentInterior(this.point1.x, this.point1.y, this.lead1.x, this.lead1.y, px, py))
            return 0;
        if (this.lead2 != null && this.lead2 !== this.point2 &&
            CircuitElm.pointOnSegmentInterior(this.lead2.x, this.lead2.y, this.point2.x, this.point2.y, px, py))
            return 1;
        // 1-post elements with no explicit leads (e.g. GroundElm): the whole point1→point2 segment is the lead
        if (this.lead1 == null && this.getPostCount() === 1 &&
            CircuitElm.pointOnSegmentInterior(this.point1.x, this.point1.y, this.point2.x, this.point2.y, px, py))
            return 0;
        return -1;
    }

    // adjust leads so that the point exactly between them is a grid point (so we can place a terminal there)
    adjustLeadsToGrid(flipX: boolean, flipY: boolean): void {
        const cx = (this.point1.x + this.point2.x) / 2;
        const cy = (this.point1.y + this.point2.y) / 2;

        // when flipping, it changes the rounding direction.  need to adjust for this
        const roundx = flipX ? 1 : -1;
        const roundy = flipY ? 1 : -1;

        const adjx = this.snapGrid(cx + roundx) - cx;
        const adjy = this.snapGrid(cy + roundy) - cy;
        this.lead1!.move(adjx, adjy);
        this.lead2!.move(adjx, adjy);
    }

    // calculate point fraction f between a and b, linearly interpolated
    interpPoint(a: Point, b: Point, f: number): Point;
    // calculate point fraction f between a and b, linearly interpolated, return it in c
    interpPoint(a: Point, b: Point, c: Point, f: number): void;
    /**
     * Returns a point fraction f along the line between a and b and offset perpendicular by g
     * @param a 1st Point
     * @param b 2nd Point
     * @param f Fraction along line
     * @param g Fraction perpendicular to line
     * Returns interpolated point in c
     */
    interpPoint(a: Point, b: Point, c: Point, f: number, g: number): void;
    /**
     * Returns a point fraction f along the line between a and b and offset perpendicular by g
     * @param a 1st Point
     * @param b 2nd Point
     * @param f Fraction along line
     * @param g Fraction perpendicular to line
     * @return Interpolated point
     */
    interpPoint(a: Point, b: Point, f: number, g: number): Point;
    interpPoint(a: Point, b: Point, cOrF: Point | number, fOrG?: number, g?: number): Point | void {
        if (typeof cOrF === "number" && fOrG === undefined) {
            // interpPoint(a, b, f): Point
            const p = new Point();
            this.interpPointInto(a, b, p, cOrF);
            return p;
        } else if (cOrF instanceof Point && g === undefined) {
            // interpPoint(a, b, c, f): void
            this.interpPointInto(a, b, cOrF, fOrG!);
        } else if (cOrF instanceof Point && g !== undefined) {
            // interpPoint(a, b, c, f, g): void
            this.interpPointPerpInto(a, b, cOrF, fOrG!, g);
        } else {
            // interpPoint(a, b, f, g): Point
            const p = new Point();
            this.interpPointPerpInto(a, b, p, cOrF as number, fOrG!);
            return p;
        }
    }

    private interpPointInto(a: Point, b: Point, c: Point, f: number): void {
        c.x = Math.floor(a.x*(1-f) + b.x*f + .48);
        c.y = Math.floor(a.y*(1-f) + b.y*f + .48);
    }

    private interpPointPerpInto(a: Point, b: Point, c: Point, f: number, g: number): void {
        const gx = b.y - a.y;
        const gy = a.x - b.x;
        g /= Math.sqrt(gx*gx + gy*gy);
        c.x = Math.floor(a.x*(1-f) + b.x*f + g*gx + .48);
        c.y = Math.floor(a.y*(1-f) + b.y*f + g*gy + .48);
    }

    /**
     * Calculates two points fraction f along the line between a and b and offest perpendicular by +/-g
     * @param a 1st point (In)
     * @param b 2nd point (In)
     * @param c 1st point (Out)
     * @param d 2nd point (Out)
     * @param f Fraction along line
     * @param g Fraction perpendicular to line
     */
    interpPoint2(a: Point, b: Point, c: Point, d: Point, f: number, g: number): void {
//      int xpd = b.x-a.x;
//      int ypd = b.y-a.y;
        const gx = b.y - a.y;
        const gy = a.x - b.x;
        g /= Math.sqrt(gx*gx + gy*gy);
        c.x = Math.floor(a.x*(1-f) + b.x*f + g*gx + .48);
        c.y = Math.floor(a.y*(1-f) + b.y*f + g*gy + .48);
        d.x = Math.floor(a.x*(1-f) + b.x*f - g*gx + .48);
        d.y = Math.floor(a.y*(1-f) + b.y*f - g*gy + .48);
    }

    draw2Leads(g: Graphics): void {
        // draw first lead
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);

        // draw second lead
        this.setVoltageColor(g, this.nodes[1].v);
        CircuitElm.drawThickLine(g, this.lead2!, this.point2);
    }

    newPointArray(n: number): Point[] {
        const a: Point[] = new Array(n);
        while (n > 0)
            a[--n] = new Point();
        return a;
    }

    snapGrid(z: number): number { return CircuitElm.app.snapGrid(z); }

    readonly CURRENT_TOO_FAST = 100;

    // draw current dots from point a to b
    drawDots(g: Graphics, pa: Point, pb: Point, pos: number): void {
        if ((!CircuitElm.app.simIsRunning()) || pos === 0 || !CircuitElm.app.menus.dotsCheckItem.getState())
            return;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const dn = Math.sqrt(dx*dx + dy*dy);
        g.setColor(CircuitElm.currentColor);
        const ds = 16;
        if (pos === this.CURRENT_TOO_FAST || pos === -this.CURRENT_TOO_FAST) {
            // current is moving too fast, avoid aliasing by drawing dots at
            // random position with transparent yellow line underneath
            g.save();
            const ctx = g.context;
            ctx.lineWidth = 4;
            ctx.globalAlpha = .5;
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
            g.restore();
            pos = Math.random() * ds;
        }
        pos %= ds;
        if (pos < 0)
            pos += ds;
        for (let di = pos; di < dn; di += ds) {
            const x0 = Math.trunc(pa.x + di*dx/dn);
            const y0 = Math.trunc(pa.y + di*dy/dn);
            g.fillRect(x0-2, y0-2, 4, 4);
        }
    }

    addCurCount(c: number, a: number): number {
        if (c === this.CURRENT_TOO_FAST || c === -this.CURRENT_TOO_FAST)
            return c;
        return c + a;
    }

    calcArrow(a: Point, b: Point, al: number, aw: number): Polygon {
        const poly = new Polygon();
        const p1 = new Point();
        const p2 = new Point();
        const adx = b.x - a.x;
        const ady = b.y - a.y;
        const l = Math.sqrt(adx*adx + ady*ady);
        poly.addPoint(b.x, b.y);
        this.interpPoint2(a, b, p1, p2, 1-al/l, aw);
        poly.addPoint(p1.x, p1.y);
        poly.addPoint(p2.x, p2.y);
        return poly;
    }

    createPolygon(a: Point, b: Point, c: Point): Polygon;
    createPolygon(a: Point, b: Point, c: Point, d: Point): Polygon;
    createPolygon(a: Point[]): Polygon;
    createPolygon(a: Point | Point[], b?: Point, c?: Point, d?: Point): Polygon {
        const p = new Polygon();
        if (Array.isArray(a)) {
            for (let i = 0; i !== a.length; i++)
                p.addPoint(a[i].x, a[i].y);
        } else {
            p.addPoint((a as Point).x, (a as Point).y);
            p.addPoint(b!.x, b!.y);
            p.addPoint(c!.x, c!.y);
            if (d !== undefined)
                p.addPoint(d.x, d.y);
        }
        return p;
    }

    // draw second point to xx, yy
    drag(xx: number, yy: number): void {
        xx = this.snapGrid(xx);
        yy = this.snapGrid(yy);
        if (this.noDiagonal) {
            if (Math.abs(this.x-xx) < Math.abs(this.y-yy)) {
                xx = this.x;
            } else {
                yy = this.y;
            }
        }
        this.x2 = xx; this.y2 = yy;
        this.setPoints();
    }

    // Default length (in pixels) used when this element is placed via toolbar
    // drag-and-drop, since there's no drag-to-size gesture to set the length by hand
    // in that case.  Override for elements that look better a bit longer/shorter.
    getDragLength(): number {
        return 64;
    }

    // Override (ignoring requestedVertical) for elements that should only ever be
    // placed vertically via toolbar drag-and-drop, e.g. GroundElm, VoltageElm.
    getDragVertical(requestedVertical: boolean): boolean {
        return requestedVertical;
    }

    // Positions this element for toolbar drag-and-drop placement: (xa,ya) is the
    // anchor point that tracks the mouse, in circuit coordinates, already snapped to
    // the grid.  Called repeatedly as the mouse moves and whenever the requested
    // orientation changes (e.g. the shift key toggled without the mouse moving), so
    // it must be idempotent given the same arguments.  Override for elements where a
    // different point (rather than x,y) should track the mouse, e.g. RailElm, where
    // the label should track the mouse rather than the connection post.
    dragPlace(xa: number, ya: number, vertical: boolean): void {
        vertical = this.getDragVertical(vertical);
        const len = this.getDragLength();
        this.x = xa; this.y = ya;
        this.x2 = xa + (vertical ? 0 : len);
        this.y2 = ya + (vertical ? len : 0);
        this.setPoints();
    }

    // swap the two endpoints in place; for use by dragPlace() overrides on elements
    // where a different point (rather than x,y) should track the mouse anchor
    swapDragEndpoints(): void {
        const tx = this.x, ty = this.y;
        this.x = this.x2; this.y = this.y2;
        this.x2 = tx; this.y2 = ty;
        this.setPoints();
    }

    move(dx: number, dy: number): void {
        this.x += dx; this.y += dy; this.x2 += dx; this.y2 += dy;
        this.boundingBox.translate(dx, dy);
        this.setPoints();
    }

    // called when an element is done being dragged out; returns true if it's zero size and should be deleted
    creationFailed(): boolean {
        return (this.x === this.x2 && this.y === this.y2);
    }

    // this is used to set the position of an internal element so we can draw it inside the parent
    setPosition(x_: number, y_: number, x2_: number, y2_: number): void {
        this.x = x_;
        this.y = y_;
        this.x2 = x2_;
        this.y2 = y2_;
        this.initBoundingBox();
        this.setPoints();
    }

    setPositionFromXml(elem: Element): void {
        const x = elem.getAttribute("x");
        if (x == null)
            return;
        const xs = x.split(" ");
        this.setPosition(parseIntStrict(xs[0]), parseIntStrict(xs[1]),
                         parseIntStrict(xs[2]), parseIntStrict(xs[3]));
    }

    // determine if moving this element by (dx,dy) will put it on top of another element
    allowMove(dx: number, dy: number): boolean {
        const nx = this.x + dx;
        const ny = this.y + dy;
        const nx2 = this.x2 + dx;
        const ny2 = this.y2 + dy;
        for (const ce of CircuitElm.app.elmList) {
            if (ce.x === nx && ce.y === ny && ce.x2 === nx2 && ce.y2 === ny2)
                return false;
            if (ce.x === nx2 && ce.y === ny2 && ce.x2 === nx && ce.y2 === ny)
                return false;
        }
        return true;
    }

    movePoint(n: number, dx: number, dy: number): void {
        // modified by IES to prevent the user dragging points to create zero sized nodes
        // that then render improperly
        const oldx = this.x;
        const oldy = this.y;
        const oldx2 = this.x2;
        const oldy2 = this.y2;
        if (this.noDiagonal) {
            if (this.x === this.x2)
                dx = 0;
            else
                dy = 0;
        }
        if (n === 0) {
            this.x += dx; this.y += dy;
        } else {
            this.x2 += dx; this.y2 += dy;
        }
        if (this.x === this.x2 && this.y === this.y2) {
            this.x = oldx;
            this.y = oldy;
            this.x2 = oldx2;
            this.y2 = oldy2;
        }
        this.setPoints();
    }

    flipX(center2: number, count: number): void {
        this.x  = center2 - this.x;
        this.x2 = center2 - this.x2;
        this.initBoundingBox();
        this.setPoints();
    }

    flipY(center2: number, count: number): void {
        this.y  = center2 - this.y;
        this.y2 = center2 - this.y2;
        this.initBoundingBox();
        this.setPoints();
    }

    flipXY(xmy: number, count: number): void {
        const nx  = this.y  + xmy;
        const ny  = this.x  - xmy;
        const nx2 = this.y2 + xmy;
        const ny2 = this.x2 - xmy;
        this.x = nx; this.y = ny; this.x2 = nx2; this.y2 = ny2;
        this.initBoundingBox();
        this.setPoints();
    }

    drawPosts(g: Graphics): void {
        // we normally do this in updateCircuit() now because the logic is more complicated.
        // we only handle the case where we have to draw all the posts.  That happens when
        // this element is selected or is being created
        if (!this.isCreating() && !this.needsHighlight())
            return;
        if (CircuitElm.app.mouse.mouseMode === MouseManager.MODE_DRAG_ROW ||
            CircuitElm.app.mouse.mouseMode === MouseManager.MODE_DRAG_COLUMN)
            return;
        for (let i = 0; i !== this.getPostCount(); i++) {
            const p = this.getPost(i);
            CircuitElm.drawPost(g, p!);
        }
        this.drawScopeTerminalLabels(g);
    }

    drawScopeTerminalLabels(g: Graphics): void {
        if (this.getPostCount() !== 2)
            return;
        if (!CircuitElm.app.mouse.scopePlotRoles.has(this))
            return;
        if (this.dn === 0)
            return;
        g.setColor(CircuitElm.selectColor);
        g.setFont(CircuitElm.unitsFont);
        g.save();
        g.context.textBaseline = "middle";
        g.context.textAlign = "center";
        const axOff = 10, perpOff = 8;
        const swap = this.isVoltageElm();
        const pp = this.interpPoint(this.point1, this.point2, axOff / this.dn, perpOff);
        g.drawString(swap ? "−" : "+", pp.x, pp.y);
        const mp = this.interpPoint(this.point1, this.point2, 1 - axOff / this.dn, perpOff);
        g.drawString(swap ? "+" : "−", mp.x, mp.y);
        g.restore();
    }

    getNumHandles(): number {
        return this.getPostCount();
    }

    drawHandles(g: Graphics, c: Color): void {
        if (this.getNumHandles() === 0)
            return;
        g.setColor(c);
        if (this.lastHandleGrabbed === -1)
            g.fillRect(this.x-3, this.y-3, 7, 7);
        else if (this.lastHandleGrabbed === 0)
            g.fillRect(this.x-4, this.y-4, 9, 9);
        if (this.getNumHandles() > 1) {
            if (this.lastHandleGrabbed === -1)
                g.fillRect(this.x2-3, this.y2-3, 7, 7);
            else if (this.lastHandleGrabbed === 1)
                g.fillRect(this.x2-4, this.y2-4, 9, 9);
        }
    }

    getHandleGrabbedClose(xtest: number, ytest: number, deltaSq: number, minSize: number): number {
        this.lastHandleGrabbed = -1;
        if (Graphics.distanceSq(this.x, this.y, this.x2, this.y2) >= minSize) {
            if (Graphics.distanceSq(this.x, this.y, xtest, ytest) <= deltaSq)
                this.lastHandleGrabbed = 0;
            else if (this.getNumHandles() > 1 && Graphics.distanceSq(this.x2, this.y2, xtest, ytest) <= deltaSq)
                this.lastHandleGrabbed = 1;
        }
        return this.lastHandleGrabbed;
    }

    // number of voltage sources this element needs
    getVoltageSourceCount(): number { return 0; }

    // number of internal nodes (nodes not visible in UI that are needed for implementation)
    getInternalNodeCount(): number { return 0; }

    // number of nodes this element references by name (v(label)/i(meter) in an expression)
    // but is not wired to.  they are appended to nodes[] after the posts and internal nodes,
    // two per reference (the positive and negative end of the referenced quantity).  they
    // exist so that calculateClosures() pulls the referenced node into the same matrix,
    // which lets us stamp a derivative against it.  they carry no current and aren't drawn.
    getRefNodeCount(): number { return 0; }

    // resolve the names our expression refers to, filling in our reference nodes.  called
    // from makeNodeList() once every element's posts have nodes, and before the matrices
    // are partitioned.  unresolved names are left as ground.
    resolveExprRefs(_elmList: CircuitElm[]): void { }

    // the name by which an expression can refer to this element, or null if it has none
    getExprRefName(): string | null { return null; }

    // index in nodes[] where our reference nodes start, after the posts and internal nodes
    getRefNodeBase(): number {
        return this.getPostCount() + this.getInternalNodeCount();
    }

    // is node index n one of our reference nodes (rather than a post or internal node)?
    // referring to a node by name doesn't connect us to it, so the connectivity passes
    // have to leave these out even though they're in nodes[].
    isRefNode(n: number): boolean { return n >= this.getRefNodeBase(); }

    getNodeCount(): number {
        return this.getPostCount() + this.getInternalNodeCount() + this.getRefNodeCount();
    }

    // notify this element that its pth node is n.
    setNode(p: number, n: CircuitNode): void {
	// a reference node is one we only observe, so don't push our stale voltage onto it
	if (this.isRefNode(p)) {
	    this.nodes[p] = n;
	    return;
	}
	let v = 0;

	// preserve voltages if possible
	if (this.nodes[p] !== undefined)
	    v = this.nodes[p].v;
	this.nodes[p] = n;
	if (v != 0 && this.nodes[p].index > 0)
	    this.nodes[p].v = v;
    }

    // notify this element that its nth voltage source is v.  This value v can be passed to stampVoltageSource(), etc and will be passed back in calls to setCurrent()
    setVoltageSource(n: number, v: VoltageSource): void {
        // default implementation only makes sense for subclasses with one voltage source.  If we have 0 this isn't used, if we have >1 this won't work
        this.voltSource = v;
    }

//    getVoltageSource(): number { return voltSource; } // Never used except for debug code which is commented out

    getVoltageDiff(): number {
        return this.nodes[0].v - this.nodes[1].v;
    }

    nonLinear(): boolean { return false; }
    getPostCount(): number { return 2; }
    getPostWidth(n: number): number { return 1; }
    getBusWidth(): number { return 1; }

    // generate WireSegment entries for this wire-like element (called during calculateWireClosureForList)
    getWireSegments(list: InstanceType<typeof SimulationManager.WireSegment>[]): void {
        const bw = this.getBusWidth();
        for (let b = 0; b < bw; b++) {
            const p0 = this.getPost(b);
            const p1 = this.getConnectedPost(b);
            const ep0 = SimulationManager.pointKey(p0!);
            const ep1 = (p1 != null && !p1.equals(p0)) ? SimulationManager.pointKey(p1) : null;
            list.push(new SimulationManager.WireSegment(this, b, ep0, ep1));
        }
    }

    // get CircuitNode for nth node
    getNode(n: number): CircuitNode { return this.nodes[n]; }

    // get position of nth node
    getPost(n: number): Point | null {
        return (n === 0) ? this.point1 : (n === 1) ? this.point2 : null;
    }

    // return post we're connected to (for wires, so we can optimize them out in calculateWireClosure())
    // return the post that post n connects through to (for bus wires, each bit connects to its counterpart)
    getConnectedPost(n?: number): Point {
        return this.point2;
    }

    getNodeAtPoint(pt: Point): number {
        for (let i = 0; i !== this.getPostCount(); i++) {
            if (this.getPost(i)!.equals(pt))
                return i;
        }
        return 0;
    }

    /*
    drawPost(g: Graphics, x0: number, y0: number, n: number): void {
        if (!this.isCreating() && !this.needsHighlight() &&
            app.getCircuitNode(n).links.size() == 2)
            return;
        if (app.mouse.mouseMode == MouseManager.MODE_DRAG_ROW ||
            app.mouse.mouseMode == MouseManager.MODE_DRAG_COLUMN)
            return;
        this.drawPost(g, x0, y0);
    }
    */
    static drawPost(g: Graphics, pt: Point): void {
        g.setColor(CircuitElm.whiteColor);
        g.fillOval(pt.x-3, pt.y-3, 7, 7);
    }

    // set/adjust bounding box used for selecting elements.  getCircuitBounds() does not use this!
    setBbox(x1: number, y1: number, x2: number, y2: number): void;
    // set bounding box for an element from p1 to p2 with width w
    setBbox(p1: Point, p2: Point, w: number): void;
    setBbox(x1OrP1: number | Point, y1OrP2: number | Point, x2OrW: number, y2?: number): void {
        if (x1OrP1 instanceof Point) {
            const p1 = x1OrP1, p2 = y1OrP2 as Point, w = x2OrW;
            this.setBbox(p1.x, p1.y, p2.x, p2.y);
            const dpx = Math.trunc(this.dpx1 * w);
            const dpy = Math.trunc(this.dpy1 * w);
            this.adjustBbox(p1.x+dpx, p1.y+dpy, p1.x-dpx, p1.y-dpy);
        } else {
            let x1 = x1OrP1, y1 = y1OrP2 as number, x2 = x2OrW;
            if (x1 > x2) { const q = x1; x1 = x2; x2 = q; }
            if (y1 > y2!) { const q = y1; y1 = y2!; y2 = q; }
            this.boundingBox.setBounds(x1, y1, x2-x1+1, y2!-y1+1);
        }
    }

    // enlarge bbox to contain an additional rectangle
    adjustBbox(x1: number, y1: number, x2: number, y2: number): void;
    adjustBbox(p1: Point, p2: Point): void;
    adjustBbox(x1OrP1: number | Point, y1OrP2: number | Point, x2?: number, y2?: number): void {
        if (x1OrP1 instanceof Point) {
            this.adjustBbox(x1OrP1.x, x1OrP1.y, (y1OrP2 as Point).x, (y1OrP2 as Point).y);
            return;
        }
        let x1 = x1OrP1, y1 = y1OrP2 as number;
        if (x1 > x2!) { const q = x1; x1 = x2!; x2 = q; }
        if (y1 > y2!) { const q = y1; y1 = y2!; y2 = q; }
        x1 = CircuitElm.min(this.boundingBox.x, x1);
        y1 = CircuitElm.min(this.boundingBox.y, y1);
        x2 = CircuitElm.max(this.boundingBox.x + this.boundingBox.width, x2!);
        y2 = CircuitElm.max(this.boundingBox.y + this.boundingBox.height, y2!);
        this.boundingBox.setBounds(x1, y1, x2-x1, y2-y1);
    }

    // needed for calculating circuit bounds (need to special-case centered text elements)
    isCenteredText(): boolean { return false; }

    drawCenteredText(g: Graphics, s: string, x: number, y: number, cx: boolean): void {
        // FontMetrics fm = g.getFontMetrics();
        //int w = fm.stringWidth(s);
//      int w=0;
//      if (cx)
//          x -= w/2;
//      g.drawString(s, x, y+fm.getAscent()/2);
//      adjustBbox(x, y-fm.getAscent()/2,
//                 x+w, y+fm.getAscent()/2+fm.getDescent());
        const w = Math.trunc(g.context.measureText(s).width);
        const h2 = Math.trunc(g.currentFontSize) / 2;
        g.save();
        g.context.textBaseline = "middle";
        if (cx) {
            g.context.textAlign = "center";
            this.adjustBbox(x-w/2, y-h2, x+w/2, y+h2);
        } else {
            this.adjustBbox(x, y-h2, x+w, y+h2);
        }

        if (cx)
            g.context.textAlign = "center";
        g.drawString(s, x, y);
        g.restore();
    }

    // draw component values (number of resistor ohms, etc).  hs = offset
    drawValues(g: Graphics, s: string, hs: number): void {
        if (s == null)
            return;
        g.save();
        g.setFont(CircuitElm.valueFont);
        //FontMetrics fm = g.getFontMetrics();
        const w = Math.trunc(g.context.measureText(s).width);
        g.setColor(CircuitElm.whiteColor);
        const ya = Math.trunc(g.currentFontSize) / 2;
        let xc: number, yc: number;
        if (this.isRailElm() || this.isSweepElm()) {
            xc = this.x2;
            yc = this.y2;
        } else {
            xc = (this.x2 + this.x) / 2;
            yc = (this.y2 + this.y) / 2;
        }
        const dpx = Math.trunc(this.dpx1 * hs);
        const dpy = Math.trunc(this.dpy1 * hs);
        if (dpx === 0)
            g.drawString(s, xc - w/2, yc - CircuitElm.abs(dpy) - 2);
        else {
            let xx = xc + CircuitElm.abs(dpx) + 2;
            if (this.isVoltageElm() || (this.x < this.x2 && this.y > this.y2))
                xx = xc - (w + CircuitElm.abs(dpx) + 2);
            g.drawString(s, xx, yc + dpy + ya);
        }
        g.restore();
    }

    drawLabeledNode(g: Graphics, str: string, pt1: Point, pt2: Point): void {
        g.save();
        g.setFont(CircuitElm.valueFont);
        let lineOver = false;
        if (str.startsWith("/")) {
            lineOver = true;
            str = str.substring(1);
        }
        const w = Math.trunc(g.context.measureText(str).width);
        const h = Math.trunc(g.currentFontSize);
        g.context.textBaseline = "middle";
        let x = pt2.x, y = pt2.y;
        if (pt1.y !== pt2.y) {
            x -= w/2;
            y += CircuitElm.sign(pt2.y - pt1.y) * h;
        } else {
            if (pt2.x > pt1.x)
                x += 4;
            else
                x -= 4 + w;
        }
        g.drawString(str, x, y);
        this.adjustBbox(x, y-h/2, x+w, y+h/2);
        g.restore();
        if (lineOver) {
            const ya = y - h/2 - 1;
            g.drawLine(x, ya, x+w, ya);
        }
    }

    drawCoil(g: Graphics, hs: number, p1: Point, p2: Point, v1: number, v2: number): void {
        const len = CircuitElm.distance(p1, p2);

        g.save();
        g.context.lineWidth = 3.0;
        g.context.transform(((p2.x-p1.x))/len, ((p2.y-p1.y))/len,
                -((p2.y-p1.y))/len, ((p2.x-p1.x))/len, p1.x, p1.y);
        if (CircuitElm.app.menus.voltsCheckItem.getState()) {
            const grad = g.context.createLinearGradient(0, 0, len, 0);
            grad.addColorStop(0, this.getVoltageColor(g, v1).getHexValue());
            grad.addColorStop(1.0, this.getVoltageColor(g, v2).getHexValue());
            g.context.strokeStyle = grad;
        }
        g.context.lineCap = "round";
        g.context.scale(1, hs > 0 ? 1 : -1);

        // draw more loops for a longer coil
        const loopCt = Math.ceil(len / 11);
        for (let loop = 0; loop !== loopCt; loop++) {
            g.context.beginPath();
            const start = len * loop / loopCt;
            g.context.moveTo(start, 0);
            g.context.arc(len*(loop+.5)/loopCt, 0, len/(2*loopCt), Math.PI, Math.PI*2);
            g.context.lineTo(len*(loop+1)/loopCt, 0);
            g.context.stroke();
        }

        g.restore();
    }

    static drawThickLine(g: Graphics, x: number, y: number, x2: number, y2: number): void;
    static drawThickLine(g: Graphics, pa: Point, pb: Point): void;
    static drawThickLine(g: Graphics, pa: Point, pb: Point, width: number): void;
    static drawThickLine(g: Graphics, xOrPa: number | Point, yOrPb: number | Point, x2OrWidth?: number, y2?: number): void {
        if (typeof xOrPa === "number") {
            g.setLineWidth(3.0);
            g.drawLine(xOrPa, yOrPb as number, x2OrWidth!, y2!);
            g.setLineWidth(1.0);
        } else if (x2OrWidth === undefined) {
            CircuitElm.drawThickLine(g, xOrPa, yOrPb as Point, 3);
        } else {
            g.setLineWidth(x2OrWidth);
            g.drawLine(xOrPa, yOrPb as Point);
            g.setLineWidth(1.0);
        }
    }

    static drawThickPolygon(g: Graphics, xs: number[], ys: number[], c: number): void;
    static drawThickPolygon(g: Graphics, p: Polygon): void;
    static drawThickPolygon(g: Graphics, xsOrP: number[] | Polygon, ys?: number[], c?: number): void {
        if (xsOrP instanceof Polygon) {
            CircuitElm.drawThickPolygon(g, xsOrP.xpoints, xsOrP.ypoints, xsOrP.npoints);
        } else {
//          int i;
//          for (i = 0; i != c-1; i++)
//              drawThickLine(g, xs[i], ys[i], xs[i+1], ys[i+1]);
//          drawThickLine(g, xs[i], ys[i], xs[0], ys[0]);
            g.setLineWidth(3.0);
            g.drawPolyline(xsOrP, ys!, c!);
            g.setLineWidth(1.0);
        }
    }

    static drawPolygon(g: Graphics, p: Polygon): void {
        g.drawPolyline(p.xpoints, p.ypoints, p.npoints);
/*      int i;
        int xs[] = p.xpoints;
        int ys[] = p.ypoints;
        int np = p.npoints;
        np -= 3;
        for (i = 0; i != np-1; i++)
            g.drawLine(xs[i], ys[i], xs[i+1], ys[i+1]);
        g.drawLine(xs[i], ys[i], xs[0], ys[0]);*/
    }

    static drawThickCircle(g: Graphics, cx: number, cy: number, ri: number): void {
        g.setLineWidth(3.0);
        g.context.beginPath();
        g.context.arc(cx, cy, ri*.98, 0, 2*Math.PI);
        g.context.stroke();
        g.setLineWidth(1.0);
    }

    getSchmittPolygon(gsize: number, ctr: number): Polygon {
        const pts = this.newPointArray(6);
        const hs = 3*gsize;
        const h1 = 3*gsize;
        const h2 = h1*2;
        const len = CircuitElm.distance(this.lead1!, this.lead2!);
        pts[0] = this.interpPoint(this.lead1!, this.lead2!, ctr-h2/len, hs) as Point;
        pts[1] = this.interpPoint(this.lead1!, this.lead2!, ctr+h1/len, hs) as Point;
        pts[2] = this.interpPoint(this.lead1!, this.lead2!, ctr+h1/len, -hs) as Point;
        pts[3] = this.interpPoint(this.lead1!, this.lead2!, ctr+h2/len, -hs) as Point;
        pts[4] = this.interpPoint(this.lead1!, this.lead2!, ctr-h1/len, -hs) as Point;
        pts[5] = this.interpPoint(this.lead1!, this.lead2!, ctr-h1/len, hs) as Point;
        return this.createPolygon(pts);
    }

    static getVoltageDText(v: number): string {
        return CircuitElm.getUnitText(Math.abs(v), "V");
    }

    static getVoltageText(v: number): string {
        return CircuitElm.getUnitText(v, "V");
    }

    static getTimeText(v: number): string {
        if (v >= 60) {
            const h = Math.floor(v/3600);
            v -= 3600*h;
            const m = Math.floor(v/60);
            v -= 60*m;
            if (h === 0)
                return m + ":" + ((v >= 10) ? "" : "0") + CircuitElm.showFormat.format(v);
            return h + ":" + ((m >= 10) ? "" : "0") + m + ":" + ((v >= 10) ? "" : "0") + CircuitElm.showFormat.format(v);
        }
        return CircuitElm.getUnitText(v, "s");
    }

    static format(v: number, sf: boolean): string {
//      if (sf && Math.abs(v) > 10)
//          return shortFormat.format(Math.round(v));
        return (sf ? CircuitElm.shortFormat : CircuitElm.showFormat).format(v);
    }

    static getUnitText(v: number, u: string): string {
        return CircuitElm.getUnitTextImpl(v, u, false);
    }

    static getShortUnitText(v: number, u: string): string {
        return CircuitElm.getUnitTextImpl(v, u, true);
    }

    private static getUnitTextImpl(v: number, u: string, sf: boolean): string {
        const sp = sf ? "" : " ";
        const va = Math.abs(v);
        if (va < 1e-14)
            // this used to return null, but then wires would display "null" with 0V
            return "0" + sp + u;
        if (va < 1e-9)
            return CircuitElm.format(v*1e12, sf) + sp + "p" + u;
        if (va < 1e-6)
            return CircuitElm.format(v*1e9, sf) + sp + "n" + u;
        if (va < 1e-3)
            return CircuitElm.format(v*1e6, sf) + sp + Locale.muString + u;
        if (va < 1)
            return CircuitElm.format(v*1e3, sf) + sp + "m" + u;
        if (va < 1e3)
            return CircuitElm.format(v, sf) + sp + u;
        if (va < 1e6)
            return CircuitElm.format(v*1e-3, sf) + sp + "k" + u;
        if (va < 1e9)
            return CircuitElm.format(v*1e-6, sf) + sp + "M" + u;
        if (va < 1e12)
            return CircuitElm.format(v*1e-9, sf) + sp + "G" + u;
        return NumberFormat.getFormat("#.##E000").format(v) + sp + u;
    }

    static getCurrentText(i: number): string {
        return CircuitElm.getUnitText(i, "A");
    }

    static getCurrentDText(i: number): string {
        return CircuitElm.getUnitText(Math.abs(i), "A");
    }

    static getUnitTextWithScale(val: number, utext: string, scale: number, fixed?: boolean): string {
        fixed = fixed ?? false;
        if (Math.abs(val) > 1e12)
            return CircuitElm.getUnitText(val, utext);
        const nf = fixed ? CircuitElm.fixedFormat : CircuitElm.showFormat;
        if (scale === CircuitElm.SCALE_1)
            return nf.format(val) + " " + utext;
        if (scale === CircuitElm.SCALE_M)
            return nf.format(1e3*val) + " m" + utext;
        if (scale === CircuitElm.SCALE_MU)
            return nf.format(1e6*val) + " " + Locale.muString + utext;
        return CircuitElm.getUnitText(val, utext);
    }

    // update dot positions (curcount) for drawing current (simple case for single current)
    updateDotCount(): void {
        this.curcount = this.updateDotCountImpl(this.current, this.curcount);
    }

    // update dot positions (curcount) for drawing current (general case for multiple currents)
    updateDotCountImpl(cur: number, cc: number): number {
        if (!CircuitElm.app.simIsRunning())
            return cc;
        const cadd = cur * CircuitElm.currentMult;
        if (cadd > 6 || cadd < -6)
            return this.CURRENT_TOO_FAST;
        if (cc === this.CURRENT_TOO_FAST)
            cc = 0;
        return cc + (cadd % 8);
    }

    // update and draw current for simple two-terminal element
    doDots(g: Graphics): void {
        this.updateDotCount();
        if (!this.isCreating())
            this.drawDots(g, this.point1, this.point2, this.curcount);
    }

    doAdjust(): void {}
    setupAdjust(): void {}

    // get component info for display in lower right
    getInfo(arr: string[]): void {}

    // get element type name for edit dialog title.  override if getInfo()[0] includes dynamic state.
    getElmType(): string {
        const info: string[] = new Array(10);
        this.getInfo(info);
        return info[0];
    }

    getBasicInfo(arr: string[]): number {
        arr[1] = "I = " + CircuitElm.getCurrentDText(this.getCurrent());
        arr[2] = "Vd = " + CircuitElm.getVoltageDText(this.getVoltageDiff());
        return 3;
    }

    getScopeText(v: number): string {
        const info: string[] = new Array(10);
        this.getInfo(info);
        return info[0];
    }

    getVoltageColor(g: Graphics, volts: number): Color {
        if (this.needsHighlight()) {
            return CircuitElm.selectColor;
        }
        if (!CircuitElm.app.menus.voltsCheckItem.getState()) {
            return CircuitElm.whiteColor;
        }
        if (isNaN(volts))
            volts = 0;
        let c = Math.trunc((volts + CircuitElm.voltageRange) * (CircuitElm.colorScaleCount-1) /
                           (CircuitElm.voltageRange*2));
        if (c < 0)
            c = 0;
        if (c >= CircuitElm.colorScaleCount)
            c = CircuitElm.colorScaleCount - 1;
        return CircuitElm.colorScale[c];
    }

    setVoltageColor(g: Graphics, volts: number): void {
        g.setColor(this.getVoltageColor(g, volts));
    }

    // yellow argument is unused, can't remember why it was there
    setPowerColor(g: Graphics, yellow: boolean): void;
    setPowerColor(g: Graphics, w0: number): void;
    setPowerColor(g: Graphics, yellowOrW0: boolean | number): void {
        /*if (conductanceCheckItem.getState()) {
          setConductanceColor(g, current/getVoltageDiff());
          return;
          }*/
        if (typeof yellowOrW0 === "boolean") {
            if (!this.showPower())
                return;
            this.setPowerColor(g, this.getPower());
        } else {
            if (!this.showPower())
                return;
            if (this.needsHighlight()) {
                g.setColor(CircuitElm.selectColor);
                return;
            }
            const w0 = yellowOrW0 * CircuitElm.powerMult;
            //System.out.println(w);
            let i = Math.trunc((CircuitElm.colorScaleCount/2) + (CircuitElm.colorScaleCount/2) * -w0);
            if (i < 0)
                i = 0;
            if (i >= CircuitElm.colorScaleCount)
                i = CircuitElm.colorScaleCount - 1;
            g.setColor(CircuitElm.colorScale[i]);
        }
    }

    setConductanceColor(g: Graphics, w0: number): void {
        w0 *= CircuitElm.powerMult;
        //System.out.println(w);
        const w = (w0 < 0) ? -w0 : w0;
        const wClamped = w > 1 ? 1 : w;
        const rg = Math.trunc(wClamped * 255);
        g.setColor(new Color(rg, rg, rg));
    }

    getPower(): number { return this.getVoltageDiff() * this.current; }

    getScopeValue(x: number): number {
        return (x === Scope.VAL_CURRENT) ? this.getCurrent() :
            (x === Scope.VAL_POWER) ? this.getPower() : this.getVoltageDiff();
    }

    getScopeUnits(x: number): number {
        return (x === Scope.VAL_CURRENT) ? Scope.UNITS_A :
            (x === Scope.VAL_POWER) ? Scope.UNITS_W : Scope.UNITS_V;
    }

    getEditInfo(n: number): EditInfo | null { return null; }
    setEditValue(n: number, ei: EditInfo): void {}

    // are n1 and n2 connected by this element?  this is used to determine
    // unconnected nodes, and look for loops
    getConnection(n1: number, n2: number): boolean { return true; }

    // are n1 and n2 in the same matrix?  by default same as getConnection(), but
    // can be overridden for elements like MOSFETs where the gate affects drain/source
    // but isn't electrically connected.  n1 and n2 may be internal nodes.
    getMatrixConnection(n1: number, n2: number): boolean { return this.getConnection(n1, n2); }

    // is n1 connected to ground somehow?
    hasGroundConnection(n1: number): boolean { return false; }

    // is this a wire or equivalent to a wire?  (used for circuit validation)
    isWireEquivalent(): boolean { return false; }

    // is this a wire we can remove?
    isRemovableWire(): boolean { return false; }

    isIdealCapacitor(): boolean { return false; }
    isExtVoltageElm(): boolean { return false; }
    isVoltageElm(): boolean { return false; }
    isBatteryElm(): boolean { return false; }
    isRailElm(): boolean { return false; }
    isSweepElm(): boolean { return false; }
    isCurrentElm(): boolean { return false; }
    isGroundElm(): boolean { return false; }
    isInductorElm(): boolean { return false; }

    canViewInScope(): boolean { return this.getPostCount() <= 2; }
    canFlipX(): boolean { return true; }
    canFlipY(): boolean { return true; }
    canFlipXY(): boolean { return this.canFlipX() || this.canFlipY(); }

    comparePair(x1: number, x2: number, y1: number, y2: number): boolean {
        return ((x1 === y1 && x2 === y2) || (x1 === y2 && x2 === y1));
    }

    needsHighlight(): boolean {
        return CircuitElm.mouseElmRef === this || this.selected || CircuitElm.app.mouse.scopePlotRoles.has(this) ||
            // Test if the current mouseElm is a ScopeElm and, if so, does it belong to this elm
            (CircuitElm.mouseElmRef !== null && CircuitElm.mouseElmRef.isScopeElm() &&
             (CircuitElm.mouseElmRef as any).elmScope != null &&
             (CircuitElm.mouseElmRef as any).elmScope.getElm() === this) ||
            this.isOnHighlightedNet();
    }

    isOnHighlightedNet(): boolean {
        if (CircuitElm.app.mouse.highlightedNode == null)
            return false;
        for (let i = 0; i !== this.getPostCount(); i++)
            if (this.nodes[i] === CircuitElm.app.mouse.highlightedNode)
                return true;
        return false;
    }

    isCreating(): boolean { return CircuitElm.app.mouse.dragElm === this; }
    isSelected(): boolean { return this.selected; }
    canShowValueInScope(v: number): boolean { return false; }
    setSelected(x: boolean): void { this.selected = x; }

    selectRect(r: Rectangle, add: boolean): void {
        if (r.intersects(this.boundingBox))
            this.selected = true;
        else if (!add)
            this.selected = false;
    }

    static abs(x: number): number { return x < 0 ? -x : x; }
    static sign(x: number): number { return (x < 0) ? -1 : (x === 0) ? 0 : 1; }
    static min(a: number, b: number): number { return (a < b) ? a : b; }
    static max(a: number, b: number): number { return (a > b) ? a : b; }

    static distance(p1: Point, p2: Point): number {
        const x = p1.x - p2.x;
        const y = p1.y - p2.y;
        return Math.sqrt(x*x + y*y);
    }

    getBoundingBox(): Rectangle { return this.boundingBox; }
    needsShortcut(): boolean { return this.getShortcut() > 0; }
    getShortcut(): number { return 0; }
    showValues(): boolean { return CircuitElm.app.menus.showValuesCheckItem.getState(); }
    showPower(): boolean { return CircuitElm.app.menus.powerCheckItem.getState(); }
    showEuroResistors(): boolean { return CircuitElm.app.menus.euroResistorCheckItem.getState(); }
    showOhmSymbol(): boolean { return CircuitElm.app.menus.showOhmCheckItem.getState(); }
    useSmallGrid(): boolean { return CircuitElm.app.menus.smallGridCheckItem.getState(); }
    doDcAnalysis(): boolean { return CircuitElm.app.dcAnalysisFlag; }
    isPrintable(): boolean { return CircuitElm.app.isPrintable(); }

    isWireElm(): boolean { return false; }
    isLabeledNodeElm(): boolean { return false; }
    isBusSplitterElm(): boolean { return false; }
    isScopeElm(): boolean { return false; }
    elmScope: any = null;
    clearElmScope(): void {}
    isGraphicElm(): boolean { return false; }
    isRoutedWireElm(): boolean { return false; }
    isSwitchElm(): boolean { return false; }
    isLogicInputElm(): boolean { return false; }
    isVarRailElm(): boolean { return false; }
    isPotElm(): boolean { return false; }
    isResistorElm(): boolean { return false; }
    isCapacitorElm(): boolean { return false; }
    isSubcircuitElm(): boolean { return false; }
    isTransistorElm(): boolean { return false; }
    isMosfetElm(): boolean { return false; }
    isJfetElm(): boolean { return false; }
    isOutputElm(): boolean { return false; }
    isLogicOutputElm(): boolean { return false; }
    isAudioOutputElm(): boolean { return false; }
    isTestPointElm(): boolean { return false; }
    isProbeElm(): boolean { return false; }

    validate(): boolean { return true; }

    validateRailNode(n: number): boolean {
        const fpi = new FindPathInfo(FindPathInfo.VOLTAGE, this, this.getNode(n), CircuitElm.sim);
        if (fpi.findPath(CircuitNode.ground)) {
            CircuitElm.sim.stop("Path to ground with no resistance!", this);
            return false;
        }
        return true;
    }

    setMouseElm(v: boolean): void {
        if (v)
            CircuitElm.mouseElmRef = this;
        else if (CircuitElm.mouseElmRef === this)
            CircuitElm.mouseElmRef = null;
    }

    draggingDone(): void {}

    lineDistanceSq(xa: number, ya: number, xb: number, yb: number, gx: number, gy: number): number {
        const dtop = (yb-ya)*gx - (xb-xa)*gy + xb*ya - yb*xa;
        const dbot = (yb-ya)*(yb-ya) + (xb-xa)*(xb-xa);
        return dtop*dtop / dbot;
    }

    getMouseDistance(gx: number, gy: number): number {
        if (this.getPostCount() === 0)
            return Graphics.distanceSq(gx, gy, (this.x2+this.x)/2, (this.y2+this.y)/2);
        return this.lineDistanceSq(this.x, this.y, this.x2, this.y2, gx, gy);
    }

    dumpModel(): string | null { return null; }
    dumpXmlModel(doc: Document): void {}

    isMouseElm(): boolean {
        return CircuitElm.mouseElmRef === this;
    }

    updateModels(): void {}
    stepFinished(): void {}

    // get current flowing into node n out of this element
    getCurrentIntoNode(n: number): number {
        // no current flows into a node we only refer to by name.  this matters for
        // CompositeElm.getCurrentIntoNode(), which sums every link on a node, and our
        // reference links are in that list.
        if (this.isRefNode(n))
            return 0;
        // if we take out the getPostCount() == 2 it gives the wrong value for rails
        if (n === 0 && this.getPostCount() === 2)
            return -this.current;
        else
            return this.current;
    }

    flipPosts(): void {
        const oldx = this.x;
        const oldy = this.y;
        this.x = this.x2;
        this.y = this.y2;
        this.x2 = oldx;
        this.y2 = oldy;
        this.setPoints();
    }

    getClassName(): string { return this.constructor.name; }

    dumpXml(doc: Document, elem: Element): void {
        CircuitXMLSerializer.dumpAttr(elem, "x", this.x + " " + this.y + " " + this.x2 + " " + this.y2);
        //if (flags != 0)   // can't do this because some elements set flags to a nonzero value in constructor
        CircuitXMLSerializer.dumpAttr(elem, "f", this.flags);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.flags = xml.parseIntAttr("f", this.flags);
    }

    dumpXmlState(doc: Document, elem: Element): void {}

    getJsArrayString(): string[] { return []; }

    getInfoJS(): string[] {
        const jsarr = this.getJsArrayString();
        const arr: (string | null)[] = new Array(20).fill(null);
        this.getInfo(arr as string[]);
        for (let i = 0; arr[i] != null; i++)
            jsarr.push(arr[i]!);
        return jsarr;
    }

    getVoltageJS(n: number): number {
        if (n >= this.nodes.length)
            return 0;
        return this.nodes[n].v;
    }

    _jsProxy: Record<string, any> | null = null;

    addJSMethods(): void {
        if (!this._jsProxy)
            this._jsProxy = {};
        const p = this._jsProxy;
        p['getType']        = () => this.getClassName();
        p['getInfo']        = () => this.getInfoJS();
        p['getVoltageDiff'] = () => this.getVoltageDiff();
        p['getVoltage']     = (n: number) => this.getVoltageJS(n);
        p['getCurrent']     = () => this.getCurrent();
        p['getPostCount']   = () => this.getPostCount();
    }

    getJavaScriptObject(): object { return this._jsProxy ?? this; }
}
