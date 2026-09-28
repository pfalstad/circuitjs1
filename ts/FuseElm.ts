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
import { Color } from "./Color";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { StringTokenizer } from "./StringTokenizer";
import { parseFloatStrict } from "./NumberParse";

export class FuseElm extends CircuitElm {
    resistance: number;
    heat: number = 0;
    i2t: number;
    blown: boolean = false;
    readonly FLAG_IEC_SYMBOL = 1;
    readonly blownResistance = 1e9;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.resistance = parseFloatStrict(st.nextToken());
            this.i2t = parseFloatStrict(st.nextToken());
            this.heat = parseFloatStrict(st.nextToken());
            this.blown = st.nextToken() === "true";
        } else {
            // from https://m.littelfuse.com/~/media/electronics/datasheets/fuses/littelfuse_fuse_218_datasheet.pdf.pdf
            this.i2t = 6.73;
            this.resistance = 0.0613;
        }
    }

    dump(): string {
        return super.dump() + " " + this.resistance + " " + this.i2t + " " + this.heat + " " + this.blown;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "re", this.resistance);
        CircuitXMLSerializer.dumpAttr(elem, "i2", this.i2t);
        CircuitXMLSerializer.dumpAttr(elem, "he", this.heat);
        CircuitXMLSerializer.dumpAttr(elem, "bl", this.blown);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.resistance = xml.parseDoubleAttr("re", this.resistance);
        this.i2t = xml.parseDoubleAttr("i2", this.i2t);
        this.heat = xml.parseDoubleAttr("he", this.heat);
        this.blown = xml.parseBooleanAttr("bl", this.blown);
    }

    getDumpType(): number { return 404; }

    isIECSymbol(): boolean { return (this.flags & this.FLAG_IEC_SYMBOL) !== 0; }

    reset(): void {
        super.reset();
        this.heat = 0;
        this.blown = false;
    }

    setPoints(): void {
        super.setPoints();
        const llen = this.isIECSymbol() ? 32 : 16;
        this.calcLeads(llen);
    }

    getTempColor(g: Graphics): Color {
        const c = this.getVoltageColor(g, this.nodes[0].v);
        const temp = this.heat / this.i2t;
        if (temp < 0.3333) {
            const val = temp * 3;
            const x = Math.max(0, Math.trunc(255 * val));
            return new Color(x + (255 - x) * c.getRed() / 255, (255 - x) * c.getGreen() / 255, (255 - x) * c.getBlue() / 255);
        }
        if (temp < 0.6667) {
            const x = Math.max(0, Math.trunc((temp - 0.3333) * 3 * 255));
            return new Color(255, x, 0);
        }
        if (temp < 1) {
            const x = Math.max(0, Math.trunc((temp - 0.6666) * 3 * 255));
            return new Color(255, 255, x);
        }
        return Color.white;
    }

    draw(g: Graphics): void {
        const hs = 6;
        this.setBbox(this.point1, this.point2, hs);
        this.draw2Leads(g);

        const len = CircuitElm.distance(this.lead1!, this.lead2!);
        const ctx = g.context;
        ctx.save();
        ctx.lineWidth = 3.0;
        ctx.transform(
            (this.lead2!.x - this.lead1!.x) / len, (this.lead2!.y - this.lead1!.y) / len,
            -(this.lead2!.y - this.lead1!.y) / len, (this.lead2!.x - this.lead1!.x) / len,
            this.lead1!.x, this.lead1!.y
        );
        ctx.strokeStyle = this.getTempColor(g).getHexValue();
        if (!this.isIECSymbol()) {
            if (!this.blown) {
                const segments = 16;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                for (let i = 0; i <= segments; i++)
                    ctx.lineTo(i * len / segments, hs * Math.sin(i * Math.PI * 2 / segments));
                ctx.stroke();
            }
        } else {
            if (!this.blown) {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(len, 0);
                ctx.stroke();
                ctx.strokeRect(0, -hs, len, 2.0 * hs);
            }
        }
        ctx.restore();
        this.doDots(g);
        this.drawPosts(g);
    }

    calculateCurrent(): void {
        this.current = (this.nodes[0].v - this.nodes[1].v) / (this.blown ? this.blownResistance : this.resistance);
    }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[0]);
        CircuitElm.sim.stampNonLinear(this.nodes[1]);
    }

    nonLinear(): boolean { return true; }

    startIteration(): void {
        const i = this.getCurrent();

        // accumulate heat
        this.heat += i * i * CircuitElm.sim.timeStep;

        // dissipate heat.  we assume the fuse can dissipate its entire i2t in 3 seconds
        this.heat -= CircuitElm.sim.timeStep * this.i2t / 3;

        if (this.heat < 0)
            this.heat = 0;
        if (this.heat > this.i2t)
            this.blown = true;
    }

    doStep(): void {
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.blown ? this.blownResistance : this.resistance);
    }

    getElmType(): string { return "fuse"; }

    getInfo(arr: string[]): void {
        arr[0] = this.blown ? "fuse (blown)" : "fuse";
        this.getBasicInfo(arr);
        arr[3] = "R = " + CircuitElm.getUnitText(this.resistance, Locale.ohmString);
        arr[4] = "I2t = " + this.i2t;
        if (!this.blown)
            arr[5] = Math.trunc(this.heat * 100 / this.i2t) + "% " + Locale.LS("melted");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("I2t", this.i2t, 0, 0).setPositive();
        if (n === 1)
            return new EditInfo("Resistance", this.resistance, 0, 0).setPositive();
        if (n === 2)
            return EditInfo.createCheckbox("IEC Symbol", this.isIECSymbol());
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.i2t = ei.value;
        if (n === 1)
            this.resistance = ei.value;
        if (n === 2) {
            this.flags = ei.changeFlag(this.flags, this.FLAG_IEC_SYMBOL);
            this.setPoints();
        }
    }
}
