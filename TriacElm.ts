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

// 3 nodes, 2 internal nodes
// 1 = MT1, 0 = MT2, 2 = gate
// 3 = internal node between MT1 and MT2 (mtinode)
// 1,3 = variable resistor
// 3,0 = back-to-back diodes
// 2,1 = resistor
// MT1 and MT2 are nodes 1 and 0 (instead of 0 and 1) so that MT1 will be at the bottom when drawn bottom-to-top

import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Diode } from "./Diode";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";

export class TriacElm extends CircuitElm {
    readonly mt1node = 1;
    readonly mt2node = 0;
    readonly gnode   = 2;
    readonly mtinode = 3;

    diode03!: Diode;
    diode30!: Diode;
    state: boolean = false;

    i1: number = 0;
    i2: number = 0;
    ig: number = 0;
    curcount_1: number = 0;
    curcount_2: number = 0;
    curcount_g: number = 0;
    cresistance: number = 0;
    triggerI: number = 0;
    holdingI: number = 0;
    aresistance: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.setDefaults();
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.setDefaults();
            this.triggerI   = parseFloat(st!.nextToken());
            this.holdingI   = parseFloat(st!.nextToken());
            this.cresistance = parseFloat(st!.nextToken());
            this.state       = st!.nextToken() === "true";
        }
        this.setup();
    }

    setDefaults(): void {
        this.holdingI    = .0082;
        this.triggerI    = .01;
        this.cresistance = 100;
    }

    setup(): void {
        this.diode03 = new Diode(CircuitElm.sim);
        this.diode03.setupForDefaultModel();
        this.diode30 = new Diode(CircuitElm.sim);
        this.diode30.setupForDefaultModel();
    }

    nonLinear(): boolean { return true; }

    reset(): void {
        this.diode03.reset();
        this.diode30.reset();
        this.curcount_1 = this.curcount_2 = this.curcount_g = 0;
    }

    getDumpType(): number { return 206; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ti", this.triggerI);
        CircuitXMLSerializer.dumpAttr(elem, "hi", this.holdingI);
        CircuitXMLSerializer.dumpAttr(elem, "cr", this.cresistance);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        CircuitXMLSerializer.dumpAttr(elem, "st", this.state);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.triggerI    = xml.parseDoubleAttr("ti",  this.triggerI);
        this.holdingI    = xml.parseDoubleAttr("hi",  this.holdingI);
        this.cresistance  = xml.parseDoubleAttr("cr",  this.cresistance);
        this.state        = xml.parseBooleanAttr("st", this.state);
        this.setup();
    }

    readonly hs = 8;
    arrows!: Polygon[];
    plate1!: Point[];
    plate2!: Point[];
    gate!: Point[];

    setPoints(): void {
        super.setPoints();
        let dir = 0;
        if (CircuitElm.abs(this.dx) > CircuitElm.abs(this.dy)) {
            dir = -CircuitElm.sign(this.dx) * CircuitElm.sign(this.dy);
            this.dn = CircuitElm.abs(this.dx);
            this.point2.y = this.point1.y;
        } else {
            dir = CircuitElm.sign(this.dy) * CircuitElm.sign(this.dx);
            this.dn = CircuitElm.abs(this.dy);
            this.point2.x = this.point1.x;
        }
        if (dir === 0) dir = 1;

        this.calcLeads(16);

        this.plate1 = this.newPointArray(2);
        this.plate2 = this.newPointArray(2);
        this.gate   = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, this.plate1[0], this.plate1[1], 0, 16);
        this.interpPoint2(this.lead1!, this.lead2!, this.plate2[0], this.plate2[1], 1, 16);

        this.arrows = new Array(2);
        for (let i = 0; i !== 2; i++) {
            const sgn = -1 + i * 2;
            const p1 = this.interpPoint(this.lead1!, this.lead2!, i,     8 * sgn);
            const p2 = this.interpPoint(this.lead1!, this.lead2!, 1 - i, 16 * sgn);
            const p3 = this.interpPoint(this.lead1!, this.lead2!, 1 - i,  0 * sgn);
            this.arrows[i] = this.createPolygon(p1, p2, p3);
        }

        const gatelen = CircuitElm.app.gridSize;
        const leadlen = (this.dn - 16) / 2;
        const gatelenAdj = gatelen + (leadlen % CircuitElm.app.gridSize);
        if (leadlen < gatelenAdj) {
            this.x2 = this.x;
            this.y2 = this.y;
            return;
        }
        this.gate[0] = this.interpPoint(this.lead2!, this.point2, gatelenAdj / leadlen, gatelenAdj * dir);
        this.gate[1] = this.interpPoint(this.lead2!, this.point2, gatelenAdj / leadlen, CircuitElm.app.gridSize * 2 * dir);
    }

    draw(g: Graphics): void {
        const v1 = this.nodes[0].v;
        const v2 = this.nodes[1].v;
        this.setBbox(this.point1, this.point2, 6);
        this.adjustBbox(this.gate[0], this.gate[1]);

        this.draw2Leads(g);
        this.setVoltageColor(g, v1);
        this.setPowerColor(g, true);
        CircuitElm.drawThickLine(g, this.plate1[0], this.plate1[1]);
        this.setVoltageColor(g, v2);
        this.setPowerColor(g, true);
        CircuitElm.drawThickLine(g, this.plate2[0], this.plate2[1]);
        g.fillPolygon(this.arrows[0]);
        this.setVoltageColor(g, v1);
        this.setPowerColor(g, true);
        g.fillPolygon(this.arrows[1]);
        this.setVoltageColor(g, this.nodes[this.gnode].v);

        CircuitElm.drawThickLine(g, this.lead2!, this.gate[0]);
        CircuitElm.drawThickLine(g, this.gate[0], this.gate[1]);

        this.curcount_1 = this.updateDotCountImpl(this.i1, this.curcount_1);
        this.curcount_2 = this.updateDotCountImpl(this.i2, this.curcount_2);
        this.curcount_g = this.updateDotCountImpl(this.ig, this.curcount_g);
        if (!this.isCreating()) {
            this.drawDots(g, this.point1, this.lead2!, this.curcount_2);
            this.drawDots(g, this.point2, this.lead2!, this.curcount_1);
            this.drawDots(g, this.gate[1], this.gate[0], this.curcount_g);
            this.drawDots(g, this.gate[0], this.lead2!, this.addCurCount(this.curcount_g, CircuitElm.distance(this.gate[1], this.gate[0])));
        }

        if ((this.needsHighlight() || this.isCreating()) && this.point1.x === this.point2.x && this.point2.y > this.point1.y) {
            g.setColor(CircuitElm.whiteColor);
            const ds = CircuitElm.sign(this.dx);
            g.drawString("MT1", this.lead2!.x + ((ds < 0) ? 5 : -30), this.lead2!.y + 12);
            g.drawString("MT2", this.lead1!.x + 5, this.lead1!.y - 4);
            g.drawString("G", this.gate[0].x, this.gate[0].y + 12);
        }

        this.drawPosts(g);
    }

    getPost(n: number): Point {
        return (n === 0) ? this.point1 : (n === 1) ? this.point2 : this.gate[1];
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0) return -this.i2;
        if (n === 1) return -this.i1;
        return -this.ig;
    }

    getPostCount(): number { return 3; }
    getInternalNodeCount(): number { return 1; }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[this.mt1node]);
        CircuitElm.sim.stampNonLinear(this.nodes[this.mt2node]);
        CircuitElm.sim.stampNonLinear(this.nodes[this.gnode]);
        CircuitElm.sim.stampNonLinear(this.nodes[this.mtinode]);
        CircuitElm.sim.stampResistor(this.nodes[this.gnode], this.nodes[this.mt1node], this.cresistance);
        this.diode03.stamp(this.nodes[this.mt2node], this.nodes[this.mtinode]);
        this.diode30.stamp(this.nodes[this.mtinode], this.nodes[this.mt2node]);
    }

    startIteration(): void {
        if (Math.abs(this.i2) < this.holdingI) this.state = false;
        if (Math.abs(this.ig) > this.triggerI)  this.state = true;
        this.aresistance = this.state ? .01 : 10e5;
    }

    doStep(): void {
        this.diode03.doStep(this.nodes[this.mt2node].v - this.nodes[this.mtinode].v);
        this.diode30.doStep(this.nodes[this.mtinode].v - this.nodes[this.mt2node].v);
        CircuitElm.sim.stampResistor(this.nodes[this.mtinode], this.nodes[this.mt1node], this.aresistance);
    }

    getInfo(arr: string[]): void {
        arr[0] = "TRIAC";
        arr[1] = this.state ? "on" : "off";
        arr[2] = "Vmt2mt1 = " + CircuitElm.getVoltageText(this.nodes[this.mt2node].v - this.nodes[this.mt1node].v);
        arr[3] = "Imt1 = "    + CircuitElm.getCurrentText(this.i1);
        arr[4] = "Imt2 = "    + CircuitElm.getCurrentText(this.i2);
        arr[5] = "Ig = "      + CircuitElm.getCurrentText(this.ig);
        arr[6] = "P = "       + CircuitElm.getUnitText(this.getPower(), "W");
    }

    calculateCurrent(): void {
        if (this.aresistance === 0)
            this.i2 = 0;
        else
            this.i2 = (this.nodes[this.mtinode].v - this.nodes[this.mt1node].v) / this.aresistance;
        this.ig = -(this.nodes[this.mt1node].v - this.nodes[this.gnode].v) / this.cresistance;
        this.i1 = -this.i2 - this.ig;
    }

    getPower(): number {
        return (this.nodes[this.mt2node].v - this.nodes[this.mt1node].v) * this.i2 +
            (this.nodes[this.gnode].v - this.nodes[this.mt1node].v) * this.ig;
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("Trigger Current (A)",        this.triggerI,    0, 0).setPositive();
        if (n === 1) return new EditInfo("Holding Current (A)",        this.holdingI,    0, 0).setPositive();
        if (n === 2) return new EditInfo("Gate-MT1 Resistance (ohms)", this.cresistance, 0, 0).setPositive();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.triggerI    = ei.value;
        if (n === 1) this.holdingI    = ei.value;
        if (n === 2) this.cresistance = ei.value;
    }

    canViewInScope(): boolean { return true; }
    getVoltageDiff(): number { return this.nodes[this.mt2node].v - this.nodes[this.mt1node].v; }
    getCurrent(): number { return this.i2; }

}
