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
import { Color } from "./Color";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CustomLogicModel } from "./CustomLogicModel";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { Point } from "./Point";
import { RelayCoilElm } from "./RelayCoilElm";
import { StringTokenizer } from "./StringTokenizer";
import { parseIntStrict, parseFloatStrict } from "./NumberParse";

export class RelayContactElm extends CircuitElm {
    r_on: number;
    r_off: number;
    swposts: Point[];
    swpoles: Point[];
    ptSwitch: Point;
    switchCurrent: number = 0;
    switchCurCount: number = 0;
    label: string;
    readonly FLAG_NORMALLY_CLOSED = 2;
    readonly FLAG_IEC = 4;
    type: number = 0;
    i_position: number = 0;
    openhs: number = 0;
    readonly nSwitch0 = 0;
    readonly nSwitch1 = 1;
    extraPoints: Point[];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.label = CustomLogicModel.unescape(st.nextToken());
            this.r_on = parseFloatStrict(st.nextToken());
            this.r_off = parseFloatStrict(st.nextToken());
            try { this.i_position = parseIntStrict(st.nextToken()); } catch (e) {}
            this.noDiagonal = true;
            this.allocNodes();
        } else {
            this.noDiagonal = true;
            this.r_on = 0.05;
            this.r_off = 1e6;
            this.label = "label";
            this.flags |= this.FLAG_IEC;
        }
    }

    getDumpType(): number { return 426; }
    useIECSymbol(): boolean { return (this.flags & this.FLAG_IEC) !== 0; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "lb", this.label);
        CircuitXMLSerializer.dumpAttr(elem, "ron", this.r_on);
        CircuitXMLSerializer.dumpAttr(elem, "roff", this.r_off);
        CircuitXMLSerializer.dumpAttr(elem, "ip", this.i_position);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.label = xml.parseStringAttr("lb", this.label) ?? this.label;
        this.r_on = xml.parseDoubleAttr("ron", this.r_on);
        this.r_off = xml.parseDoubleAttr("roff", this.r_off);
        this.i_position = xml.parseIntAttr("ip", this.i_position);
        this.noDiagonal = true;
        this.allocNodes();
    }

    draw(g: Graphics): void {
        for (let i = 0; i !== 2; i++) {
            this.setVoltageColor(g, this.nodes[this.nSwitch0 + i].v);
            CircuitElm.drawThickLine(g, this.swposts[i], this.swpoles[i]);
        }
        this.interpPoint(this.swpoles[1], this.swpoles[2], this.ptSwitch, this.i_position);
        g.setColor(Color.lightGray);
        CircuitElm.drawThickLine(g, this.swpoles[0], this.ptSwitch);

        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.whiteColor);
        if (this.x === this.x2)
            g.drawString(this.label, this.x + 10, this.swpoles[this.y < this.y2 ? 0 : 1].y - 5);
        else {
            g.save();
            g.context.textAlign = "center";
            g.drawString(this.label, Math.trunc((this.x + this.x2) / 2), this.y + 15);
            g.restore();
        }

        if (this.useIECSymbol() && (this.type === RelayCoilElm.TYPE_ON_DELAY || this.type === RelayCoilElm.TYPE_OFF_DELAY)) {
            g.setColor(Color.lightGray);
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[0], 0.5 - 2/32, this.i_position === 1 ? this.openhs/2 : 0);
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[1], 0.5 + 2/32, this.i_position === 1 ? this.openhs/2 : 0);
            g.drawLine(this.extraPoints[0], this.extraPoints[2]);
            g.drawLine(this.extraPoints[1], this.extraPoints[3]);
            g.context.beginPath();
            const ang = -Math.atan2(-this.dy * this.dsign, this.dx * this.dsign);
            const ds = 22 * this.dsign;
            if (this.type === RelayCoilElm.TYPE_OFF_DELAY) {
                this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[4], 0.5, ds + 6 * this.dsign);
                g.context.arc(this.extraPoints[4].x, this.extraPoints[4].y, 6, -Math.PI/8 + ang + Math.PI, Math.PI*9/8 + ang + Math.PI, true);
            } else {
                this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[4], 0.5, ds - 5 * this.dsign);
                g.context.arc(this.extraPoints[4].x, this.extraPoints[4].y, 6, -Math.PI/8 + ang, Math.PI*9/8 + ang, true);
            }
            g.context.stroke();
        }

        this.switchCurCount = this.updateDotCountImpl(this.switchCurrent, this.switchCurCount);
        this.drawDots(g, this.swposts[0], this.swpoles[0], this.switchCurCount);
        if (this.i_position === 0)
            this.drawDots(g, this.swpoles[this.i_position + 1], this.swposts[this.i_position + 1], this.switchCurCount);
        this.drawPosts(g);
        this.setBbox(this.point1, this.point2, this.openhs);
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0) return -this.switchCurrent;
        if (n === 1 + this.i_position) return this.switchCurrent;
        return 0;
    }

    setPoints(): void {
        super.setPoints();
        this.allocNodes();
        this.openhs = this.dsign * 16;
        this.calcLeads(32);
        this.swposts = [new Point(), new Point(), new Point()];
        this.swpoles = [new Point(), new Point(), new Point()];
        this.interpPoint(this.lead1!,  this.lead2!,  this.swpoles[0], 0, 0);
        this.interpPoint(this.lead1!,  this.lead2!,  this.swpoles[1], 1, 0);
        this.interpPoint(this.lead1!,  this.lead2!,  this.swpoles[2], 1, this.openhs);
        this.interpPoint(this.point1, this.point2, this.swposts[0], 0, 0);
        this.interpPoint(this.point1, this.point2, this.swposts[1], 1, 0);
        this.interpPoint(this.point1, this.point2, this.swposts[2], 1, this.openhs);
        this.ptSwitch = new Point();
        if (this.useIECSymbol()) {
            this.extraPoints = this.newPointArray(5);
            const ds = 22 * this.dsign;
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[2], 0.5 - 2/32, ds);
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[3], 0.5 + 2/32, ds);
        }
    }

    setPosition(i_position_: number, type_: number): void {
        this.i_position = this.isNormallyClosed() ? (1 - i_position_) : i_position_;
        this.type = type_;
    }

    isNormallyClosed(): boolean { return (this.flags & this.FLAG_NORMALLY_CLOSED) !== 0; }

    getPost(n: number): Point { return this.swposts[n]; }
    getPostCount(): number { return 2; }

    reset(): void {
        super.reset();
        this.switchCurrent = this.switchCurCount = 0;
        this.i_position = 0;
    }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[this.nSwitch0]);
        CircuitElm.sim.stampNonLinear(this.nodes[this.nSwitch1]);
    }

    nonLinear(): boolean { return true; }

    doStep(): void {
        CircuitElm.sim.stampResistor(this.nodes[this.nSwitch0], this.nodes[this.nSwitch1], this.i_position === 0 ? this.r_on : this.r_off);
    }

    calculateCurrent(): void {
        if (this.i_position === 1)
            this.switchCurrent = 0;
        else
            this.switchCurrent = (this.nodes[this.nSwitch0].v - this.nodes[this.nSwitch1 + this.i_position].v) / this.r_on;
    }

    getElmType(): string { return "relay"; }

    getInfo(arr: string[]): void {
        arr[0] = Locale.LS("relay");
        if (this.i_position === 0) arr[0] += " (" + Locale.LS("off") + ")";
        else if (this.i_position === 1) arr[0] += " (" + Locale.LS("on") + ")";
        arr[1] = "I = " + CircuitElm.getCurrentDText(this.switchCurrent);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("On Resistance (ohms)", this.r_on, 0, 0).setPositive();
        if (n === 1) return new EditInfo("Off Resistance (ohms)", this.r_off, 0, 0).setPositive();
        if (n === 2) return new EditInfo("Label (for linking)", this.label);
        if (n === 3) return EditInfo.createCheckbox("Normally Closed", this.isNormallyClosed());
        if (n === 4) return EditInfo.createCheckbox("IEC Symbol", this.useIECSymbol());
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0) this.r_on = ei.value;
        if (n === 1 && ei.value > 0) this.r_off = ei.value;
        if (n === 2) this.label = ei.textf!.value;
        if (n === 3) this.flags = ei.changeFlag(this.flags, this.FLAG_NORMALLY_CLOSED);
        if (n === 4) {
            this.flags = ei.changeFlag(this.flags, this.FLAG_IEC);
            this.setPoints();
        }
    }

    getConnection(n1: number, n2: number): boolean { return true; }
}
