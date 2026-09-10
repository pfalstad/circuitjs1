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

export class MBBSwitchElm extends SwitchElm {
    link: number = 0;
    voltSources: VoltageSource[];
    currents: number[];
    curcounts: number[];
    both: boolean = false;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb as any, yb, f, st as any);
        if (st !== undefined) {
            this.link = parseIntStrict(st.nextToken());
        }
        this.setup();
    }

    setup(): void {
        this.noDiagonal = true;
        this.voltSources = new Array(2);
        this.currents = [0, 0];
        this.curcounts = [0, 0, 0];
        // poleCount=4 wasn't set when base called allocNodes, redo
        this.allocNodes();
    }

    getDumpType(): number { return 416; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "li", this.link);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.link = xml.parseIntAttr("li", this.link);
    }

    readonly openhs = 16;
    swposts: Point[];
    swpoles: Point[];

    setPoints(): void {
        super.setPoints();
        this.calcLeads(32);
        this.swposts = this.newPointArray(2);
        this.swpoles = this.newPointArray(4);
        for (let i = 0; i !== 2; i++) {
            const hs = i === 0 ? this.openhs : -this.openhs;
            this.interpPoint(this.lead1!, this.lead2!, this.swpoles[i], 1, hs);
            this.interpPoint(this.point1, this.point2, this.swposts[i], 1, hs);
        }
        this.posCount = 4;
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.openhs);
        this.adjustBbox(this.swposts[0], this.swposts[1]);

        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);

        for (let i = 0; i !== 2; i++) {
            this.setVoltageColor(g, this.nodes[i + 1].v);
            CircuitElm.drawThickLine(g, this.swpoles[i], this.swposts[i]);
        }

        if (!this.needsHighlight())
            g.setColor(CircuitElm.whiteColor);
        if (this.both || this.position === 0)
            CircuitElm.drawThickLine(g, this.lead1!, this.swpoles[0]);
        if (this.both || this.position === 2)
            CircuitElm.drawThickLine(g, this.lead1!, this.swpoles[1]);

        for (let i = 0; i !== 2; i++) {
            this.curcounts[i] = this.updateDotCountImpl(this.currents[i], this.curcounts[i]);
            this.drawDots(g, this.swpoles[i], this.swposts[i], this.curcounts[i]);
        }
        this.curcounts[2] = this.updateDotCountImpl(this.currents[0] + this.currents[1], this.curcounts[2]);
        this.drawDots(g, this.point1, this.lead1!, this.curcounts[2]);
        this.drawPosts(g);
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0) return -this.currents[0] - this.currents[1];
        return this.currents[n - 1];
    }

    getSwitchRect(): Rectangle {
        return new Rectangle(this.lead1!.x, this.lead1!.y, 0, 0)
            .union(new Rectangle(this.swpoles[0].x, this.swpoles[0].y, 0, 0))
            .union(new Rectangle(this.swpoles[1].x, this.swpoles[1].y, 0, 0));
    }

    getPost(n: number): Point {
        return n === 0 ? this.point1 : this.swposts[n - 1];
    }

    getPostCount(): number { return 3; }

    setCurrent(vs: VoltageSource, c: number): void {
        if (vs === this.voltSources[0])
            this.currents[this.both ? 0 : Math.trunc(this.position / 2)] = c;
        else if (vs === this.voltSources[1])
            this.currents[1] = c;
    }

    calculateCurrent(): void {
        if (this.resistance > 0) {
            this.currents[0] = (this.both || this.position === 0) ? (this.nodes[0].v - this.nodes[1].v) / this.resistance : 0;
            this.currents[1] = (this.both || this.position === 2) ? (this.nodes[0].v - this.nodes[2].v) / this.resistance : 0;
            return;
        }
        // make sure current of unconnected pole is zero
        if (!this.both)
            this.currents[1 - Math.trunc(this.position / 2)] = 0;
    }

    setVoltageSource(n: number, v: VoltageSource): void {
        this.voltSources[n] = v;
        if (this.both)
            v.setNodes(this.nodes[0], this.nodes[n + 1]);
        else if (this.position === 0)
            v.setNodes(this.nodes[0], this.nodes[1]);
        else
            v.setNodes(this.nodes[0], this.nodes[2]);
    }

    stamp(): void {
        if (this.resistance > 0) {
            if (this.both || this.position === 0)
                CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.resistance);
            if (this.both || this.position === 2)
                CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[2], this.resistance);
            return;
        }
        let vs = 0;
        if (this.both || this.position === 0)
            CircuitElm.sim.stampVoltageSourceVS(this.voltSources[vs++], 0);
        if (this.both || this.position === 2)
            CircuitElm.sim.stampVoltageSourceVS(this.voltSources[vs++], 0);
    }

    // connection is implemented by voltage source with voltage = 0.
    // need two for both loads connected, otherwise one.
    getVoltageSourceCount(): number {
        this.both = (this.position === 1 || this.position === 3);
        if (this.resistance > 0)
            return 0;
        return this.both ? 2 : 1;
    }

    toggle(): void {
        super.toggle();
        if (this.link !== 0) {
            for (const ce of CircuitElm.app.elmList) {
                if (ce instanceof MBBSwitchElm && (ce as MBBSwitchElm).link === this.link)
                    (ce as MBBSwitchElm).position = this.position;
            }
        }
    }

    getConnection(n1: number, n2: number): boolean {
        if (this.both) return true;
        return this.comparePair(n1, n2, 0, 1 + Math.trunc(this.position / 2));
    }

    // do not optimize out, even though isWireEquivalent() is true (because it may have 3 nodes to merge
    // and calcWireClosure() doesn't handle that case)
    isRemovableWire(): boolean { return false; }
    isWireEquivalent(): boolean { return this.resistance === 0; }

    getElmType(): string { return "switch (SPDT, MBB)"; }

    getInfo(arr: string[]): void {
        arr[0] = "switch (" + (this.link === 0 ? "S" : "D") + "PDT, MBB)";
        arr[1] = "I = " + CircuitElm.getCurrentDText(this.getCurrent());
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return super.getEditInfo(0);
        if (n === 1) return new EditInfo("Switch Group", this.link, 0, 100).setDimensionless();
        if (n === 2) return this.getKeyShortcutEditInfo();
        if (n === 3) {
            const ei = new EditInfo("On Resistance (ohms)", this.resistance);
            ei.setNonNegative();
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 1) this.link = Math.trunc(ei.value);
        else if (n === 2) this.setKeyShortcutEditValue(ei);
        else if (n === 3) this.resistance = ei.value;
        else super.setEditValue(n, ei);
    }

    validate(): boolean {
        if (this.resistance > 0)
            return true;
        const b = (this.position === 1 || this.position === 3);
        if (b || this.position === 0) {
            const fpi = new FindPathInfo(FindPathInfo.VOLTAGE, this, this.getNode(0), CircuitElm.sim);
            if (fpi.findPath(this.getNode(1))) {
                this.resistance = .001;
                return false;
            }
        }
        if (b || this.position === 2) {
            const fpi = new FindPathInfo(FindPathInfo.VOLTAGE, this, this.getNode(0), CircuitElm.sim);
            if (fpi.findPath(this.getNode(2))) {
                this.resistance = .001;
                return false;
            }
        }
        return true;
    }

    getShortcut(): number { return 0; }
}
