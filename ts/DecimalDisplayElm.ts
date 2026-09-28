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

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.bitCount = 4;
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

    draw(g: Graphics): void {
        this.drawChip(g);
        const xl = this.x + this.cspc + this.flippedSizeX * this.cspc;
        let yl   = this.y - this.cspc + this.flippedSizeY * this.cspc;
        if (this.isFlippedXY())
            yl += ((this.flags & ChipElm.FLAG_FLIP_Y) !== 0) ? -this.cspc / 2 : this.cspc / 2;
        g.save();
        g.setFont(new Font("SansSerif", 0, 15 * this.csize));
        g.setColor(CircuitElm.whiteColor);
        g.context.textBaseline = "middle";
        let value = 0;
        for (let i = 0; i !== this.bitCount; i++)
            if (this.pins[i].value)
                value |= 1 << i;
        let str: string;
        switch (this.displayMode) {
        case 1:  str = value.toString(16).toUpperCase(); break;
        case 2:  str = value.toString(8); break;
        default: str = String(value); break;
        }
        const w = g.context.measureText(str).width;
        g.drawString(str, xl + 5 * this.csize - w / 2, yl);
        g.restore();
    }

    dump(): string { return super.dump() + " " + this.bitCount + " " + this.displayMode; }

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
        this.sizeX = 3;
        this.sizeY = this.useBus() ? 2 : this.bitCount;
        this.pins  = new Array(this.bitCount);
        this.makeBitPins(this.bitCount, 0, ChipElm.SIDE_W, 0, "I", false, false, false);
        this.allocNodes();
    }

    getPostCount(): number { return this.bitCount ?? 0; }
    getDumpType(): number { return 419; }
    getVoltageSourceCount(): number { return 0; }

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
                    this.setupPins();
                    this.setPoints();
                }
            } else
                ei.setError("must be between 1 and 16");
            return;
        }
        if (n === 1)
            this.displayMode = ei.choice!.getSelectedIndex();
    }
}
