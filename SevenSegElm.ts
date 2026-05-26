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

import { ChipElm, Pin } from "./ChipElm";
import { CircuitElm } from "./CircuitElm";
import { Diode } from "./Diode";
import { DiodeModel } from "./DiodeModel";
import { Color } from "./Color";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class SevenSegElm extends ChipElm {
    // base segment count not including decimal point or colon
    baseSegmentCount: number;

    // segment count including decimal point or colon
    segmentCount: number;

    extraSegment: number;
    static readonly ES_NONE  = 0;
    static readonly ES_DP    = 1;
    static readonly ES_COLON = 2;

    pinCount: number;
    commonPin: number;

    // 1 = common cathode, -1 = common anode, 0 = no diodes
    diodeDirection: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.setDefaults();
            this.setPinCount();
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            this.setDefaults();
            try {
                this.baseSegmentCount = parseInt(st!.nextToken());
                this.extraSegment     = parseInt(st!.nextToken());
                this.diodeDirection   = parseInt(st!.nextToken());
            } catch (e) {}
            this.setPinCount();
        }
    }

    setDefaults(): void {
        this.baseSegmentCount = this.segmentCount = 7;
        this.diodeDirection = 0;
    }

    dump(): string {
        return super.dump() + " " + this.baseSegmentCount + " " + this.extraSegment + " " + this.diodeDirection;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ba", this.baseSegmentCount);
        CircuitXMLSerializer.dumpAttr(elem, "ex", this.extraSegment);
        CircuitXMLSerializer.dumpAttr(elem, "di", this.diodeDirection);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.baseSegmentCount = xml.parseIntAttr("ba", this.baseSegmentCount);
        this.extraSegment     = xml.parseIntAttr("ex", this.extraSegment);
        this.diodeDirection   = xml.parseIntAttr("di", this.diodeDirection);
        this.setPinCount();
    }

    allowBus(): boolean { return this.diodeDirection === 0; }
    getChipName(): string { return this.segmentCount + "-segment display"; }
    darkred: Color;
    lightgray: Color;

    setupPins(): void {
        if (!this.pinCount)
            return;
        this.darkred   = new Color(30, 0, 0);
        this.lightgray = new Color(255 - 10, 255 - 10, 255 - 10);
        this.bits = this.segmentCount;

        if (this.useBus()) {
            this.sizeX = (this.baseSegmentCount === 7) ? 4 : 5;
            this.sizeY = (this.baseSegmentCount === 7) ? 4 : 6;
            this.pins = new Array(this.pinCount);
            this.makeBitPins(this.segmentCount, 0, ChipElm.SIDE_W, 0, "I", false, false, false);
            if (this.commonPin > 0)
                this.pins[this.commonPin] = new Pin(this, 1, ChipElm.SIDE_W, (this.diodeDirection === 1) ? "gnd" : "Vcc");
        } else {
            const segmentPinsOnLeftSide = Math.trunc((this.baseSegmentCount + 1) / 2);
            this.sizeY = segmentPinsOnLeftSide;
            if (this.baseSegmentCount === 7) {
                this.sizeX = 4;
                if (this.pinCount > 7)
                    this.sizeX = 5;
            } else
                this.sizeX = 5;

            // make room for common/dp/colon pins
            if (this.pinCount > this.sizeY * 2)
                this.sizeY++;

            this.pins = new Array(this.pinCount);
            let i: number;
            for (i = 0; i !== segmentPinsOnLeftSide; i++)
                this.pins[i] = new Pin(this, i, ChipElm.SIDE_W, String.fromCharCode('a'.charCodeAt(0) + i));

            // retain backward compatibility pin layout for old 7-segment setup, otherwise put pins on left and right side
            const backwardCompatibility = (this.segmentCount === 7 && this.diodeDirection === 0 && this.extraSegment === SevenSegElm.ES_NONE);
            let s = backwardCompatibility ? 1 : 0;
            for (; i !== this.segmentCount; i++)
                this.pins[i] = new Pin(this, s++, backwardCompatibility ? ChipElm.SIDE_S : ChipElm.SIDE_E, String.fromCharCode('a'.charCodeAt(0) + i));
            if (this.extraSegment === SevenSegElm.ES_DP)
                this.pins[this.segmentCount - 1].text = "dp";
            if (this.commonPin > 0) {
                let side = ChipElm.SIDE_E;
                if (this.segmentCount !== 7) {
                    side = ChipElm.SIDE_W;
                    s = segmentPinsOnLeftSide;
                }
                this.pins[this.commonPin] = new Pin(this, s++, side, (this.diodeDirection === 1) ? "gnd" : "Vcc");
            }
        }
    }

    drawSegment(g: Graphics, p1: Point, p2: Point, thick: number): void {
        g.context.beginPath();
        const p3 = new Point();
        const p4 = new Point();
        const p5 = new Point();
        const p6 = new Point();
        const dn = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        // from p1 to p2, calculate points several pixels from each end, offset from center of line on both sides
        this.interpPoint2(p1, p2, p3, p4, thick / dn, thick);
        this.interpPoint2(p1, p2, p5, p6, 1 - thick / dn, thick);
        g.context.moveTo(p1.x, p1.y);
        g.context.lineTo(p3.x, p3.y);
        g.context.lineTo(p5.x, p5.y);
        g.context.lineTo(p2.x, p2.y);
        g.context.lineTo(p6.x, p6.y);
        g.context.lineTo(p4.x, p4.y);
        g.context.lineTo(p1.x, p1.y);
        g.context.fill();
    }

    drawDecimal(g: Graphics, x: number, y: number, sp: number): void {
        g.context.beginPath();
        g.context.moveTo(x, y - sp);
        g.context.lineTo(x - sp, y);
        g.context.lineTo(x, y + sp);
        g.context.lineTo(x + sp, y);
        g.context.lineTo(x, y - sp);
        g.context.fill();
    }

    static readonly display7: number[] = [
        // x1, y1, x2, y2 for each segment
        0, 0, 2, 0,
        2, 0, 2, 1,
        2, 1, 2, 2,
        0, 2, 2, 2,
        0, 1, 0, 2,
        0, 0, 0, 1,
        0, 1, 2, 1
    ];
    static readonly display16: number[] = [
        0, 0, 1, 0,
        1, 0, 2, 0,
        2, 0, 2, 1,
        2, 1, 2, 2,
        2, 2, 1, 2,
        1, 2, 0, 2,
        0, 2, 0, 1,
        0, 1, 0, 0,
        0, 0, 1, 1,
        1, 0, 1, 1,
        2, 0, 1, 1,
        1, 1, 2, 1,
        1, 1, 2, 2,
        1, 1, 1, 2,
        1, 1, 0, 2,
        0, 1, 1, 1
    ];
    static readonly display14: number[] = [
        0, 0, 2, 0,
        2, 0, 2, 1,
        2, 1, 2, 2,
        2, 2, 0, 2,
        0, 2, 0, 1,
        0, 1, 0, 0,
        0, 0, 1, 1,
        1, 0, 1, 1,
        2, 0, 1, 1,
        1, 1, 2, 1,
        1, 1, 2, 2,
        1, 1, 1, 2,
        1, 1, 0, 2,
        0, 1, 1, 1
    ];

    diodes: Diode[];

    stamp(): void {
        super.stamp();

        if (this.diodeDirection === 0)
            return;
        this.diodes = new Array(this.segmentCount);
        const model = DiodeModel.getModelWithName("default-led");
        for (let i = 0; i !== this.segmentCount; i++) {
            this.diodes[i] = new Diode(CircuitElm.sim);
            this.diodes[i].setup(model);
            if (this.diodeDirection === 1)
                this.diodes[i].stamp(this.nodes[i], this.nodes[this.commonPin]);
            else
                this.diodes[i].stamp(this.nodes[this.commonPin], this.nodes[i]);
        }
    }

    doStep(): void {
        super.doStep();

        if (this.diodeDirection === 0)
            return;

        for (let i = 0; i !== this.segmentCount; i++)
            this.diodes[i].doStep(this.diodeDirection * (this.nodes[i].v - this.nodes[this.commonPin].v));
    }

    nonLinear(): boolean { return this.diodeDirection !== 0; }

    draw(g: Graphics): void {
        this.drawChip(g);
        g.setColor(Color.red);
        let spx = this.cspc * 2;

        // make room for dp/colon
        if (this.extraSegment !== SevenSegElm.ES_NONE)
            spx = Math.trunc(spx * .9);

        if (this.sizeY <= 4 || this.isFlippedXY())
            spx = Math.trunc(spx / 2);
        const spy = spx * 2;
        const xl = this.x + this.cspc + this.flippedSizeX * this.cspc - spx;
        let yl = this.y - this.cspc + this.flippedSizeY * this.cspc - spy;
        if (this.sizeY <= 4 && (this.flags & (ChipElm.FLAG_FLIP_Y | ChipElm.FLAG_FLIP_XY)) !== 0)
            yl += 10;
        const disp = (this.baseSegmentCount === 7) ? SevenSegElm.display7 :
                     (this.baseSegmentCount === 14) ? SevenSegElm.display14 : SevenSegElm.display16;
        const thick  = (this.sizeY <= 4) ? 5 : Math.trunc(spx / 6);
        const dpsize = (this.sizeY <= 4) ? 7 : this.isFlippedXY() ? 3 : 7;
        for (let step = 0; step !== 2; step++)
            for (let i = 0; i !== this.segmentCount; i++) {
                const i4 = i * 4;
                // draw diagonal lines in first pass, so the other lines overlap
                const diag = (disp[i4] !== disp[i4 + 2] && disp[i4 + 1] !== disp[i4 + 3]);
                if (diag !== (step === 0))
                    continue;
                this.setColor(g, i);
                this.drawSegment(g,
                    new Point(xl + disp[i4] * spx,     yl + disp[i4 + 1] * spy),
                    new Point(xl + disp[i4 + 2] * spx, yl + disp[i4 + 3] * spy),
                    thick);
            }
        if (this.extraSegment === SevenSegElm.ES_DP) {
            this.setColor(g, this.baseSegmentCount);
            const dist = Math.max(spx * 1.5, spx + 12);
            this.drawDecimal(g, xl + spx + dist, yl + spy * 2, dpsize);
        }
        if (this.extraSegment === SevenSegElm.ES_COLON) {
            this.setColor(g, this.baseSegmentCount);
            const dist = Math.max(spx * 1.5, spx + 14);
            this.drawDecimal(g, xl + spx + dist, yl + spy * .5,   dpsize);
            this.drawDecimal(g, xl + spx + dist, yl + spy * 1.5,  dpsize);
        }
    }

    calculateCurrent(): void {
        if (this.diodeDirection === 0 || this.diodes == null) {
            // no current
            for (let i = 0; i !== this.pinCount; i++)
                this.pins[i].current = 0;
            return;
        }

        // calculate diode currents
        this.pins[this.commonPin].current = 0;
        for (let i = 0; i !== this.segmentCount; i++) {
            this.pins[i].current = -this.diodeDirection * this.diodes[i].calculateCurrent(this.diodeDirection * (this.nodes[i].v - this.nodes[this.commonPin].v));
            this.pins[this.commonPin].current -= this.pins[i].current;
        }
    }

    getConnection(n1: number, n2: number): boolean {
        return this.diodeDirection !== 0;
    }

    stepFinished(): void {
        // stop for huge currents that make simulator act weird
        if (this.commonPin > 0 && Math.abs(this.pins[this.commonPin].current) > 1e12)
            CircuitElm.sim.stop("max current exceeded", this);
    }

    setColor(g: Graphics, p: number): void {
        const whiteBkg = this.isPrintable();
        if (this.diodeDirection === 0) {
            g.setColor(this.pins[p].value ? Color.red :
                whiteBkg ? this.lightgray : this.darkred);
            return;
        }
        // 10mA current = max brightness
        let w = -this.diodeDirection * this.pins[p].current / .01;
        if (w > 0)
            w = 255 * (1 + .2 * Math.log(w));
        if (w > 255)
            w = 255;
        const minw = whiteBkg ? 5 : 30;
        if (w < minw)
            w = minw;
        const wi = Math.trunc(w);
        const cc = whiteBkg ? new Color(255, 255 - wi, 255 - wi) : new Color(wi, 0, 0);
        g.setColor(cc);
    }

    getPostCount(): number { return this.pinCount ?? 0; }
    getVoltageSourceCount(): number { return 0; }
    getDumpType(): number { return 157; }
    getXmlDumpType(): string { return "ssd"; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Segments", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("7 Segment");
            ei.choice.add("14 Segment");
            ei.choice.add("16 Segment");
            ei.choice.select(this.baseSegmentCount === 7 ? 0 : this.baseSegmentCount === 14 ? 1 : 2);
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("Extra Segment", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("None");
            ei.choice.add("Decimal Point");
            ei.choice.add("Colon");
            ei.choice.select(this.extraSegment);
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("Diodes", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Common Cathode");
            ei.choice.add("Common Anode");
            ei.choice.add("None (logic inputs)");
            ei.choice.select(this.diodeDirection === 1 ? 0 : this.diodeDirection === -1 ? 1 : 2);
            return ei;
        }
        return super.getChipEditInfo(n);
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            const ix = ei.choice!.getSelectedIndex();
            this.baseSegmentCount = (ix === 0) ? 7 : (ix === 1) ? 14 : 16;
            this.setPinCount();
            return;
        }
        if (n === 1) {
            this.extraSegment = ei.choice!.getSelectedIndex();
            this.setPinCount();
            return;
        }
        if (n === 2) {
            const ix = ei.choice!.getSelectedIndex();
            this.diodeDirection = (ix === 0) ? 1 : (ix === 1) ? -1 : 0;
            this.setPinCount();
            return;
        }
        super.setChipEditValue(n, ei);
    }

    setPinCount(): void {
        this.segmentCount = this.baseSegmentCount;
        if (this.extraSegment > 0)
            this.segmentCount++;
        if (this.diodeDirection === 0) {
            this.pinCount  = this.segmentCount;
            this.commonPin = -1;
        } else {
            this.pinCount  = this.segmentCount + 1;
            this.commonPin = this.pinCount - 1;
        }
        this.allocNodes();
        this.setupPins();
        this.setPoints();
    }

    isDigitalChip(): boolean { return false; }
}
