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
import { FindPathInfo } from "./FindPathInfo";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Rectangle } from "./Rectangle";
import { StringTokenizer } from "./StringTokenizer";
import { SwitchElm } from "./SwitchElm";
import { VoltageSource } from "./VoltageSource";
import { parseIntStrict } from "./NumberParse";

export class DPDTSwitchElm extends SwitchElm {
    poleCount: number;

    constructor(xx: number, yy: number);
    constructor(xx: number, yy: number, mm: boolean);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xbOrMm?: number | boolean, yb?: number, f?: number, st?: StringTokenizer) {
        if (st !== undefined) {
            super(xa, ya, xbOrMm as number, yb!, f!, st);
            try {
                this.poleCount = parseIntStrict(st.nextToken());
            } catch (e) {
                this.poleCount = 2;
            }
        } else if (typeof xbOrMm === 'boolean') {
            super(xa, ya, xbOrMm);
            this.poleCount = 2;
        } else {
            super(xa, ya, false);
            this.poleCount = 2;
        }
        this.noDiagonal = true;
        // poleCount wasn't set when the base constructor called allocNodes(), so redo it now
        this.allocNodes();
    }

    getDumpType(): number { return 429; }
    getXmlDumpType(): string { return "dpdt"; }

    dump(): string {
        return super.dump() + " " + this.poleCount;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "po", this.poleCount);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.poleCount = xml.parseIntAttr("po", this.poleCount);
    }

    readonly openhs = 16;
    readonly posCount = 2;
    poleLeads: Point[];
    throwLeads: Point[];
    polePosts: Point[];
    throwPosts: Point[];
    linePoints: Point[];
    voltageSources: VoltageSource[];
    currents: number[];
    curcounts: number[];

    // voltageSources/currents/curcounts are normally (re)allocated in setPoints(), but elements
    // inside a CompositeElm/subcircuit never get setPoints() called, so allocate lazily here too.
    ensureArrays(): void {
        if (this.voltageSources == null || this.voltageSources.length !== this.poleCount) {
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
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, 1);
        this.adjustBbox(this.throwPosts[1], this.throwPosts[this.poleCount * 2 - 2]);

        for (let i = 0; i !== this.poleCount; i++) {
            this.setVoltageColor(g, this.nodes[i*3].v);
            CircuitElm.drawThickLine(g, this.polePosts[i], this.poleLeads[i]);
            this.setVoltageColor(g, this.nodes[i*3+1].v);
            CircuitElm.drawThickLine(g, this.throwPosts[i*2  ], this.throwLeads[i*4  ]);
            if (this.useIECSymbol())
                CircuitElm.drawThickLine(g, this.throwLeads[i*4], this.throwLeads[i*4+2]);
            this.setVoltageColor(g, this.nodes[i*3+2].v);
            CircuitElm.drawThickLine(g, this.throwPosts[i*2+1], this.throwLeads[i*4+1]);

            // draw line
            if (!this.needsHighlight())
                g.setColor(CircuitElm.lightGrayColor);

            if (i < this.poleCount - 1) {
                const offset = -i * this.openhs * 3;
                this.interpPoint(this.point1, this.point2, this.linePoints[0], 0.5, offset - this.openhs * (0.5 - this.position) - 4 * this.position);
                this.interpPoint(this.point1, this.point2, this.linePoints[1], 0.5, offset - this.openhs * 3 - this.openhs * (0.5 - this.position) + 3 + 8 * (1 - this.position));
                g.setLineDash(4, 4);
                g.drawLine(this.linePoints[0], this.linePoints[1]);
                g.setLineDash(0, 0);
            }

            // draw switch
            if (!this.needsHighlight())
                g.setColor(CircuitElm.whiteColor);
            CircuitElm.drawThickLine(g, this.poleLeads[i], this.throwLeads[i*4+3-this.position*2]);

            // current
            this.curcounts[i] = this.updateDotCountImpl(this.currents[i], this.curcounts[i]);
            this.drawDots(g, this.polePosts[i], this.poleLeads[i], this.curcounts[i]);
            this.drawDots(g, this.throwLeads[i*4+this.position], this.throwPosts[i*2+this.position], this.curcounts[i]);
        }

        this.drawPosts(g);
    }

    getCurrentIntoNode(n: number): number {
        const t = Math.trunc(n / 3);
        const n3 = n % 3;
        if (n3 === 0)
            return -this.currents[t];
        if (n3 === this.position + 1)
            return this.currents[t];
        return 0;
    }

    setCurrent(vs: VoltageSource, c: number): void {
        for (let i = 0; i !== this.poleCount; i++)
            if (vs === this.voltageSources[i])
                this.currents[i] = c;
    }

    getSwitchRect(): Rectangle {
        return new Rectangle(this.poleLeads[0].x, this.poleLeads[0].y, 0, 0)
            .union(new Rectangle(this.throwLeads[1].x, this.throwLeads[1].y, 0, 0))
            .union(new Rectangle(this.throwLeads[this.poleCount*4-4].x, this.throwLeads[this.poleCount*4-4].y, 0, 0));
    }

    getPost(n: number): Point {
        const t = Math.trunc(n / 3);
        const n3 = n % 3;
        if (n3 === 0)
            return this.polePosts[t];
        return this.throwPosts[t*2 + n3 - 1];
    }

    getPostCount(): number { return 3 * this.poleCount; }

    calculateCurrent(): void {
        if (this.resistance > 0)
            for (let i = 0; i !== this.poleCount; i++)
                this.currents[i] = (this.nodes[i*3].v - this.nodes[i*3+1+this.position].v) / this.resistance;
    }

    setVoltageSource(j: number, vs: VoltageSource): void {
        this.ensureArrays();
        this.voltageSources[j] = vs;
        vs.setNodes(this.nodes[j*3], this.nodes[this.position + 1 + j*3]);
    }

    stamp(): void {
        this.ensureArrays();
        for (let i = 0; i !== this.poleCount; i++) {
            if (this.resistance > 0)
                CircuitElm.sim.stampResistor(this.nodes[i*3], this.nodes[this.position+1+i*3], this.resistance);
            else
                CircuitElm.sim.stampVoltageSourceVS(this.voltageSources[i], 0);
        }
    }

    getVoltageSourceCount(): number { return this.resistance > 0 ? 0 : this.poleCount; }

    getConnection(n1: number, n2: number): boolean {
        for (let i = 0; i !== this.poleCount; i++)
            if (this.comparePair(n1, n2, i*3, i*3 + 1 + this.position))
                return true;
        return false;
    }

    isWireEquivalent(): boolean { return this.resistance === 0; }

    // optimizing out this element is too complicated to be worth it (see #646)
    isRemovableWire(): boolean { return false; }

    getElmType(): string { return "switch (DPDT)"; }

    getInfo(arr: string[]): void {
        arr[0] = (this.poleCount === 2) ? "switch (DPDT)" : "switch (" + this.poleCount + "PDT)";
        for (let i = 0; i !== this.poleCount; i++)
            arr[i + 1] = "I" + (i + 1) + " = " + CircuitElm.getCurrentDText(this.currents[i]);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Poles", this.poleCount, 2, 10).setDimensionless();
        if (n === 1)
            return EditInfo.createCheckbox("IEC Symbol", this.useIECSymbol());
        if (n === 2)
            return this.getKeyShortcutEditInfo();
        if (n === 3) {
            const ei = new EditInfo("On Resistance (ohms)", this.resistance);
            ei.setNonNegative();
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 2) {
                this.poleCount = Math.trunc(ei.value);
                this.allocNodes();
                this.setPoints();
            } else
                ei.setError("must be >= 2");
        }
        if (n === 1) {
            this.flags = ei.changeFlag(this.flags, SwitchElm.FLAG_IEC);
            this.setPoints();
        }
        if (n === 2)
            this.setKeyShortcutEditValue(ei);
        if (n === 3)
            this.resistance = ei.value;
    }

    getShortcut(): number { return 0; }

    flip(): void {
        if (this.dx === 0)
            this.x = this.x2 = this.x - Math.trunc(this.dpx1 * this.openhs * 3);
        if (this.dy === 0)
            this.y = this.y2 = this.y - Math.trunc(this.dpy1 * this.openhs * 3);
        this.position = 1 - this.position;
    }

    flipX(c2: number, count: number): void {
        this.flip();
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        this.flip();
        super.flipY(c2, count);
    }

    flipXY(c2: number, count: number): void {
        this.flip();
        super.flipXY(c2, count);
    }

    validate(): boolean {
        if (this.resistance > 0)
            return true;
        for (let i = 0; i !== this.poleCount; i++) {
            const fpi = new FindPathInfo(FindPathInfo.VOLTAGE, this, this.getNode(i*3), CircuitElm.sim);
            if (fpi.findPath(this.getNode(i*3 + 1 + this.position))) {
                //CircuitElm.sim.stop("Voltage source/wire loop with no resistance!", this);
                this.resistance = .001;
                return false;
            }
        }
        return true;
    }
}
