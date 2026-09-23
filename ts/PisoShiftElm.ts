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

export class PisoShiftElm extends ChipElm {
    readonly FLAG_NEW_BEHAVIOR = 2;

    data: boolean[] = [];
    dataIndex: number = 0;
    clockState: boolean = false;
    loadState: boolean = false;
    dataPinIndex: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f, st);
        if (st !== undefined) {
            this.data = new Array<boolean>(this.bits).fill(false);
            ChipElm.readBits(st, this.data);
        } else {
            this.data = new Array<boolean>(this.bits).fill(false);
            this.flags |= this.FLAG_NEW_BEHAVIOR;
        }
        this.setupPins();
    }

    dumpXml(doc: Document, elem: Element): void { super.dumpXml(doc, elem); }

    dumpXmlState(doc: Document, elem: Element): void {
        super.dumpXmlState(doc, elem);
        const newData = new Array<boolean>(this.data.length).fill(false);
        for (let i = 0; i < this.data.length; i++)
            newData[i] = this.data[(i + this.dataIndex) % this.data.length];
        CircuitXMLSerializer.dumpAttr(elem, "dt", ChipElm.writeBitsToString(newData));
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.data = new Array<boolean>(this.bits).fill(false);
        this.dataIndex = 0;
        const dt = xml.parseStringAttr("dt", null);
        if (dt !== null)
            ChipElm.readBitsFromString(dt, this.data);
    }

    getDumpType(): number { return 186; }
    getChipName(): string { return "PISO shift register"; }
    needsBits(): boolean { return true; }
    defaultBitCount(): number { return 8; }
    hasNewBhvr(): boolean { return (this.flags & this.FLAG_NEW_BEHAVIOR) !== 0; }

    reset(): void {
        super.reset();
        this.data = new Array<boolean>(this.bits).fill(false);
    }

    setupPins(): void {
        this.sizeX = this.bits + 2;
        this.sizeY = 3;
        this.pins = new Array(this.getPostCount());

        this.pins[0] = new Pin(this, 1, ChipElm.SIDE_W, "LD");
        this.pins[1] = new Pin(this, 2, ChipElm.SIDE_W, "");
        this.pins[1].clock = true;

        this.pins[2] = new Pin(this, 1, ChipElm.SIDE_E, "Q" + (this.hasNewBhvr() ? this.bits - 1 : this.bits));
        this.pins[2].output = true;

        if (this.hasNewBhvr()) {
            this.pins[3] = new Pin(this, 0, ChipElm.SIDE_W, "SER");
            if (this.data && this.data.length > 0)
                this.pins[2].value = this.data[0];
            this.dataPinIndex = 4;
        } else {
            this.dataPinIndex = 3;
        }

        for (let i = 0; i < this.bits; i++)
            this.pins[this.dataPinIndex + i] = new Pin(this, this.bits - i, ChipElm.SIDE_N, "D" + (this.bits - (i + 1)));

        this.allocNodes();
    }

    getPostCount(): number { return (this.hasNewBhvr() ? 4 : 3) + this.bits; }
    getVoltageSourceCount(): number { return 1; }

    execute(): void {
        // LOAD raised
        if (this.pins[0].value !== this.loadState) {
            this.loadState = this.pins[0].value;
            if (this.loadState && this.data.length > 0) {
                if (this.hasNewBhvr()) {
                    this.pins[2].value = this.pins[this.dataPinIndex].value;
                    this.dataIndex = 0;
                } else {
                    this.dataIndex = -1;
                }
                for (let i = 0; i < this.data.length; i++)
                    this.data[i] = this.pins[this.dataPinIndex + i].value;
            }
        }
        // CLK raised
        if (this.pins[1].value !== this.clockState) {
            this.clockState = this.pins[1].value;
            if (this.clockState) {
                if (this.dataIndex >= 0)
                    this.data[this.dataIndex] = this.hasNewBhvr() && this.pins[3].value;
                this.dataIndex++;
                if (this.dataIndex >= this.data.length)
                    this.dataIndex = 0;
                this.pins[2].value = this.data[this.dataIndex];
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
            this.data = new Array<boolean>(this.bits).fill(false);
            this.setupPins();
            this.setPoints();
        }
    }
}
