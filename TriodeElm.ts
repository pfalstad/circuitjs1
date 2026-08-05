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

import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";

export class TriodeElm extends CircuitElm {
    static readonly FLAG_FLIP     = 1;
    static readonly FLAG_DSIGN_FIX = 2;

    mu: number;
    kg1: number;
    curcountp: number = 0;
    curcountc: number = 0;
    curcountg: number = 0;
    currentp: number = 0;
    currentg: number = 0;
    currentc: number = 0;
    readonly gridCurrentR = 6000;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.mu  = 93;
            this.kg1 = 680;
            this.flags |= TriodeElm.FLAG_DSIGN_FIX;
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.mu  = parseFloat(st!.nextToken());
            this.kg1 = parseFloat(st!.nextToken());
        }
        this.setup();
    }

    setup(): void {
        this.noDiagonal = true;
    }

    nonLinear(): boolean { return true; }

    reset(): void {
        this.curcount = 0;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "mu", this.mu);
        CircuitXMLSerializer.dumpAttr(elem, "kg", this.kg1);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.mu  = xml.parseDoubleAttr("mu", this.mu);
        this.kg1 = xml.parseDoubleAttr("kg", this.kg1);
    }

    getDumpType(): number { return 173; }

    plate!: Point[];
    grid!: Point[];
    cath!: Point[];
    midgrid!: Point;
    midcath!: Point;
    circler: number = 0;

    setPoints(): void {
        super.setPoints();
        const s = ((this.flags & TriodeElm.FLAG_DSIGN_FIX) !== 0) ? this.dsign : 1;
        const flip = ((this.flags & TriodeElm.FLAG_FLIP) !== 0) ? -s : s;
        this.plate = this.newPointArray(4);
        this.grid  = this.newPointArray(8);
        this.cath  = this.newPointArray(4);
        this.grid[0] = this.point1;
        const nearw = 8 * flip;
        this.plate[1] = this.interpPoint(this.point1, this.point2, 1, nearw);
        const farw = 32 * flip;
        this.plate[0] = this.interpPoint(this.point1, this.point2, 1, farw);
        const platew = 18;
        this.interpPoint2(this.point2, this.plate[1], this.plate[2], this.plate[3], 1, platew);

        this.circler = 24;
        this.grid[1] = this.interpPoint(this.point1, this.point2, (this.dn - this.circler) / this.dn, 0);
        for (let i = 0; i !== 3; i++) {
            this.grid[2 + i * 2] = this.interpPoint(this.grid[1], this.point2, (i * 3 + 1) / 4.5, 0);
            this.grid[3 + i * 2] = this.interpPoint(this.grid[1], this.point2, (i * 3 + 2) / 4.5, 0);
        }
        this.midgrid = this.point2;

        const cathw = 16 * flip;
        this.midcath = this.interpPoint(this.point1, this.point2, 1, -nearw);
        this.interpPoint2(this.point2, this.plate[1], this.cath[1], this.cath[2], -1, cathw);
        this.cath[3] = this.interpPoint(this.point2, this.plate[1], -1.2, -cathw);
        this.cath[0] = this.interpPoint(this.point2, this.plate[1], -farw / nearw, cathw);
    }

    draw(g: Graphics): void {
        g.setColor("#888888");
        CircuitElm.drawThickCircle(g, this.point2.x, this.point2.y, this.circler);
        this.setBbox(this.point1, this.plate[0], 16);
        this.adjustBbox(this.cath[0].x, this.cath[1].y, this.point2.x + this.circler, this.point2.y + this.circler);
        // draw plate
        this.setVoltageColor(g, this.nodes[0].v);
        this.setPowerColor(g, this.currentp * (this.nodes[0].v - this.nodes[2].v));
        CircuitElm.drawThickLine(g, this.plate[0], this.plate[1]);
        CircuitElm.drawThickLine(g, this.plate[2], this.plate[3]);
        // draw grid
        this.setVoltageColor(g, this.nodes[1].v);
        this.setPowerColor(g, this.currentg * (this.nodes[1].v - this.nodes[2].v));
        for (let i = 0; i !== 8; i += 2)
            CircuitElm.drawThickLine(g, this.grid[i], this.grid[i + 1]);
        // draw cathode
        this.setVoltageColor(g, this.nodes[2].v);
        this.setPowerColor(g, 0);
        for (let i = 0; i !== 3; i++)
            CircuitElm.drawThickLine(g, this.cath[i], this.cath[i + 1]);
        // draw dots
        this.curcountp = this.updateDotCountImpl(this.currentp, this.curcountp);
        this.curcountc = this.updateDotCountImpl(this.currentc, this.curcountc);
        this.curcountg = this.updateDotCountImpl(this.currentg, this.curcountg);
        if (!this.isCreating()) {
            this.drawDots(g, this.plate[0], this.midgrid, this.curcountp);
            this.drawDots(g, this.midgrid,  this.midcath, this.curcountc);
            this.drawDots(g, this.midcath,  this.cath[1], this.addCurCount(this.curcountc, 8));
            this.drawDots(g, this.cath[1],  this.cath[0], this.addCurCount(this.curcountc, 8));
            this.drawDots(g, this.point1, this.midgrid, this.curcountg);
        }
        this.drawPosts(g);
    }

    getCurrentIntoNode(n: number): number {
        if (n === 2) return this.currentc;
        if (n === 0) return -this.currentp;
        return -this.currentg;
    }

    getPost(n: number): Point {
        return (n === 0) ? this.plate[0] : (n === 1) ? this.grid[0] : this.cath[0];
    }

    getPostCount(): number { return 3; }

    getPower(): number {
        return (this.nodes[this.plateN].v - this.nodes[this.cathN].v) * this.currentc +
            (this.nodes[this.gridN].v - this.nodes[this.cathN].v) * this.currentg;
    }

    getCurrent(): number { return this.currentc; }

    readonly gridN  = 1;
    readonly cathN  = 2;
    readonly plateN = 0;

    lastv0: number = 0;
    lastv1: number = 0;
    lastv2: number = 0;

    doStep(): void {
        const vs = [this.nodes[0].v, this.nodes[1].v, this.nodes[2].v];
        if (vs[1] > this.lastv1 + .5) vs[1] = this.lastv1 + .5;
        if (vs[1] < this.lastv1 - .5) vs[1] = this.lastv1 - .5;
        if (vs[2] > this.lastv2 + .5) vs[2] = this.lastv2 + .5;
        if (vs[2] < this.lastv2 - .5) vs[2] = this.lastv2 - .5;
        const vgk = vs[this.gridN] - vs[this.cathN];
        const vpk = vs[this.plateN] - vs[this.cathN];
        if (Math.abs(this.lastv0 - vs[0]) > .01 ||
            Math.abs(this.lastv1 - vs[1]) > .01 ||
            Math.abs(this.lastv2 - vs[2]) > .01)
            CircuitElm.sim.converged = false;
        this.lastv0 = vs[0];
        this.lastv1 = vs[1];
        this.lastv2 = vs[2];
        let ids = 0;
        let gm = 0;
        let Gds = 0;
        const ival = vgk + vpk / this.mu;
        this.currentg = 0;
        if (vgk > .01) {
            CircuitElm.sim.stampResistor(this.nodes[this.gridN], this.nodes[this.cathN], this.gridCurrentR);
            this.currentg = vgk / this.gridCurrentR;
        } else
            CircuitElm.sim.stampResistor(this.nodes[this.gridN], this.nodes[this.cathN], 1e8);
        if (ival < 0) {
            Gds = 1e-8;
            ids = vpk * Gds;
        } else {
            ids = Math.pow(ival, 1.5) / this.kg1;
            const q = 1.5 * Math.sqrt(ival) / this.kg1;
            Gds = q;
            gm = q / this.mu;
        }
        this.currentp = ids;
        this.currentc = ids + this.currentg;
        const rs = -ids + Gds * vpk + gm * vgk;
        CircuitElm.sim.stampMatrix(this.nodes[this.plateN], this.nodes[this.plateN],  Gds);
        CircuitElm.sim.stampMatrix(this.nodes[this.plateN], this.nodes[this.cathN],  -Gds - gm);
        CircuitElm.sim.stampMatrix(this.nodes[this.plateN], this.nodes[this.gridN],   gm);
        CircuitElm.sim.stampMatrix(this.nodes[this.cathN],  this.nodes[this.plateN], -Gds);
        CircuitElm.sim.stampMatrix(this.nodes[this.cathN],  this.nodes[this.cathN],   Gds + gm);
        CircuitElm.sim.stampMatrix(this.nodes[this.cathN],  this.nodes[this.gridN],  -gm);
        CircuitElm.sim.stampRightSide(this.nodes[this.plateN],  rs);
        CircuitElm.sim.stampRightSide(this.nodes[this.cathN],  -rs);
    }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[0]);
        CircuitElm.sim.stampNonLinear(this.nodes[1]);
        CircuitElm.sim.stampNonLinear(this.nodes[2]);
    }

    getInfo(arr: string[]): void {
        arr[0] = "triode";
        const vac = this.nodes[this.plateN].v - this.nodes[this.cathN].v;
        const vgc = this.nodes[this.gridN].v  - this.nodes[this.cathN].v;
        const vag = this.nodes[this.plateN].v - this.nodes[this.gridN].v;
        arr[1] = "Vac = " + CircuitElm.getVoltageText(vac);
        arr[2] = "Vgc = " + CircuitElm.getVoltageText(vgc);
        arr[3] = "Vag = " + CircuitElm.getVoltageText(vag);
        arr[4] = "Ic = " + CircuitElm.getUnitText(this.currentc, "A");
        arr[5] = "Ig = " + CircuitElm.getUnitText(this.currentg, "A");
    }

    // grid not connected to other terminals
    getConnection(n1: number, n2: number): boolean { return !(n1 === 1 || n2 === 1); }
    getMatrixConnection(n1: number, n2: number): boolean { return true; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("mu", this.mu, 0, 0).setDimensionless().setPositive();
        if (n === 1)
            return new EditInfo("kg1", this.kg1, 0, 0).setDimensionless().setPositive();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.mu  = ei.value;
        if (n === 1) this.kg1 = ei.value;
    }

    canViewInScope(): boolean { return true; }
    getVoltageDiff(): number { return this.nodes[this.plateN].v - this.nodes[this.cathN].v; }

    flipX(c2: number, count: number): void {
        if (this.x === this.x2)
            this.flags ^= TriodeElm.FLAG_FLIP;
        if ((this.flags & TriodeElm.FLAG_DSIGN_FIX) === 0 && this.x !== this.x2)
            this.flags ^= TriodeElm.FLAG_FLIP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        if (this.y === this.y2)
            this.flags ^= TriodeElm.FLAG_FLIP;
        if ((this.flags & TriodeElm.FLAG_DSIGN_FIX) === 0 && this.y !== this.y2)
            this.flags ^= TriodeElm.FLAG_FLIP;
        super.flipY(c2, count);
    }

    flipXY(xmy: number, count: number): void {
        this.flags ^= TriodeElm.FLAG_FLIP;
        super.flipXY(xmy, count);
    }

}
