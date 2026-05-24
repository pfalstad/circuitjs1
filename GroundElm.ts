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
import { CircuitNode } from "./CircuitNode";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { WireRouter } from "./WireRouter";
import { XMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";

export class GroundElm extends CircuitElm {
    static lastSymbolType: number = 0;
    symbolType: number;

    // this is needed for old subcircuits which have GroundElm dumped
    readonly FLAG_OLD_STYLE = 1;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.symbolType = GroundElm.lastSymbolType;
        } else {
            super(xa, ya, xb, yb!, f!);
            this.symbolType = 0;
            if (st!.hasMoreTokens()) {
                try {
                    this.symbolType = parseInt(st!.nextToken());
                } catch (e) {}
            }
        }
    }
    dump(): string {
        return super.dump() + " " + this.symbolType;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        if (this.symbolType != 0)
            XMLSerializer.dumpAttr(elem, "sy", this.symbolType);
    }

    undumpXml(xml: XMLDeserializer): void {
        super.undumpXml(xml);
        this.symbolType = xml.parseIntAttr("sy", 0);
    }

    isGroundElm(): boolean { return true; }
    getDumpType(): number { return 'g'.charCodeAt(0); }
    getPostCount(): number { return 1; }
    draw(g: Graphics): void {
        this.setVoltageColor(g, 0);
        CircuitElm.drawThickLine(g, this.point1, this.point2);
        if (this.symbolType == 0) {
            let i: number;
            for (i = 0; i != 3; i++) {
                const a = 10-i*4;
                const b = i*5; // -10;
                this.interpPoint2(this.point1, this.point2, CircuitElm.ps1, CircuitElm.ps2, 1+b/this.dn, a);
                CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
            }
        } else if (this.symbolType == 1) {
            this.interpPoint2(this.point1, this.point2, CircuitElm.ps1, CircuitElm.ps2, 1, 10);
            CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
            let i: number;
            for (i = 0; i <= 2; i++) {
                const p = this.interpPoint(CircuitElm.ps1, CircuitElm.ps2, i/2.);
                CircuitElm.drawThickLine(g, p.x, p.y, Math.trunc(p.x-5*this.dpx1+8*this.dx/this.dn), Math.trunc(p.y+8*this.dy/this.dn-5*this.dpy1));
            }
        } else if (this.symbolType == 2) {
            this.interpPoint2(this.point1, this.point2, CircuitElm.ps1, CircuitElm.ps2, 1, 10);
            CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
            const ps3x = Math.trunc(this.point2.x+10*this.dx/this.dn);
            const ps3y = Math.trunc(this.point2.y+10*this.dy/this.dn);
            CircuitElm.drawThickLine(g, CircuitElm.ps1.x, CircuitElm.ps1.y, ps3x, ps3y);
            CircuitElm.drawThickLine(g, CircuitElm.ps2.x, CircuitElm.ps2.y, ps3x, ps3y);
        } else {
            this.interpPoint2(this.point1, this.point2, CircuitElm.ps1, CircuitElm.ps2, 1, 10);
            CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
        }
        this.interpPoint(this.point1, this.point2, CircuitElm.ps2, 1+11./this.dn);
        this.doDots(g);
        this.setBbox(this.point1, CircuitElm.ps2, 11);
        this.drawPosts(g);
    }

    setOldStyle(): void {
        this.flags |= this.FLAG_OLD_STYLE;
    }
    isOldStyle(): boolean { return (this.flags & this.FLAG_OLD_STYLE) != 0; }
    getVoltageSourceCount(): number {
        return (this.isOldStyle()) ? 1 : 0;
    }
    stamp(): void {
        if (this.isOldStyle())
            CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[0], this.voltSource, 0);
    }
    setCurrent(vs: any, c: number): void { this.current = this.isOldStyle() ? -c : c; }

    isWireEquivalent(): boolean { return true; }
    isRemovableWire(): boolean { return true; }
    static firstGround: Point | null = null;
    static resetNodeList(): void {
        GroundElm.firstGround = null;
    }
    getConnectedPost(n?: number): Point {
        if (GroundElm.firstGround != null)
            return GroundElm.firstGround;
        GroundElm.firstGround = this.point1;
        return null!;
    }

//	void setCurrent(int x, double c) { current = -c; }
    getVoltageDiff(): number { return 0; }
    getInfo(arr: string[]): void {
        arr[0] = "ground";
        arr[1] = "I = " + CircuitElm.getCurrentText(this.getCurrent());
    }
    hasGroundConnection(n1: number): boolean { return true; }
    addRoutingObstacle(router: WireRouter): void {
        router.addWire(this.point1.x, this.point1.y, this.point2.x, this.point2.y);
        const pa = new Point(), pb = new Point();
        this.interpPoint2(this.point1, this.point2, pa, pb, 1+11./this.dn, 10);
        router.addObstacle(pa.x, pa.y, pb.x, pb.y);
    }

    getShortcut(): number { return 'g'.charCodeAt(0); }

    getEditInfo(n: number): EditInfo | null {
        if (n == 0) {
            const ei = new EditInfo("Symbol", 0);
            ei.choice = new Choice();
            ei.choice.add("Earth");
            ei.choice.add("Chassis");
            ei.choice.add("Signal");
            ei.choice.add("Common");
            ei.choice.select(this.symbolType);
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n == 0)
            GroundElm.lastSymbolType = this.symbolType = ei.choice.getSelectedIndex();
    }

    getCurrentIntoNode(n: number): number { return -this.current; }
}
