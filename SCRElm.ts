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

// Silicon-Controlled Rectifier
// 3 nodes, 1 internal node
// 0 = anode, 1 = cathode, 2 = gate
// 0, 3 = variable resistor
// 3, 1 = diode
// 2, 1 = 50 ohm resistor

import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Diode } from "./Diode";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";

export class SCRElm extends CircuitElm {
    readonly anode = 0;
    readonly cnode = 1;
    readonly gnode = 2;
    readonly inode = 3;
    readonly FLAG_GATE_FIX = 1;
    diode: Diode;
    dir: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        this.setDefaults();
        if (st !== undefined) {
            try {
                this.lastvac = parseFloat(st.nextToken());
                this.lastvag = parseFloat(st.nextToken());
                // volts[anode/cnode/gnode] were initialized here in Java, but nodes[]
                // isn't allocated until analyzeCircuit; initial voltages start at 0
                this.triggerI = parseFloat(st.nextToken());
                this.holdingI = parseFloat(st.nextToken());
                this.gresistance = parseFloat(st.nextToken());
            } catch (e) {}
        } else {
            this.flags |= this.FLAG_GATE_FIX;
        }
        this.setup();
    }

    setDefaults(): void {
        this.gresistance = 50;
        this.holdingI = 0.0082;
        this.triggerI = 0.01;
    }

    setup(): void {
        this.diode = new Diode(CircuitElm.sim);
        this.diode.setupForDefaultModel();
        this.aresistance = 1; // to avoid divide by zero
    }

    nonLinear(): boolean { return true; }

    reset(): void {
        this.nodes[this.anode].v = this.nodes[this.cnode].v = this.nodes[this.gnode].v = 0;
        this.diode.reset();
        this.lastvag = this.lastvac = this.curcount_a = this.curcount_c = this.curcount_g = 0;
    }

    getDumpType(): number { return 177; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "tr", this.triggerI);
        CircuitXMLSerializer.dumpAttr(elem, "ho", this.holdingI);
        CircuitXMLSerializer.dumpAttr(elem, "gr", this.gresistance);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.triggerI = xml.parseDoubleAttr("tr", this.triggerI);
        this.holdingI = xml.parseDoubleAttr("ho", this.holdingI);
        this.gresistance = xml.parseDoubleAttr("gr", this.gresistance);
        this.setup();
    }

    ia: number = 0;
    ic: number = 0;
    ig: number = 0;
    curcount_a: number = 0;
    curcount_c: number = 0;
    curcount_g: number = 0;
    lastvac: number = 0;
    lastvag: number = 0;
    gresistance: number;
    triggerI: number;
    holdingI: number;

    readonly hs = 8;
    poly: Polygon;
    cathode: Point[];
    gate: Point[];

    applyGateFix(): boolean { return (this.flags & this.FLAG_GATE_FIX) !== 0; }

    setPoints(): void {
        super.setPoints();
        this.dir = 0;
        if (Math.abs(this.dx) > Math.abs(this.dy)) {
            this.dir = -CircuitElm.sign(this.dx) * CircuitElm.sign(this.dy);
            // correct dn (length) or else calcLeads() may get confused, and also gate may be drawn weirdly.  Can't do this with old circuits or it may
            // break them
            if (this.applyGateFix())
                this.dn = Math.abs(this.dx);
            this.point2.y = this.point1.y;
        } else {
            this.dir = CircuitElm.sign(this.dy) * CircuitElm.sign(this.dx);
            if (this.applyGateFix())
                this.dn = Math.abs(this.dy);
            this.point2.x = this.point1.x;
        }
        if (this.dir === 0)
            this.dir = 1;
        this.calcLeads(16);
        this.cathode = this.newPointArray(2);
        const pa = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, pa[0], pa[1], 0, this.hs);
        this.interpPoint2(this.lead1!, this.lead2!, this.cathode[0], this.cathode[1], 1, this.hs);
        this.poly = this.createPolygon(pa[0], pa[1], this.lead2!);

        this.gate = this.newPointArray(2);
        const leadlen = (this.dn - 16) / 2;
        let gatelen = CircuitElm.app.gridSize;
        gatelen += leadlen % CircuitElm.app.gridSize;
        if (leadlen < gatelen) {
            this.x2 = this.x; this.y2 = this.y;
            return;
        }
        this.interpPoint(this.lead2!, this.point2, this.gate[0], gatelen / leadlen, gatelen * this.dir);
        this.interpPoint(this.lead2!, this.point2, this.gate[1], gatelen / leadlen, CircuitElm.app.gridSize * 2 * this.dir);
        this.gate[1].x = this.snapGrid(this.gate[1].x);
        this.gate[1].y = this.snapGrid(this.gate[1].y);
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.hs);
        this.adjustBbox(this.gate[0], this.gate[1]);

        const v1 = this.nodes[this.anode].v;
        const v2 = this.nodes[this.cnode].v;

        this.draw2Leads(g);

        // draw arrow thingy
        this.setVoltageColor(g, v1);
        this.setPowerColor(g, true);
        g.fillPolygon(this.poly);

        this.setVoltageColor(g, this.nodes[this.gnode].v);
        CircuitElm.drawThickLine(g, this.lead2!, this.gate[0]);
        CircuitElm.drawThickLine(g, this.gate[0], this.gate[1]);

        // draw thing arrow is pointing to
        this.setVoltageColor(g, v2);
        this.setPowerColor(g, true);
        CircuitElm.drawThickLine(g, this.cathode[0], this.cathode[1]);

        this.curcount_a = this.updateDotCountImpl(this.ia, this.curcount_a);
        this.curcount_c = this.updateDotCountImpl(this.ic, this.curcount_c);
        this.curcount_g = this.updateDotCountImpl(this.ig, this.curcount_g);
        if (!this.isCreating()) {
            this.drawDots(g, this.point1, this.lead2!, this.curcount_a);
            this.drawDots(g, this.point2, this.lead2!, this.curcount_c);
            this.drawDots(g, this.gate[1], this.gate[0], this.curcount_g);
            this.drawDots(g, this.gate[0], this.lead2!, this.curcount_g + CircuitElm.distance(this.gate[1], this.gate[0]));
        }

        if ((this.needsHighlight() || this.isCreating()) && this.point1.x === this.point2.x && this.point2.y > this.point1.y) {
            g.setColor(CircuitElm.whiteColor);
            const ds = CircuitElm.sign(this.dx);
            g.drawString("C", this.lead2!.x + ((ds < 0) ? 5 : -15), this.lead2!.y + 12);
            g.drawString("A", this.lead1!.x + 5, this.lead1!.y - 4);
            g.drawString("G", this.gate[0].x, this.gate[0].y + 12);
        }

        this.drawPosts(g);
    }

    getCurrentIntoNode(n: number): number {
        if (n === this.anode)
            return -this.ia;
        if (n === this.cnode)
            return -this.ic;
        return -this.ig;
    }

    getPost(n: number): Point {
        return (n === 0) ? this.point1 : (n === 1) ? this.point2 : this.gate[1];
    }

    getPostCount(): number { return 3; }
    getInternalNodeCount(): number { return 1; }

    getPower(): number {
        return (this.nodes[this.anode].v - this.nodes[this.gnode].v) * this.ia +
               (this.nodes[this.cnode].v - this.nodes[this.gnode].v) * this.ic;
    }

    aresistance: number;

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[this.anode]);
        CircuitElm.sim.stampNonLinear(this.nodes[this.cnode]);
        CircuitElm.sim.stampNonLinear(this.nodes[this.gnode]);
        CircuitElm.sim.stampNonLinear(this.nodes[this.inode]);
        CircuitElm.sim.stampResistor(this.nodes[this.gnode], this.nodes[this.cnode], this.gresistance);
        this.diode.stamp(this.nodes[this.inode], this.nodes[this.cnode]);
    }

    doStep(): void {
        const vac = this.nodes[this.anode].v - this.nodes[this.cnode].v; // typically negative
        const vag = this.nodes[this.anode].v - this.nodes[this.gnode].v; // typically positive
        if (Math.abs(vac - this.lastvac) > 0.01 ||
            Math.abs(vag - this.lastvag) > 0.01)
            CircuitElm.sim.converged = false;
        this.lastvac = vac;
        this.lastvag = vag;
        this.diode.doStep(this.nodes[this.inode].v - this.nodes[this.cnode].v);
        const icmult = 1 / this.triggerI;
        const iamult = 1 / this.holdingI - icmult;
        this.aresistance = (-icmult * this.ic + this.ia * iamult > 1) ? 0.0105 : 10e5;
        CircuitElm.sim.stampResistor(this.nodes[this.anode], this.nodes[this.inode], this.aresistance);
    }

    getInfo(arr: string[]): void {
        arr[0] = "SCR";
        const vac = this.nodes[this.anode].v - this.nodes[this.cnode].v;
        const vag = this.nodes[this.anode].v - this.nodes[this.gnode].v;
        const vgc = this.nodes[this.gnode].v - this.nodes[this.cnode].v;
        arr[1] = "Ia = " + CircuitElm.getCurrentText(this.ia);
        arr[2] = "Ig = " + CircuitElm.getCurrentText(this.ig);
        arr[3] = "Vac = " + CircuitElm.getVoltageText(vac);
        arr[4] = "Vag = " + CircuitElm.getVoltageText(vag);
        arr[5] = "Vgc = " + CircuitElm.getVoltageText(vgc);
        arr[6] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
    }

    calculateCurrent(): void {
        this.ig = (this.nodes[this.gnode].v - this.nodes[this.cnode].v) / this.gresistance;
        this.ia = (this.nodes[this.anode].v - this.nodes[this.inode].v) / this.aresistance;
        this.ic = -this.ig - this.ia;
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Trigger Current (A)", this.triggerI, 0, 0).setPositive();
        if (n === 1)
            return new EditInfo("Holding Current (A)", this.holdingI, 0, 0).setPositive();
        if (n === 2)
            return new EditInfo("Gate Resistance (ohms)", this.gresistance, 0, 0).setPositive();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.triggerI = ei.value;
        if (n === 1)
            this.holdingI = ei.value;
        if (n === 2)
            this.gresistance = ei.value;
    }

    // if point1 and point2 are in line, then we don't know which way the gate
    // is pointed and flip won't work.  fix this
    fixEnds(): void {
        const pt = new Point();
        this.interpPoint(this.point1, this.point2, pt, 1, CircuitElm.app.gridSize * this.dir);
        this.x2 = pt.x; this.y2 = pt.y;
    }

    flipX(c2: number, count: number): void {
        this.fixEnds();
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        this.fixEnds();
        super.flipY(c2, count);
    }

    flipXY(c2: number, count: number): void {
        this.fixEnds();
        super.flipXY(c2, count);
    }
}
