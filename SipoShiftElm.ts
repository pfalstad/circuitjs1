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

// contributed by Edward Calver

import { ChipElm, Pin } from "./ChipElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { StringTokenizer } from "./StringTokenizer";

export class SipoShiftElm extends ChipElm {
    static readonly DATA_PIN_INDEX = 2;
    clockstate: boolean = false;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f, st);
        if (st !== undefined) {
            const data = new Array<boolean>(this.bits).fill(false);
            ChipElm.readBits(st, data);
            for (let i = 0; i < this.bits; i++)
                this.pins[SipoShiftElm.DATA_PIN_INDEX + i].value = data[i];
        }
    }

    dumpXml(doc: Document, elem: Element): void { super.dumpXml(doc, elem); }

    dumpXmlState(doc: Document, elem: Element): void {
        super.dumpXmlState(doc, elem);
        const data = new Array<boolean>(this.bits).fill(false);
        for (let i = 0; i < this.bits; i++)
            data[i] = this.pins[SipoShiftElm.DATA_PIN_INDEX + i].value;
        CircuitXMLSerializer.dumpAttr(elem, "dt", ChipElm.writeBitsToString(data));
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        const dt = xml.parseStringAttr("dt", null);
        if (dt !== null) {
            const data = new Array<boolean>(this.bits).fill(false);
            ChipElm.readBitsFromString(dt, data);
            for (let i = 0; i < this.bits; i++)
                this.pins[SipoShiftElm.DATA_PIN_INDEX + i].value = data[i];
        }
    }

    getDumpType(): number { return 189; }
    getChipName(): string { return "SIPO shift register"; }
    needsBits(): boolean { return true; }
    defaultBitCount(): number { return 8; }

    setupPins(): void {
        this.sizeX = this.bits + 1;
        this.sizeY = 3;
        this.pins = new Array(this.getPostCount());

        this.pins[0] = new Pin(this, 1, ChipElm.SIDE_W, "D");
        this.pins[1] = new Pin(this, 2, ChipElm.SIDE_W, "");
        this.pins[1].clock = true;

        for (let i = 0; i < this.bits; i++) {
            const prevVal = this.pins[SipoShiftElm.DATA_PIN_INDEX + i] ? this.pins[SipoShiftElm.DATA_PIN_INDEX + i].value : false;
            const pin = this.pins[SipoShiftElm.DATA_PIN_INDEX + i] = new Pin(this, i + 1, ChipElm.SIDE_N, "Q" + i);
            pin.value = prevVal;
            pin.output = true;
        }
        this.allocNodes();
    }

    getPostCount(): number { return 2 + this.bits; }
    getVoltageSourceCount(): number { return this.bits; }

    execute(): void {
        if (this.pins[1].value !== this.clockstate) {
            this.clockstate = this.pins[1].value;
            if (this.clockstate && this.bits > 0) {
                for (let i = this.bits - 2; i >= 0; i--)
                    this.pins[SipoShiftElm.DATA_PIN_INDEX + i + 1].value = this.pins[SipoShiftElm.DATA_PIN_INDEX + i].value;
                this.pins[2].value = this.pins[0].value;
            }
        }
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value !== this.bits && ei.value >= 1) {
            this.bits = Math.trunc(ei.value);
            this.setupPins();
            this.setPoints();
        }
    }
}
