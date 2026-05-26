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
import { StringTokenizer } from "./StringTokenizer";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Locale } from "./Locale";

export class Counter2Elm extends ChipElm {
    modulus: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
            try {
                this.modulus = parseInt(st!.nextToken());
            } catch (e) {}
        }
    }

    dump(): string {
        return super.dump() + " " + this.modulus;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "mo", this.modulus);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.modulus = xml.parseIntAttr("mo", this.modulus);
    }

    needsBits(): boolean { return true; }
    allowBus(): boolean { return true; }
    getChipName(): string {
        if (this.modulus === 0)
            return "Counter";
        return Locale.LS("Counter") + Locale.LS(" (mod ") + this.modulus + ")";
    }

    clk: number = 0;
    clr: number = 0;
    enp: number = 0;
    ent: number = 0;
    rco: number = 0;
    load: number = 0;

    setupPins(): void {
        this.sizeX = 2;
        const bitsY = this.useBus() ? 1 : this.bits;
        this.sizeY = bitsY + 3;
        this.pins = new Array(this.getPostCount());
        this.makeBitPins(this.bits, 1, ChipElm.SIDE_E, 0,         "Q", true,  true,  true);
        this.makeBitPins(this.bits, 1, ChipElm.SIDE_W, this.bits, "I", false, false, true);
        const p = this.bits * 2;
        this.clk  = p;
        this.clr  = p + 1;
        this.enp  = p + 2;
        this.rco  = p + 3;
        this.load = p + 4;
        this.ent  = p + 5;
        this.pins[this.clk] = new Pin(this, 0, ChipElm.SIDE_W, "");
        this.pins[this.clk].clock = true;
        this.pins[this.clr] = new Pin(this, bitsY + 1, ChipElm.SIDE_W, "CLR");
        this.pins[this.clr].bubble = true;
        this.pins[this.enp] = new Pin(this, bitsY + 2, ChipElm.SIDE_W, "EnP");
        this.pins[this.rco] = new Pin(this, 0, ChipElm.SIDE_E, "RCO");
        this.pins[this.rco].output = true;
        this.pins[this.load] = new Pin(this, bitsY + 1, ChipElm.SIDE_E, "LOAD");
        this.pins[this.load].bubble = true;
        this.pins[this.ent] = new Pin(this, bitsY + 2, ChipElm.SIDE_E, "EnT");
    }
    getPostCount(): number {
        return this.bits * 2 + 6;
    }
    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        if (n === 1)
            return new EditInfo("Modulus", this.modulus, 1, 1).setDimensionless();
        return null;
    }
    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 2) {
                this.bits = Math.floor(ei.value);
                this.setupPins();
                this.setPoints();
                this.allocNodes();
            } else
                ei.setError("must be >= 2");
        }
        if (n === 1)
            this.modulus = Math.floor(ei.value);
    }
    getVoltageSourceCount(): number { return this.bits + 1; }

    carry: boolean = false;

    execute(): void {
        if (this.pins[this.clk].value && !this.lastClock) {
            if (this.pins[this.enp].value && this.pins[this.ent].value) {
                let value = 0;

                // get current value
                const lastBit = this.bits - 1;
                for (let i = 0; i !== this.bits; i++)
                    if (this.pins[lastBit - i].value)
                        value |= 1 << i;

                // update value
                value++;
                const realmod = (this.modulus === 0) ? (1 << this.bits) : this.modulus;
                value %= realmod;

                // convert value to binary
                for (let i = 0; i !== this.bits; i++)
                    this.writeOutput(lastBit - i, (value & (1 << i)) !== 0);

                this.carry = (value === realmod - 1);
            }

            if (!this.pins[this.load].value) {
                for (let i = 0; i !== this.bits; i++)
                    this.writeOutput(i, this.pins[i + this.bits].value);

                let value = 0;

                // get current value
                const lastBit = this.bits - 1;
                for (let i = 0; i !== this.bits; i++)
                    if (this.pins[lastBit - i].value)
                        value |= 1 << i;

                const realmod = (this.modulus === 0) ? (1 << this.bits) : this.modulus;

                this.carry = (value === realmod - 1);
            }
        }
        if (!this.pins[this.clr].value) {
            for (let i = 0; i !== this.bits; i++)
                this.writeOutput(i, false);
            this.carry = false;
        }

        this.lastClock = this.pins[this.clk].value;
        this.writeOutput(this.rco, this.carry && this.pins[this.ent].value);
    }
    getDumpType(): number { return 421; }
    getXmlDumpType(): string { return "ctr2"; }
}
