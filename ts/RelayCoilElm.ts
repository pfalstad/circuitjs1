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
import { Choice } from "./Choice";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CustomLogicModel } from "./CustomLogicModel";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Inductor } from "./Inductor";
import { Locale } from "./Locale";
import { Point } from "./Point";
import { RelayContactElm } from "./RelayContactElm";
import { StringTokenizer } from "./StringTokenizer";
import { parseIntStrict, parseFloatStrict } from "./NumberParse";

export class RelayCoilElm extends CircuitElm {
    inductance: number;
    ind: Inductor;
    label: string;
    onCurrent: number;
    offCurrent: number;
    coilPosts: Point[];
    coilLeads: Point[];
    outline: Point[];
    extraPoints: Point[];
    coilCurrent: number = 0;
    coilCurCount: number = 0;
    avgCurrent: number = 0;
    d_position: number = 0;
    i_position: number = 0;
    coilR: number;
    switchingTime: number;
    switchingTimeOn: number = 0;
    switchingTimeOff: number = 0;
    lastTransition: number = 0;
    openhs: number = 0;
    state: number = 0;
    switchPosition: number = 0;

    static readonly TYPE_NORMAL = 0;
    static readonly TYPE_ON_DELAY = 1;
    static readonly TYPE_OFF_DELAY = 2;
    static readonly TYPE_LATCHING = 3;
    static readonly TYPE_LATCHING_ON = 4;
    static readonly TYPE_LATCHING_OFF = 5;
    type: number = 0;

    static isLatchingType(t: number): boolean {
        return t === RelayCoilElm.TYPE_LATCHING || t === RelayCoilElm.TYPE_LATCHING_ON || t === RelayCoilElm.TYPE_LATCHING_OFF;
    }

    readonly nCoil1 = 0;
    readonly nCoil2 = 1;
    currentOffset1: number = 0;
    currentOffset2: number = 0;

