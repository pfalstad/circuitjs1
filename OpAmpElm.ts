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
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { Font } from "./Font";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { WireRouter } from "./WireRouter";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class OpAmpElm extends CircuitElm {
    opsize: number;
    opheight: number;
    opwidth: number;
    opaddtext: number;
    maxOut: number;
    minOut: number;
    gain: number;
    gbw: number;
    readonly FLAG_SWAP = 1;
    readonly FLAG_SMALL = 2;
    readonly FLAG_LOWGAIN = 4;
    readonly FLAG_GAIN = 8;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.noDiagonal = true;
            this.maxOut = 15;
            this.minOut = -15;
            this.gbw = 1e6;
            this.flags = this.FLAG_GAIN; // need to do this before setSize()
            this.gain = 100000;
            this.setSize(this.useSmallGrid() ? 1 : 2);
        } else {
            super(xa, ya, xb, yb!, f!);
            this.maxOut = 15;
            this.minOut = -15;
            // GBW has no effect in this version of the simulator, but we
            // retain it to keep the file format the same
            this.gbw = 1e6;
            try {
                this.maxOut = parseFloat(st!.nextToken());
                this.minOut = parseFloat(st!.nextToken());
                this.gbw = parseFloat(st!.nextToken());
                const v0 = parseFloat(st!.nextToken()); // this.volts
                const v1 = parseFloat(st!.nextToken()); // this.volts
                this.gain = parseFloat(st!.nextToken());
            } catch (e) {}
            this.noDiagonal = true;
            this.setSize((f! & this.FLAG_SMALL) !== 0 ? 1 : 2);
            this.setGain();
        }
    }

    setGain(): void {
        if ((this.flags & this.FLAG_GAIN) !== 0)
            return;

        // gain of 100000 breaks e-amp-dfdx.txt
        // gain was 1000, but it broke amp-schmitt.txt
        this.gain = ((this.flags & this.FLAG_LOWGAIN) !== 0) ? 1000 : 100000;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ma", this.maxOut);
        CircuitXMLSerializer.dumpAttr(elem, "mi", this.minOut);
        //CircuitXMLSerializer.dumpAttr(elem, "gb", this.gbw);
        CircuitXMLSerializer.dumpAttr(elem, "ga", this.gain);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.flags = 0; // size might have changed
        super.undumpXml(xml);
        this.maxOut = xml.parseDoubleAttr("ma", this.maxOut);
        this.minOut = xml.parseDoubleAttr("mi", this.minOut);
        //this.gbw = xml.parseDoubleAttr("gb", this.gbw);
        this.gain = xml.parseDoubleAttr("ga", this.gain);
        this.setSize((this.flags & this.FLAG_SMALL) !== 0 ? 1 : 2);
    }

    nonLinear(): boolean { return true; }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.opheight * 2);
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.in1p[0], this.in1p[1]);
        this.setVoltageColor(g, this.nodes[1].v);
        CircuitElm.drawThickLine(g, this.in2p[0], this.in2p[1]);
        this.setVoltageColor(g, this.nodes[2].v);
        CircuitElm.drawThickLine(g, this.lead2!, this.point2);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        this.setPowerColor(g, true);
        CircuitElm.drawThickPolygon(g, this.triangle);
        g.setFont(this.plusFont);
        this.drawCenteredText(g, "-", this.textp[0].x, this.textp[0].y - 2, true);
        this.drawCenteredText(g, "+", this.textp[1].x, this.textp[1].y, true);
        this.curcount = this.updateDotCountImpl(this.current, this.curcount);
        this.drawDots(g, this.point2, this.lead2!, this.curcount);
        this.drawPosts(g);
    }

    getPower(): number { return this.nodes[2].v * this.current; }

    in1p: Point[];
    in2p: Point[];
    textp: Point[];
    triangle: Polygon;
    plusFont: Font;

    setSize(s: number): void {
        this.opsize = s;
        this.opheight = 8 * s;
        this.opwidth = 13 * s;
        this.flags = (this.flags & ~this.FLAG_SMALL) | ((s === 1) ? this.FLAG_SMALL : 0);
    }

    setPoints(): void {
        super.setPoints();
        if (this.dn > 150 && this.isCreating())
            this.setSize(2);
        let ww = this.opwidth;
        if (ww > this.dn / 2)
            ww = Math.floor(this.dn / 2);
        this.calcLeads(ww * 2);
        const hs = this.opheight * this.dsign;
        const hsSwapped = ((this.flags & this.FLAG_SWAP) !== 0) ? -hs : hs;
        this.in1p = this.newPointArray(2);
        this.in2p = this.newPointArray(2);
        this.textp = this.newPointArray(2);
        this.interpPoint2(this.point1, this.point2, this.in1p[0],  this.in2p[0],  0, hsSwapped);
        this.interpPoint2(this.lead1!, this.lead2!, this.in1p[1],  this.in2p[1],  0, hsSwapped);
        this.interpPoint2(this.lead1!, this.lead2!, this.textp[0], this.textp[1], .2, hsSwapped);
        const tris = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, tris[0], tris[1], 0, hsSwapped * 2);
        this.triangle = this.createPolygon(tris[0], tris[1], this.lead2!);
        this.plusFont = new Font("SansSerif", 0, this.opsize === 2 ? 14 : 10);
    }

    getPostCount(): number { return 3; }

    getPost(n: number): Point {
        return (n === 0) ? this.in1p[0] : (n === 1) ? this.in2p[0] : this.point2;
    }

    getVoltageSourceCount(): number { return 1; }

    getInfo(arr: string[]): void {
        arr[0] = "op-amp";
        arr[1] = "V+ = " + CircuitElm.getVoltageText(this.nodes[1].v);
        arr[2] = "V- = " + CircuitElm.getVoltageText(this.nodes[0].v);
        // sometimes the voltage goes slightly outside range, to make
        // convergence easier.  so we hide that here.
        const vo = Math.max(Math.min(this.nodes[2].v, this.maxOut), this.minOut);
        arr[3] = "Vout = " + CircuitElm.getVoltageText(vo);
        arr[4] = "Iout = " + CircuitElm.getCurrentText(-this.current);
        arr[5] = "range = " + CircuitElm.getVoltageText(this.minOut) + " to " +
            CircuitElm.getVoltageText(this.maxOut);
    }

    lastvd: number = 0;

    stamp(): void {
        CircuitElm.sim.stampNonLinearVS(this.voltSource!);
        CircuitElm.sim.stampMatrixVN(this.nodes[2], this.voltSource!, 1);
    }

    doStep(): void {
        const vd = this.nodes[1].v - this.nodes[0].v;
        const midpoint = (this.maxOut + this.minOut) * .5;
        if (Math.abs(this.lastvd - vd) > .1)
            CircuitElm.sim.converged = false;
        else if (this.nodes[2].v > this.maxOut + .1 || this.nodes[2].v < this.minOut - .1)
            CircuitElm.sim.converged = false;
        let x = 0;
        let dx = 0;
        const maxAdj = this.maxOut - midpoint;
        const minAdj = this.minOut - midpoint;
        if (vd >= maxAdj / this.gain && (this.lastvd >= 0 || CircuitElm.app.getrand(4) === 1)) {
            dx = 1e-4;
            x = this.maxOut - dx * maxAdj / this.gain;
        } else if (vd <= minAdj / this.gain && (this.lastvd <= 0 || CircuitElm.app.getrand(4) === 1)) {
            dx = 1e-4;
            x = this.minOut - dx * minAdj / this.gain;
        } else {
            dx = this.gain;
            x = midpoint;
        }
        //System.out.println("opamp " + vd + " " + volts[2] + " " + dx + " "  + x + " " + lastvd + " " + sim.converged);

        // newton-raphson
        CircuitElm.sim.stampMatrixNV(this.voltSource!, this.nodes[0], dx);
        CircuitElm.sim.stampMatrixNV(this.voltSource!, this.nodes[1], -dx);
        CircuitElm.sim.stampMatrixNV(this.voltSource!, this.nodes[2], 1);
        CircuitElm.sim.stampRightSideVS(this.voltSource!, x);

        this.lastvd = vd;
    }

    // there is no current path through the op-amp inputs, but there
    // is an indirect path through the output to ground.
    validate(): boolean { return this.validateRailNode(2); }
    getConnection(n1: number, n2: number): boolean { return false; }
    getMatrixConnection(n1: number, n2: number): boolean { return true; }
    hasGroundConnection(n1: number): boolean { return (n1 === 2); }
    getVoltageDiff(): number { return this.nodes[2].v - this.nodes[1].v; }
    getDumpType(): number { return 'a'.charCodeAt(0); }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Max Output (V)", this.maxOut, 1, 20);
        if (n === 1)
            return new EditInfo("Min Output (V)", this.minOut, -20, 0);
        if (n === 2)
            return new EditInfo("Gain", this.gain, 10, 1000000).setPositive();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.maxOut = ei.value;
        if (n === 1)
            this.minOut = ei.value;
        if (n === 2)
            this.gain = ei.value;
    }

    getShortcut(): number { return 'a'.charCodeAt(0); }

    getCurrentIntoNode(n: number): number {
        if (n === 2)
            return -this.current;
        return 0;
    }

    flipX(c2: number, count: number): void {
        if (this.dx === 0)
            this.flags ^= this.FLAG_SWAP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        if (this.dy === 0)
            this.flags ^= this.FLAG_SWAP;
        super.flipY(c2, count);
    }

    flipXY(xmy: number, count: number): void {
        this.flags ^= this.FLAG_SWAP;
        super.flipXY(xmy, count);
    }

    addRoutingObstacle(router: WireRouter): void { this.addRoutingObstacleWithLeads(router, this.opwidth); }
}
