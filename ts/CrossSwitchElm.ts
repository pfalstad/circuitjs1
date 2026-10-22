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
import { EditInfo } from "./EditInfo";
import { FindPathInfo } from "./FindPathInfo";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Rectangle } from "./Rectangle";
import { StringTokenizer } from "./StringTokenizer";
import { SwitchElm } from "./SwitchElm";
import { VoltageSource } from "./VoltageSource";

export class CrossSwitchElm extends SwitchElm {
    readonly poleCount = 2;

    constructor(xx: number, yy: number);
    constructor(xx: number, yy: number, mm: boolean);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xbOrMm?: number | boolean, yb?: number, f?: number, st?: StringTokenizer) {
        if (st !== undefined) {
            super(xa, ya, xbOrMm as number, yb!, f!, st);
        } else if (typeof xbOrMm === 'boolean') {
            super(xa, ya, xbOrMm);
        } else {
            super(xa, ya, false);
        }
        this.noDiagonal = true;
        this.allocNodes();
    }

    getDumpType(): number { return 430; }

    readonly openhs = 16;
    readonly posCount = 2;
    poleLeads: Point[];
    throwLeads: Point[];
    polePosts: Point[];
    throwPosts: Point[];
    linePoints: Point[];
    crossPoints: Point[];
    voltageSources: VoltageSource[];
    currents: number[];
    curcounts: number[];

    // voltageSources/currents/curcounts are normally (re)allocated in setPoints(), but elements
    // inside a CompositeElm/subcircuit never get setPoints() called, so allocate lazily here too.
    ensureArrays(): void {
        if (this.voltageSources == null) {
            this.voltageSources = new Array(this.poleCount);
            this.currents = new Array(this.poleCount).fill(0);
            this.curcounts = new Array(this.poleCount).fill(0);
        }
    }

    setPoints(): void {
        super.setPoints();
        this.calcLeads(32);
        this.ensureArrays();
        this.throwPosts  = this.newPointArray(2 * this.poleCount);
        this.throwLeads  = this.newPointArray(4 * this.poleCount);
        this.poleLeads   = this.newPointArray(this.poleCount);
        this.polePosts   = this.newPointArray(this.poleCount);
        this.linePoints  = this.newPointArray(2);
        this.crossPoints = this.newPointArray(6);
        for (let i = 0; i !== this.poleCount; i++) {
            const offset = -i * this.openhs * 3;
            this.interpPoint(this.point1, this.point2, this.polePosts[i],      0, offset);
            this.interpPoint(this.lead1!,  this.lead2!,  this.poleLeads[i],     0, offset);
            this.interpPoint(this.point1, this.point2, this.throwPosts[i*2  ], 1, offset - this.openhs);
            this.interpPoint(this.lead1!,  this.lead2!,  this.throwLeads[i*4  ], 1, offset - this.openhs);
            this.interpPoint(this.point1, this.point2, this.throwPosts[i*2+1], 1, offset + this.openhs);
            this.interpPoint(this.lead1!,  this.lead2!,  this.throwLeads[i*4+1], 1, offset + this.openhs);
            this.interpPoint(this.lead1!,  this.lead2!,  this.throwLeads[i*4+2], 1, offset + this.openhs * 0.33);
            if (this.useIECSymbol())
                this.interpPoint(this.lead1!, this.lead2!, this.throwLeads[i*4+3], 1.2, offset - this.openhs * 0.33);
            else
                this.interpPoint(this.lead1!, this.lead2!, this.throwLeads[i*4+3], 1, offset - this.openhs);
        }
        const dp = 16 / this.dn;
        this.interpPoint(this.point1, this.point2, this.crossPoints[0], 1 + dp,     this.openhs);
        this.interpPoint(this.point1, this.point2, this.crossPoints[1], 1 + dp*2,   this.openhs);
        this.interpPoint(this.point1, this.point2, this.crossPoints[2], 1 + dp*3,   this.openhs);
        this.interpPoint(this.point1, this.point2, this.crossPoints[3], 1 + dp*2,  -this.openhs);
        this.interpPoint(this.point1, this.point2, this.crossPoints[4], 1 + dp,    -this.openhs * 4);
        this.interpPoint(this.point1, this.point2, this.crossPoints[5], 1 + dp*3,  -this.openhs * 4);
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, 1);
        this.adjustBbox(this.crossPoints[2], this.crossPoints[5]);

        this.setVoltageColor(g, this.nodes[1].v);
        CircuitElm.drawThickLine(g, this.crossPoints[1], this.crossPoints[2]);
        CircuitElm.drawThickLine(g, this.crossPoints[1], this.crossPoints[3]);
        CircuitElm.drawThickLine(g, this.crossPoints[3], this.throwPosts[0]);
        CircuitElm.drawThickLine(g, this.throwPosts[0], this.throwPosts[3]);
        this.setVoltageColor(g, this.nodes[3].v);
        CircuitElm.drawThickLine(g, this.throwPosts[2], this.crossPoints[5]);
        CircuitElm.drawThickLine(g, this.throwPosts[1], this.crossPoints[0]);
        CircuitElm.drawThickLine(g, this.crossPoints[0], this.crossPoints[4]);

        for (let i = 0; i !== this.poleCount; i++) {
            this.setVoltageColor(g, this.nodes[i*2].v);
            CircuitElm.drawThickLine(g, this.polePosts[i], this.poleLeads[i]);
            this.setVoltageColor(g, this.nodes[i*2+1].v);
            if (this.useIECSymbol())
                CircuitElm.drawThickLine(g, this.throwLeads[i*4], this.throwLeads[i*4+2]);
            CircuitElm.drawThickLine(g, this.throwPosts[i*2], this.throwLeads[i*4]);
            this.setVoltageColor(g, this.nodes[3 - i*2].v);
            CircuitElm.drawThickLine(g, this.throwPosts[i*2+1], this.throwLeads[i*4+1]);

            if (!this.needsHighlight())
                g.setColor(CircuitElm.lightGrayColor);

            if (i < this.poleCount - 1) {
                const offset = -i * this.openhs * 3;
                const adj = this.position * -3;
                this.interpPoint(this.point1, this.point2, this.linePoints[0], 0.5, offset - this.openhs * (0.5 - this.position) + adj);
                this.interpPoint(this.point1, this.point2, this.linePoints[1], 0.5, offset - this.openhs * 3 - this.openhs * (0.5 - this.position) + 7 + adj);
                g.setLineDash(4, 4);
                g.drawLine(this.linePoints[0], this.linePoints[1]);
                g.setLineDash(0, 0);
            }

            if (!this.needsHighlight())
                g.setColor(CircuitElm.whiteColor);
            CircuitElm.drawThickLine(g, this.poleLeads[i], this.throwLeads[i*4+3-this.position*2]);

            this.curcounts[i] = this.updateDotCountImpl(this.currents[i], this.curcounts[i]);
            this.drawDots(g, this.polePosts[i], this.poleLeads[i], this.curcounts[i]);
            this.drawDots(g, this.throwLeads[i*4+this.position], this.throwPosts[i*2+this.position], this.curcounts[i]);
            if (i === 1 && this.position === 0)
                this.drawDots(g, this.throwPosts[2], this.crossPoints[5], this.curcounts[1]);
            if (i === 0 && this.position === 1) {
                this.drawDots(g, this.throwPosts[1], this.crossPoints[0], this.curcounts[0]);
                this.drawDots(g, this.crossPoints[0], this.crossPoints[4], this.curcounts[0]);
                this.drawDots(g, this.crossPoints[4], this.crossPoints[5], this.curcounts[0]);
            }
            if (i === 1 && this.position === 1)
                this.drawDots(g, this.throwPosts[3], this.throwPosts[0], this.curcounts[1]);
            this.drawDots(g, this.throwPosts[0], this.crossPoints[3], this.curcounts[this.position]);
            this.drawDots(g, this.crossPoints[3], this.crossPoints[1], this.curcounts[this.position]);
            this.drawDots(g, this.crossPoints[1], this.crossPoints[2], this.curcounts[this.position]);
        }

        this.drawPosts(g);
        CircuitElm.drawPost(g, this.throwPosts[0]);
        CircuitElm.drawPost(g, this.crossPoints[4]);
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0 || n === 2) return -this.currents[Math.trunc(n / 2)];
        if (this.position === 0) return this.currents[Math.trunc(n / 2)];
        return this.currents[1 - Math.trunc(n / 2)];
    }

    setCurrent(vs: VoltageSource, c: number): void {
        if (vs === this.voltageSources[0]) this.currents[0] = c;
        else this.currents[1] = c;
    }

    getSwitchRect(): Rectangle {
        return new Rectangle(this.poleLeads[0].x, this.poleLeads[0].y, 0, 0)
            .union(new Rectangle(this.throwLeads[1].x, this.throwLeads[1].y, 0, 0))
            .union(new Rectangle(this.throwLeads[this.poleCount*4-4].x, this.throwLeads[this.poleCount*4-4].y, 0, 0));
    }

    getPost(n: number): Point {
        if (n === 0 || n === 2) return this.polePosts[Math.trunc(n / 2)];
        if (n === 1) return this.crossPoints[2];
        return this.crossPoints[5];
    }

    getPostCount(): number { return 2 * this.poleCount; }
    calculateCurrent(): void {
        if (this.resistance > 0) {
            for (let i = 0; i !== this.poleCount; i++) {
                const dst = (this.position === 0) ? i*2+1 : 3-i*2;
                this.currents[i] = (this.nodes[i*2].v - this.nodes[dst].v) / this.resistance;
            }
        }
    }

    setVoltageSource(j: number, vs: VoltageSource): void {
        this.ensureArrays();
        this.voltageSources[j] = vs;
        vs.setNodes(this.nodes[j*2], this.nodes[j*2+1]);
    }

    stamp(): void {
        this.ensureArrays();
        if (this.position === 0) {
            for (let i = 0; i !== this.poleCount; i++) {
                if (this.resistance > 0)
                    CircuitElm.sim.stampResistor(this.nodes[i*2], this.nodes[i*2+1], this.resistance);
                else
                    CircuitElm.sim.stampVoltageSource(this.nodes[i*2], this.nodes[i*2+1], this.voltageSources[i], 0);
            }
        } else {
            for (let i = 0; i !== this.poleCount; i++) {
                if (this.resistance > 0)
                    CircuitElm.sim.stampResistor(this.nodes[i*2], this.nodes[3-i*2], this.resistance);
                else
                    CircuitElm.sim.stampVoltageSource(this.nodes[i*2], this.nodes[3-i*2], this.voltageSources[i], 0);
            }
        }
    }

    getVoltageSourceCount(): number { return this.resistance > 0 ? 0 : this.poleCount; }

    getConnection(n1: number, n2: number): boolean {
        if (this.position === 0)
            return this.comparePair(n1, n2, 0, 1) || this.comparePair(n1, n2, 2, 3);
        else
            return this.comparePair(n1, n2, 0, 3) || this.comparePair(n1, n2, 2, 1);
    }

    isWireEquivalent(): boolean { return this.resistance === 0; }

    // optimizing out this element is too complicated to be worth it (see #646)
    isRemovableWire(): boolean { return false; }
    getElmType(): string { return "cross switch"; }

    getInfo(arr: string[]): void {
        arr[0] = "cross switch";
        for (let i = 0; i !== this.poleCount; i++)
            arr[i + 1] = "I" + (i + 1) + " = " + CircuitElm.getCurrentDText(this.currents[i]);
    }

    validate(): boolean {
        if (this.resistance > 0)
            return true;
        for (let i = 0; i !== this.poleCount; i++) {
            const dst = (this.position === 0) ? i*2+1 : 3-i*2;
            const fpi = new FindPathInfo(FindPathInfo.VOLTAGE, this, this.getNode(i*2), CircuitElm.sim);
            if (fpi.findPath(this.getNode(dst))) {
                this.resistance = .001;
                return false;
            }
        }
        return true;
    }

    getShortcut(): number { return 0; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return EditInfo.createCheckbox("IEC Symbol", this.useIECSymbol());
        if (n === 1) return this.getKeyShortcutEditInfo();
        if (n === 2) {
            const ei = new EditInfo("On Resistance (ohms)", this.resistance);
            ei.setNonNegative();
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.flags = ei.changeFlag(this.flags, SwitchElm.FLAG_IEC);
            this.setPoints();
        }
        if (n === 1) this.setKeyShortcutEditValue(ei);
        if (n === 2) this.resistance = ei.value;
    }
}
