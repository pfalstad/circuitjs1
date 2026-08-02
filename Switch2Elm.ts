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
import { SwitchElm } from "./SwitchElm";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Rectangle } from "./Rectangle";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { VoltageSource } from "./VoltageSource";
import { WireRouter } from "./WireRouter";
import { FindPathInfo } from "./FindPathInfo";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

// SPDT switch
export class Switch2Elm extends SwitchElm {
    link: number = 0;
    throwCount: number;
    static readonly FLAG_CENTER_OFF = 1;
    positionFlipped: boolean = false; // tracks runtime flip state for sync

    constructor(xx: number, yy: number);
    constructor(xx: number, yy: number, mm: boolean);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xbOrMm?: number | boolean, yb?: number, f?: number, st?: StringTokenizer) {
        if (yb === undefined) {
            super(xa, ya, typeof xbOrMm === 'boolean' ? xbOrMm : false);
            this.noDiagonal = true;
            this.throwCount = 2;
        } else {
            super(xa, ya, xbOrMm as number, yb, f!, st!);
            this.link = parseInt(st!.nextToken());
            this.throwCount = 2;
            try {
                this.throwCount = parseInt(st!.nextToken());
            } catch (e) {}
            this.noDiagonal = true;
        }
    }

    getDumpType(): number { return 'S'.charCodeAt(0); }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "li", this.link);
        CircuitXMLSerializer.dumpAttr(elem, "th", this.throwCount);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.link = xml.parseIntAttr("li", this.link);
        this.throwCount = xml.parseIntAttr("th", this.throwCount);
    }

    readonly openhs = 16;
    swposts: Point[] = [];
    swpoles: Point[] = [];

    setPoints(): void {
        super.setPoints();
        this.calcLeads(32);
        this.swposts = this.newPointArray(this.throwCount);
        this.swpoles = this.newPointArray(2 + this.throwCount);
        for (let i = 0; i !== this.throwCount; i++) {
            let hs = -this.openhs * (i - Math.trunc((this.throwCount - 1) / 2));
            if (this.throwCount === 2 && i === 0)
                hs = this.openhs;
            this.interpPoint(this.lead1!, this.lead2!, this.swpoles[i], 1, hs);
            this.interpPoint(this.point1, this.point2, this.swposts[i], 1, hs);
        }
        this.swpoles[this.throwCount] = this.lead2!; // for center off
        this.posCount = this.hasCenterOff() ? 3 : this.throwCount;
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.openhs);
        this.adjustBbox(this.swposts[0], this.swposts[this.throwCount - 1]);

        // draw first lead
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);

        // draw other leads
        for (let i = 0; i !== this.throwCount; i++) {
            this.setVoltageColor(g, this.nodes[i + 1].v);
            CircuitElm.drawThickLine(g, this.swpoles[i], this.swposts[i]);
        }

        // draw switch
        if (!this.needsHighlight())
            g.setColor(CircuitElm.whiteColor);
        CircuitElm.drawThickLine(g, this.lead1!, this.swpoles[this.position]);

        this.updateDotCount();
        this.drawDots(g, this.point1, this.lead1!, this.curcount);
        if (!(this.position === 2 && this.hasCenterOff()))
            this.drawDots(g, this.swpoles[this.position], this.swposts[this.position], this.curcount);
        this.drawPosts(g);
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0)
            return -this.current;
        if (n === this.position + 1)
            return this.current;
        return 0;
    }

    getSwitchRect(): Rectangle {
        const p0 = this.swpoles[0];
        const p1 = this.swpoles[this.throwCount - 1];
        const x = Math.min(this.lead1!.x, p0.x, p1.x);
        const y = Math.min(this.lead1!.y, p0.y, p1.y);
        const w = Math.abs(p0.x - this.lead1!.x) + Math.abs(p1.x - p0.x);
        const h = Math.abs(p0.y - this.lead1!.y) + Math.abs(p1.y - p0.y);
        return new Rectangle(x, y, w, h);
    }

    getPost(n: number): Point {
        return (n === 0) ? this.point1 : this.swposts[n - 1];
    }

    getPostCount(): number { return 1 + (this.throwCount ?? 0); }

    calculateCurrent(): void {
        if (this.position === 2 && this.hasCenterOff())
            this.current = 0;
        else if (this.resistance > 0)
            this.current = (this.nodes[0].v - this.nodes[this.position + 1].v) / this.resistance;
    }

    setVoltageSource(n: number, v: VoltageSource): void {
        this.voltSource = v;
        v.setNodes(this.nodes[0], this.nodes[this.position + 1]);
    }

    stamp(): void {
        if (this.position === 2 && this.hasCenterOff())
            return;
        if (this.resistance > 0)
            CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[this.position + 1], this.resistance);
        else
            CircuitElm.sim.stampVoltageSource(this.nodes[0], this.nodes[this.position + 1], this.voltSource!, 0);
    }

    getVoltageSourceCount(): number {
        if (this.position === 2 && this.hasCenterOff())
            return 0;
        return this.resistance > 0 ? 0 : 1;
    }

    toggle(): void {
        super.toggle();
        if (this.link !== 0) {
            for (let i = 0; i !== CircuitElm.sim.elmList.length; i++) {
                const o = CircuitElm.sim.elmList[i];
                if (o instanceof Switch2Elm) {
                    const s2 = o as Switch2Elm;
                    if (s2.link === this.link) {
                        let pos = this.position;
                        if (s2.positionFlipped !== this.positionFlipped)
                            pos = this.posCount - 1 - pos;
                        if (pos < s2.posCount)
                            s2.position = pos;
                    }
                }
            }
        }
    }

    getConnection(n1: number, n2: number): boolean {
        if (this.position === 2 && this.hasCenterOff())
            return false;
        return this.comparePair(n1, n2, 0, 1 + this.position);
    }

    isWireEquivalent(): boolean { return this.resistance === 0; }

    // optimizing out this element is too complicated to be worth it (see #646)
    isRemovableWire(): boolean { return false; }

    getElmType(): string { return "switch (SPDT)"; }

    getInfo(arr: string[]): void {
        arr[0] = "switch (" + (this.link === 0 ? "S" : "D") + "P" +
                (this.throwCount > 2 ? this.throwCount + "T)" : "DT)");
        arr[1] = "I = " + CircuitElm.getCurrentDText(this.getCurrent());
    }

    getEditInfo(n: number): EditInfo | null {
        /*if (n == 1) {
            EditInfo ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Center Off", hasCenterOff());
            return ei;
        }*/
        if (n === 1)
            return new EditInfo("Group Number (for linking)", this.link, 0, 100).setDimensionless().disallowSliders();
        if (n === 2)
            return new EditInfo("# of Throws", this.throwCount, 2, 10).setDimensionless().disallowSliders();
        return super.getEditInfo(n);
    }

    setEditValue(n: number, ei: EditInfo): void {
        /*if (n == 1) {
            flags &= ~FLAG_CENTER_OFF;
            if (ei.checkbox.getState())
                flags |= FLAG_CENTER_OFF;
            if (hasCenterOff())
                momentary = false;
            setPoints();
        } else*/
        if (n === 1) {
            this.link = Math.trunc(ei.value);
        } else if (n === 2) {
            if (ei.value >= 2)
                this.throwCount = Math.trunc(ei.value);
            if (this.throwCount > 2)
                this.momentary = false;
            this.allocNodes();
            this.setPoints();
        } else
            super.setEditValue(n, ei);
    }

    // this is for backwards compatibility only.  we only support it if throwCount = 2
    hasCenterOff(): boolean { return (this.flags & Switch2Elm.FLAG_CENTER_OFF) !== 0 && this.throwCount === 2; }

    addRoutingObstacle(router: WireRouter): void {
        router.addWire(this.point1.x, this.point1.y, this.lead1!.x, this.lead1!.y);
        for (let i = 0; i !== this.throwCount; i++)
            router.addWire(this.swposts[i].x, this.swposts[i].y, this.swpoles[i].x, this.swpoles[i].y);
        // add obstacle spanning lead1 through all poles
        let minX = this.lead1!.x, minY = this.lead1!.y;
        let maxX = this.lead1!.x, maxY = this.lead1!.y;
        for (let i = 0; i !== this.throwCount; i++) {
            minX = Math.min(minX, this.swpoles[i].x);
            minY = Math.min(minY, this.swpoles[i].y);
            maxX = Math.max(maxX, this.swpoles[i].x);
            maxY = Math.max(maxY, this.swpoles[i].y);
        }
        router.addObstacle(minX, minY, maxX, maxY);
    }

    getShortcut(): number { return 'S'.charCodeAt(0); }

    flipX(c2: number, count: number): void {
        super.flipX(c2, count);
        this.position = this.posCount - 1 - this.position;
        this.positionFlipped = !this.positionFlipped;
    }

    flipY(c2: number, count: number): void {
        super.flipY(c2, count);
        this.position = this.posCount - 1 - this.position;
        this.positionFlipped = !this.positionFlipped;
    }

    flipXY(c2: number, count: number): void {
        super.flipXY(c2, count);
        this.position = this.posCount - 1 - this.position;
        this.positionFlipped = !this.positionFlipped;
    }

    validate(): boolean {
        if (this.position === 2 && this.hasCenterOff())
            return true;
        if (this.resistance > 0)
            return true;
        const fpi = new FindPathInfo(FindPathInfo.VOLTAGE, this, this.getNode(0), CircuitElm.sim);
        if (fpi.findPath(this.getNode(1 + this.position))) {
            //CircuitElm.sim.stop("Voltage source/wire loop with no resistance!", this);
            this.resistance = .001;
            return false;
        }
        return true;
    }
}
