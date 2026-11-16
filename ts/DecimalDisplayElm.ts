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

import { ChipElm } from "./ChipElm";
import { CircuitElm } from "./CircuitElm";
import { Font } from "./Font";
import { Graphics } from "./Graphics";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { parseIntStrict } from "./NumberParse";

export class DecimalDisplayElm extends ChipElm {
    bitCount: number;
    displayMode: number = 0; // 0=decimal, 1=hex, 2=octal

    // the chip is made wide enough for the largest value.  (without this, as in circuits saved
    // before that was done, it's always 3 wide; set when the bit count or mode is changed)
    static readonly FLAG_ALLOW_WIDE = 1 << 1;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.bitCount = 4;
            this.flags |= DecimalDisplayElm.FLAG_ALLOW_WIDE;
            this.setupPins();
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            this.bitCount = 4;
            try {
                this.bitCount    = parseIntStrict(st!.nextToken());
                this.displayMode = parseIntStrict(st!.nextToken());
            } catch (e) {}
            this.setupPins();
        }
    }

    getChipName(): string {
        switch (this.displayMode) {
        case 1:  return "hex display";
        case 2:  return "octal display";
        default: return "decimal display";
        }
    }

    getRadix(): number {
        switch (this.displayMode) {
        case 1:  return 16;
        case 2:  return 8;
        default: return 10;
        }
    }

    // number of digits needed for the largest value we can show
    maxDigits(): number {
        return (2 ** this.bitCount - 1).toString(this.getRadix()).length;
    }

    draw(g: Graphics): void {
        this.drawChip(g);
        let value = 0;
        for (let i = 0; i !== this.bitCount; i++)
            if (this.pins[i].value)
                value += 2 ** i;
        const str = value.toString(this.getRadix()).toUpperCase();

        // the space inside the chip that isn't taken by the pin labels
        let x1 = this.rectPointsX[0], x2 = this.rectPointsX[2];
        let y1 = this.rectPointsY[0], y2 = this.rectPointsY[2];
        // which side the pins (and so their labels) are on, after any flipping
        const post = this.pins[0].post;
        const left = post.x < x1, right = post.x > x2;
        if (left || right) {
            g.setFont(new Font("normal", 0, 10 * this.csize));
            let labelW = 0;
            for (let i = 0; i !== this.getPostCount(); i++) {
                const p = this.pins[i];
                if (p.busZ > 0)
                    continue;
                const text = p.busWidth > 1 ? p.text + "/" + p.busWidth : p.text;
                labelW = Math.max(labelW, g.context.measureText(text).width);
            }
            const band = 5 + labelW + 3 * this.csize;
            if (left)
                x1 += band;
            else
                x2 -= band;
        } else if (post.y < y1)
            y1 += this.cspc2;
        else
            y2 -= this.cspc2;

        g.save();
        let fsz = 15 * this.csize;
        g.setFont(new Font("SansSerif", 0, fsz));
        g.setColor(CircuitElm.whiteColor);
        g.context.textBaseline = "middle";
        const avail = x2 - x1 - 4 * this.csize;
        let w = g.context.measureText(str).width;
        if (w > avail && avail > 0) {
            fsz = Math.max(6, Math.floor(fsz * avail / w));
            g.setFont(new Font("SansSerif", 0, fsz));
            w = g.context.measureText(str).width;
        }
        g.drawString(str, (x1 + x2) / 2 - w / 2, (y1 + y2) / 2);
        g.restore();
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "bc", this.bitCount);
        CircuitXMLSerializer.dumpAttr(elem, "dm", this.displayMode);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.bitCount    = xml.parseIntAttr("bc", this.bitCount);
        this.displayMode = xml.parseIntAttr("dm", this.displayMode);
        this.setupPins();
    }

    getXmlDumpType(): string { return "dd"; }
    allowBus(): boolean { return true; }

    setupPins(): void {
        if (!this.bitCount)
            return;
        // wide enough for the pin labels plus the largest value.  (in units of csize: a grid
        // unit is 16, a digit is about 8.4, and the labels and margins take about 22, or 27
        // for two-digit pin numbers)
        const labels = this.bitCount > 10 ? 27 : 22;
        this.sizeX = !this.hasFlag(DecimalDisplayElm.FLAG_ALLOW_WIDE) ? 3 :
            Math.max(3, Math.ceil((labels + 8.4 * this.maxDigits()) / 16));
        this.sizeY = this.useBus() ? 2 : this.bitCount;
        this.pins  = new Array(this.bitCount);
        this.makeBitPins(this.bitCount, 0, ChipElm.SIDE_W, 0, "I", false, false, false);
        this.allocNodes();
    }

    getPostCount(): number { return this.bitCount ?? 0; }
    getDumpType(): number { return 419; }
    getVoltageSourceCount(): number { return 0; }
    allowsPinLayout(): boolean { return false; }

    showPropertiesOnCreate(): boolean { return false; }
    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Bits", this.bitCount, 1, 8).setDimensionless();
        if (n === 1) {
            const ei = new EditInfo("Display Mode", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Decimal");
            ei.choice.add("Hexadecimal");
            ei.choice.add("Octal");
            ei.choice.select(this.displayMode);
            return ei;
        }
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 1 && ei.value <= 16) {
                const newBitCount = Math.trunc(ei.value);
                if (newBitCount !== this.bitCount) {
                    this.bitCount = newBitCount;
                    this.flags |= DecimalDisplayElm.FLAG_ALLOW_WIDE;
                    this.setupPins();
                    this.setPoints();
                }
            } else
                ei.setError("must be between 1 and 16");
            return;
        }
        if (n === 1) {
            const mode = ei.choice!.getSelectedIndex();
            if (mode !== this.displayMode) {
                this.displayMode = mode;
                this.flags |= DecimalDisplayElm.FLAG_ALLOW_WIDE;
                this.setupPins();
                this.setPoints();
            }
        }
    }
}
