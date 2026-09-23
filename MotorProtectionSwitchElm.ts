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
import { RelayContactElm } from "./RelayContactElm";
import { StringTokenizer } from "./StringTokenizer";
import { parseFloatStrict } from "./NumberParse";

export class MotorProtectionSwitchElm extends CircuitElm {
    resistance: number;
    heats: number[];
    i2t: number;
    posts: Point[];
    leads: Point[];
    currents: number[];
    curcounts: number[];
    blown: boolean = false;
    label: string;
    readonly blownResistance = 1e9;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.resistance = parseFloatStrict(st.nextToken());
            this.i2t = parseFloatStrict(st.nextToken());
            this.blown = st.nextToken() === "true";
            this.label = "";
            try { this.label = CustomLogicModel.unescape(st.nextToken()); } catch (e) {}
        } else {
            this.i2t = 6.73;
            this.resistance = 0.0613;
            this.label = "";
        }
        this.heats = [0, 0, 0];
        this.currents = [0, 0, 0];
        this.curcounts = [0, 0, 0];
    }

    dump(): string {
        return super.dump() + " " + this.resistance + " " + this.i2t + " " + this.blown + " " + CustomLogicModel.escape(this.label);
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "re", this.resistance);
        CircuitXMLSerializer.dumpAttr(elem, "i2", this.i2t);
        CircuitXMLSerializer.dumpAttr(elem, "bl", this.blown);
        CircuitXMLSerializer.dumpAttr(elem, "la", this.label);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.resistance = xml.parseDoubleAttr("re", this.resistance);
        this.i2t = xml.parseDoubleAttr("i2", this.i2t);
        this.blown = xml.parseBooleanAttr("bl", this.blown);
        this.label = xml.parseStringAttr("la", this.label) ?? this.label;
    }

    getDumpType(): number { return 428; }

    reset(): void {
        super.reset();
        this.heats = [0, 0, 0];
        this.currents = [0, 0, 0];
        this.blown = false;
        this.setSwitchPositions();
    }

    setPoints(): void {
        super.setPoints();
        this.posts = new Array(6);
        this.leads = new Array(6);
        for (let i = 0; i !== 3; i++) {
            this.posts[i*2]   = new Point(this.x + i*48, this.y);
            this.posts[i*2+1] = new Point(this.x + i*48, this.y + 192);
            this.leads[i*2]   = new Point(this.x + i*48, this.y + 80);
            this.leads[i*2+1] = new Point(this.x + i*48, this.y + 176);
        }
    }

    getPostCount(): number { return 6; }
    getPost(n: number): Point { return this.posts[n]; }

    getTempColor(g: Graphics, num: number): Color {
        const c = this.getVoltageColor(g, this.nodes[num*2].v);
        const temp = this.heats[num] / this.i2t;
        if (temp < 0.3333) {
            const val = temp * 3;
            const x = Math.max(0, Math.trunc(255 * val));
            return new Color(x + (255-x)*c.getRed()/255, (255-x)*c.getGreen()/255, (255-x)*c.getBlue()/255);
        }
        if (temp < 0.6667) {
            const x = Math.max(0, Math.trunc((temp-0.3333)*3*255));
            return new Color(255, x, 0);
        }
        if (temp < 1) {
            const x = Math.max(0, Math.trunc((temp-0.6666)*3*255));
            return new Color(255, 255, x);
        }
        return Color.white;
    }

    draw(g: Graphics): void {
        const ctx = g.context;
        this.setBbox(this.posts[0], this.posts[5], 6);
        ctx.save();
        ctx.translate(this.x, this.y);
        const spx = 48;
        g.setLineDash(4, 4);
        const squareX = -spx - 12;
        const squareY = 48 - 12;

        g.setColor(Color.lightGray);
        g.drawLine(squareX+24+4, squareY+12, 48*2-(this.blown ? 8 : 0), squareY+12);
        g.drawLine(squareX+12, squareY+24+4, squareX+12, 80+48+48/2);
        g.drawLine(squareX+12, 80+48+48/2, -spx/2, 80+48+48/2);
        g.drawLine(squareX+12, 80+48/2, -spx/2, 80+48/2);
        g.setLineDash(0, 0);

        for (let i = 0; i !== 3; i++) {
            this.setVoltageColor(g, this.nodes[i*2].v);
            g.drawLine(i*spx, 0, i*spx, 32);
            if (this.blown) g.drawLine(i*spx-4, 32, i*spx+4, 32);
            const sw = this.blown ? 16 : 0;
            g.drawLine(i*spx-sw, 32, i*spx, 64);
            ctx.lineCap = "butt";
            g.drawLine(i*spx, 64, i*spx, 80);
            g.drawLine(i*spx-4, 16-4, i*spx+4, 16+4);
            g.drawLine(i*spx+4, 16-4, i*spx-4, 16+4);
            this.setVoltageColor(g, this.nodes[i*2+1].v);
            g.drawLine(i*spx, 176, i*spx, 192);
            ctx.lineCap = "round";
            g.setColor(this.getTempColor(g, i));
            g.drawLine(i*spx, 80, i*spx, 96);
            const q = 12;
            g.drawLine(i*spx-q, 96, i*spx, 96);
            g.drawLine(i*spx-q, 96, i*spx-q, 112);
            g.drawLine(i*spx-q, 112, i*spx, 112);
            g.drawLine(i*spx, 112, i*spx, 128);
            g.setColor(Color.lightGray);
            ctx.font = "italic 30px serif";
            ctx.textBaseline = "middle";
            ctx.textAlign = "center";
            g.drawString("I >", i*spx, 80+48+48/2);
        }
        g.setColor(Color.lightGray);
        for (let i = 0; i !== 3; i++)
            g.drawLine(-spx/2, 80+48*i, 2*spx+spx/2, 80+48*i);
        for (let i = 0; i !== 4; i++)
            g.drawLine(i*spx-spx/2, 80, i*spx-spx/2, 80+48*2);
        for (let i = 0; i !== 3; i++)
            g.drawLine(squareX+12*i, squareY, squareX+12*i, squareY+24);
        for (let i = 0; i !== 3; i++)
            g.drawLine(squareX, squareY+12*i, squareX+24, squareY+12*i);
        g.drawLine(squareX-spx/2, squareY+12, squareX, squareY+12);
        g.drawLine(squareX-spx/2, squareY, squareX-spx/2, squareY+24);
        ctx.font = "normal 12px sans-serif";
        g.setColor(Color.white);
        g.drawString(this.label, 120, squareY+12);
        ctx.restore();

        if (!this.blown) {
            for (let i = 0; i !== 3; i++) {
                this.curcounts[i] = this.updateDotCountImpl(this.currents[i], this.curcounts[i]);
                this.drawDots(g, this.posts[i*2],   this.leads[i*2],   this.curcounts[i]);
                this.drawDots(g, this.posts[i*2+1], this.leads[i*2+1], -this.curcounts[i]);
            }
        }

        this.setSwitchPositions();
        this.drawPosts(g);
    }

    calculateCurrent(): void {
        for (let i = 0; i !== 3; i++)
            this.currents[i] = (this.nodes[i*2].v - this.nodes[i*2+1].v) / (this.blown ? this.blownResistance : this.resistance);
    }

    stamp(): void {
        for (let i = 0; i !== 6; i++)
            CircuitElm.sim.stampNonLinear(this.nodes[i]);
    }

    nonLinear(): boolean { return true; }
    getConnection(n1: number, n2: number): boolean { return Math.trunc(n1/2) === Math.trunc(n2/2); }

    startIteration(): void {
        const wasBlown = this.blown;
        for (let j = 0; j !== 3; j++) {
            const i = this.currents[j];
            let heat = this.heats[j];
            heat += i * i * CircuitElm.sim.timeStep;
            heat -= CircuitElm.sim.timeStep * this.i2t / 3;
            if (heat < 0) heat = 0;
            if (heat > this.i2t) this.blown = true;
            this.heats[j] = heat;
        }
        if (this.blown !== wasBlown)
            this.setSwitchPositions();
    }

    setSwitchPositions(): void {
        const switchPosition = this.blown ? 0 : 1;
        for (const ce of CircuitElm.sim.elmList) {
            if (ce instanceof RelayContactElm && (ce as RelayContactElm).label === this.label)
                (ce as RelayContactElm).setPosition(switchPosition, RelayCoilElm.TYPE_NORMAL);
        }
    }

    doStep(): void {
        for (let i = 0; i !== 3; i++)
            CircuitElm.sim.stampResistor(this.nodes[i*2], this.nodes[i*2+1], this.blown ? this.blownResistance : this.resistance);
    }

    getInfo(arr: string[]): void {
        arr[0] = "motor protection switch";
        this.getBasicInfo(arr);
        arr[3] = "R = " + CircuitElm.getUnitText(this.resistance, Locale.ohmString);
        arr[4] = "I2t = " + this.i2t;
    }

    getCurrentIntoNode(n: number): number {
        return (n % 2 === 1) ? this.currents[Math.trunc(n/2)] : -this.currents[Math.trunc(n/2)];
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("I2t", this.i2t, 0, 0).setPositive();
        if (n === 1) return new EditInfo("On Resistance", this.resistance, 0, 0).setPositive();
        if (n === 2) return new EditInfo("Label (for linking)", this.label);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.i2t = ei.value;
        if (n === 1) this.resistance = ei.value;
        if (n === 2) this.label = ei.textf!.value;
    }

    canFlipX(): boolean { return false; }
    canFlipY(): boolean { return false; }
}