    private elmList: CircuitElm[] = [];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.label = CustomLogicModel.unescape(st.nextToken());
            this.inductance = parseFloatStrict(st.nextToken());
            this.coilCurrent = parseFloatStrict(st.nextToken());
            this.onCurrent = parseFloatStrict(st.nextToken());
            this.coilR = parseFloatStrict(st.nextToken());
            this.offCurrent = parseFloatStrict(st.nextToken());
            this.switchingTime = parseFloatStrict(st.nextToken());
            this.type = parseIntStrict(st.nextToken());
            this.state = parseIntStrict(st.nextToken());
            this.switchPosition = parseIntStrict(st.nextToken());
            this.noDiagonal = true;
            this.ind = new Inductor(CircuitElm.sim);
            this.ind.setup(this.inductance, this.coilCurrent, Inductor.FLAG_BACK_EULER);
            this.allocNodes();
        } else {
            this.ind = new Inductor(CircuitElm.sim);
            this.inductance = 0.2;
            this.ind.setup(this.inductance, 0, Inductor.FLAG_BACK_EULER);
            this.noDiagonal = true;
            this.onCurrent = 0.02;
            this.offCurrent = 0.015;
            this.state = 0;
            this.label = "label";
            this.coilR = 20;
            this.switchingTime = 5e-3;
        }
        this.outline = this.newPointArray(4);
    }

    getDumpType(): number { return 425; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "lb", this.label);
        CircuitXMLSerializer.dumpAttr(elem, "in", this.inductance);
        CircuitXMLSerializer.dumpAttr(elem, "oc", this.onCurrent);
        CircuitXMLSerializer.dumpAttr(elem, "cr", this.coilR);
        CircuitXMLSerializer.dumpAttr(elem, "ofc", this.offCurrent);
        CircuitXMLSerializer.dumpAttr(elem, "swt", this.switchingTime);
        CircuitXMLSerializer.dumpAttr(elem, "tp", this.type);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        CircuitXMLSerializer.dumpAttr(elem, "ci", this.coilCurrent);
        CircuitXMLSerializer.dumpAttr(elem, "st", this.state);
        CircuitXMLSerializer.dumpAttr(elem, "sp", this.switchPosition);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.label = xml.parseStringAttr("lb", this.label) ?? this.label;
        this.inductance = xml.parseDoubleAttr("in", this.inductance);
        this.onCurrent = xml.parseDoubleAttr("oc", this.onCurrent);
        this.coilR = xml.parseDoubleAttr("cr", this.coilR);
        this.offCurrent = xml.parseDoubleAttr("ofc", this.offCurrent);
        this.switchingTime = xml.parseDoubleAttr("swt", this.switchingTime);
        this.type = xml.parseIntAttr("tp", this.type);
        this.coilCurrent = xml.parseDoubleAttr("ci", this.coilCurrent);
        this.state = xml.parseIntAttr("st", this.state);
        this.switchPosition = xml.parseIntAttr("sp", this.switchPosition);
        this.noDiagonal = true;
        this.ind = new Inductor(CircuitElm.sim);
        this.ind.setup(this.inductance, this.coilCurrent, Inductor.FLAG_BACK_EULER);
        this.allocNodes();
    }

    draw(g: Graphics): void {
        for (let i = 0; i !== 2; i++) {
            this.setVoltageColor(g, this.nodes[this.nCoil1 + i].v);
            CircuitElm.drawThickLine(g, this.coilLeads[i], this.coilPosts[i]);
        }
        this.setPowerColor(g, this.coilCurrent * (this.nodes[this.nCoil1].v - this.nodes[this.nCoil2].v));
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickLine(g, this.outline[0], this.outline[1]);
        CircuitElm.drawThickLine(g, this.outline[1], this.outline[2]);
        CircuitElm.drawThickLine(g, this.outline[2], this.outline[3]);
        CircuitElm.drawThickLine(g, this.outline[3], this.outline[0]);

        if (RelayCoilElm.isLatchingType(this.type)) {
            for (let i = 0; i !== 3; i++)
                CircuitElm.drawThickLine(g, this.extraPoints[i], this.extraPoints[i+1]);
            if (this.type === RelayCoilElm.TYPE_LATCHING_ON || this.type === RelayCoilElm.TYPE_LATCHING_OFF) {
                g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.whiteColor);
                g.drawString(this.type === RelayCoilElm.TYPE_LATCHING_ON ? "S" : "R", this.extraPoints[0].x+3, this.extraPoints[0].y+9);
            }
        } else if (this.type === RelayCoilElm.TYPE_ON_DELAY) {
            CircuitElm.drawThickLine(g, this.extraPoints[1], this.extraPoints[2]);
            CircuitElm.drawThickLine(g, this.extraPoints[0], this.extraPoints[2]);
            CircuitElm.drawThickLine(g, this.extraPoints[1], this.extraPoints[3]);
        } else if (this.type === RelayCoilElm.TYPE_OFF_DELAY) {
            g.fillRect(this.extraPoints[0].x, this.extraPoints[0].y,
                this.extraPoints[2].x - this.extraPoints[0].x, this.extraPoints[2].y - this.extraPoints[0].y);
        }

        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.whiteColor);
        if (this.x === this.x2)
            g.drawString(this.label, this.outline[2].x + 10, Math.trunc((this.y + this.y2) / 2) + 4);
        else {
            g.save();
            g.context.textAlign = "center";
            g.drawString(this.label, Math.trunc((this.x + this.x2) / 2), this.outline[1].y + 15);
            g.restore();
        }

        this.coilCurCount = this.updateDotCountImpl(this.coilCurrent, this.coilCurCount);
        if (this.coilCurCount !== 0) {
            this.drawDots(g, this.coilPosts[0], this.coilLeads[0], this.coilCurCount);
            this.drawDots(g, this.coilLeads[1], this.coilPosts[1], this.addCurCount(this.coilCurCount, this.currentOffset2));
        }

        this.drawPosts(g);
        this.setBbox(this.outline[0], this.outline[2], 0);
        this.adjustBbox(this.coilPosts[0], this.coilPosts[1]);
    }

    getCurrentIntoNode(n: number): number {
        return n === 0 ? -this.coilCurrent : this.coilCurrent;
    }

    setPoints(): void {
        super.setPoints();
        this.allocNodes();
        this.openhs = -this.dsign * 16;
        this.coilPosts = this.newPointArray(2);
        this.coilLeads = this.newPointArray(2);
        this.coilPosts[0] = this.point1;
        this.coilPosts[1] = this.point2;
        const boxSize = 32;
        const boxWScale = Math.min(0.4, 12.0 / this.dn);
        this.interpPoint(this.point1, this.point2, this.coilLeads[0], 0.5 - boxWScale);
        this.interpPoint(this.point1, this.point2, this.coilLeads[1], 0.5 + boxWScale);
        this.interpPoint(this.point1, this.point2, this.outline[0], 0.5 - boxWScale, -boxSize * this.dsign);
        this.interpPoint(this.point1, this.point2, this.outline[1], 0.5 + boxWScale, -boxSize * this.dsign);
        this.interpPoint(this.point1, this.point2, this.outline[3], 0.5 - boxWScale, +boxSize * this.dsign);
        this.interpPoint(this.point1, this.point2, this.outline[2], 0.5 + boxWScale, +boxSize * this.dsign);
        this.currentOffset1 = CircuitElm.distance(this.coilPosts[0], this.coilLeads[0]);
        this.currentOffset2 = this.currentOffset1 + CircuitElm.distance(this.coilLeads[0], this.coilLeads[1]);
        this.extraPoints = this.newPointArray(4);
        if (RelayCoilElm.isLatchingType(this.type)) {
            this.interpPoint(this.coilLeads[0], this.coilLeads[1], this.extraPoints[0], 0.3, 8);
            this.interpPoint(this.coilLeads[0], this.coilLeads[1], this.extraPoints[1], 0.3, 0);
            this.interpPoint(this.coilLeads[0], this.coilLeads[1], this.extraPoints[2], 0.7, 0);
            this.interpPoint(this.coilLeads[0], this.coilLeads[1], this.extraPoints[3], 0.7, -8);
        } else {
            this.extraPoints[0] = this.outline[0];
            this.extraPoints[3] = this.outline[1];
            this.interpPoint(this.coilLeads[0], this.coilLeads[1], this.extraPoints[1], 0, -boxSize + 12);
            this.interpPoint(this.coilLeads[0], this.coilLeads[1], this.extraPoints[2], 1, -boxSize + 12);
        }
    }

    getPost(n: number): Point { return this.coilPosts[n]; }
    getPostCount(): number { return 2; }
    getInternalNodeCount(): number { return 1; }

    reset(): void {
        super.reset();
        this.ind.reset();
        this.coilCurrent = this.coilCurCount = 0;
        this.d_position = this.i_position = 0;
        this.avgCurrent = 0;
    }

    stamp(): void {
        this.ind.stamp(this.nodes[this.nCoil1], this.nodes[this.nCoil3]);
        CircuitElm.sim.stampResistor(this.nodes[this.nCoil3], this.nodes[this.nCoil2], this.coilR);
        if (this.type === RelayCoilElm.TYPE_ON_DELAY) {
            this.switchingTimeOn = this.switchingTime;
            this.switchingTimeOff = 0;
        } else if (this.type === RelayCoilElm.TYPE_OFF_DELAY) {
            this.switchingTimeOff = this.switchingTime;
            this.switchingTimeOn = 0;
        } else {
            this.switchingTimeOff = this.switchingTimeOn = this.switchingTime;
        }
        // set/reset coils only drive the contact when they actually fire (see
        // startIteration); pushing their own switchPosition here on every
        // re-stamp would let the reset coil's stale value fight the set coil's
        if (this.type !== RelayCoilElm.TYPE_LATCHING_ON && this.type !== RelayCoilElm.TYPE_LATCHING_OFF)
            this.toggleSwitchPositions();
    }

    get nCoil3(): number { return 2; }

    startIteration(): void {
        this.ind.startIteration(this.nodes[this.nCoil1].v - this.nodes[this.nCoil3].v);
        const absCurrent = Math.abs(this.coilCurrent);
        const a = Math.exp(-CircuitElm.sim.timeStep * 1e3);
        this.avgCurrent = a * this.avgCurrent + (1 - a) * absCurrent;
        const oldSwitchPosition = this.switchPosition;
        if (this.state === 0) {
            if (this.avgCurrent > this.onCurrent) { this.lastTransition = CircuitElm.sim.t; this.state = 1; }
        } else if (this.state === 1) {
            if (this.avgCurrent < this.offCurrent) this.state = 0;
            else if (CircuitElm.sim.t - this.lastTransition > this.switchingTimeOn) {
                this.state = 2;
                if (this.type === RelayCoilElm.TYPE_LATCHING) {
                    this.switchPosition = 1 - this.switchPosition;
                } else if (this.type === RelayCoilElm.TYPE_LATCHING_ON) {
                    // set coil: always drive the contact to the "on" position
                    this.switchPosition = 1;
                    this.setSwitchPositions(0);
                } else if (this.type === RelayCoilElm.TYPE_LATCHING_OFF) {
                    // reset coil: always drive the contact to the "off" position
                    this.switchPosition = 0;
                    this.setSwitchPositions(1);
                } else {
                    this.switchPosition = 1;
                }
            }
        } else if (this.state === 2) {
            if (this.avgCurrent < this.offCurrent) { this.lastTransition = CircuitElm.sim.t; this.state = 3; }
        } else if (this.state === 3) {
            if (this.avgCurrent > this.onCurrent) this.state = 2;
            else if (CircuitElm.sim.t - this.lastTransition > this.switchingTimeOff) {
                this.state = 0;
                if (!RelayCoilElm.isLatchingType(this.type)) this.switchPosition = 0;
            }
        }
        if (this.type !== RelayCoilElm.TYPE_LATCHING_ON && this.type !== RelayCoilElm.TYPE_LATCHING_OFF && oldSwitchPosition !== this.switchPosition)
            this.toggleSwitchPositions();
    }

    setParentList(list: CircuitElm[]): void { this.elmList = list; }

    toggleSwitchPositions(): void {
        for (const ce of this.elmList) {
            if (ce instanceof RelayContactElm && (ce as RelayContactElm).label === this.label)
                (ce as RelayContactElm).setPosition(1 - this.switchPosition, this.type);
        }
    }

    // for set/reset coils: unconditionally drive matching contacts to an
    // explicit position, since a set/reset coil may fire without its own
    // switchPosition value actually changing
    setSwitchPositions(position: number): void {
        for (const ce of this.elmList) {
            if (ce instanceof RelayContactElm && (ce as RelayContactElm).label === this.label)
                (ce as RelayContactElm).setPosition(position, this.type);
        }
    }

    doStep(): void {
        this.ind.doStep(this.nodes[this.nCoil1].v - this.nodes[this.nCoil3].v);
    }

    calculateCurrent(): void {
        this.coilCurrent = this.ind.calculateCurrent(this.nodes[this.nCoil1].v - this.nodes[this.nCoil3].v);
    }

    getElmType(): string { return "relay"; }

    getInfo(arr: string[]): void {
        arr[0] = Locale.LS("relay");
        if (this.i_position === 0) arr[0] += " (" + Locale.LS("off") + ")";
        else if (this.i_position === 1) arr[0] += " (" + Locale.LS("on") + ")";
        arr[1] = Locale.LS("coil I") + " = " + CircuitElm.getCurrentDText(this.coilCurrent);
        arr[2] = Locale.LS("coil Vd") + " = " + CircuitElm.getVoltageDText(this.nodes[this.nCoil1].v - this.nodes[this.nCoil2].v);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Type", 0);
            ei.choice = new Choice();
            ei.choice.add("Normal");
            ei.choice.add("On Delay");
            ei.choice.add("Off Delay");
            ei.choice.add("Latching");
            ei.choice.add("Latching (Set Coil)");
            ei.choice.add("Latching (Reset Coil)");
            ei.choice.select(this.type);
            return ei;
        }
        if (n === 1) return new EditInfo("Inductance (H)", this.inductance, 0, 0).setPositive();
        if (n === 2) return new EditInfo("On Current (A)", this.onCurrent, 0, 0).setPositive();
        if (n === 3) return new EditInfo("Off Current (A)", this.offCurrent, 0, 0).setPositive();
        if (n === 4) return new EditInfo("Coil Resistance (ohms)", this.coilR, 0, 0).setPositive();
        if (n === 5) return new EditInfo("Switching Time (s)", this.switchingTime, 0, 0).setPositive();
        if (n === 6) return new EditInfo("Label (for linking)", this.label);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) { this.type = ei.choice!.getSelectedIndex(); this.setPoints(); }
        if (n === 1 && ei.value > 0) { this.inductance = ei.value; this.ind.setup(this.inductance, this.coilCurrent, Inductor.FLAG_BACK_EULER); }
        if (n === 2 && ei.value > 0) this.onCurrent = ei.value;
        if (n === 3 && ei.value > 0) this.offCurrent = ei.value;
        if (n === 4 && ei.value > 0) this.coilR = ei.value;
        if (n === 5 && ei.value > 0) this.switchingTime = ei.value;
        if (n === 6) this.label = ei.textf!.value;
    }

    getConnection(n1: number, n2: number): boolean { return true; }
}
