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
import { EditInfo } from "./EditInfo";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { chipStart } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

/** A bank of independent 2:1 multiplexers (A1/B1->Y1, A2/B2->Y2, ...) that all share a single
 * select line, like a 74157/74158 "quad 2-input multiplexer" generalized to any mux count.
 * Kept as its own element (rather than a mode bolted onto MultiplexerElm) since it only ever
 * has one select bit and doesn't need MultiplexerElm's bus-input/bus-output machinery. */
export class GangedMultiplexerElm extends ChipElm {
    static readonly FLAG_INVERTED_OUTPUT = 1 << 1;
    static readonly FLAG_STROBE          = 1 << 2;

    count: number = 1;
    strobe: number = -1;
    outputPin: number = 0;
    selectPin: number = 0;

    hasReset(): boolean { return false; }

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.setupPins();
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            try {
                this.count = parseInt(st!.nextToken());
            } catch (e) {}
            this.setupPins();
        }
    }

    getChipName(): string { return "Ganged Multiplexer"; }

    dump(): string { return super.dump() + " " + this.count; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ct", this.count);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.count = xml.parseIntAttr("ct", this.count);
        this.setupPins();
    }

    setupPins(): void {
        const G = GangedMultiplexerElm;
        if (!this.count)
            this.count = 1;
        const strobeCount   = this.hasFlag(G.FLAG_STROBE) ? 1 : 0;
        const invertedCount = this.hasFlag(G.FLAG_INVERTED_OUTPUT) ? this.count : 0;

        this.sizeX = 2;
        this.sizeY = this.count * 2 + 1;
        this.pins = new Array(this.count * 2 + 1 + this.count + invertedCount + strobeCount);

        let i: number, n: number;

        // A/B input pairs on west side
        for (i = 0; i < this.count; i++) {
            this.pins[i * 2]     = new Pin(this, i * 2, ChipElm.SIDE_W, "A" + (i + 1));
            this.pins[i * 2 + 1] = new Pin(this, i * 2 + 1, ChipElm.SIDE_W, "B" + (i + 1));
        }

        // single shared select pin on south side
        this.selectPin = this.count * 2;
        this.pins[this.selectPin] = new Pin(this, 0, ChipElm.SIDE_S, "S");

        // Y outputs on east side
        this.outputPin = this.selectPin + 1;
        for (i = 0; i < this.count; i++) {
            n = this.outputPin + i;
            this.pins[n] = new Pin(this, i * 2, ChipElm.SIDE_E, "Y" + (i + 1));
            this.pins[n].output = true;
        }

        if (this.hasFlag(G.FLAG_INVERTED_OUTPUT)) {
            for (i = 0; i < this.count; i++) {
                n = this.outputPin + this.count + i;
                this.pins[n] = new Pin(this, i * 2 + 1, ChipElm.SIDE_E, "Y" + (i + 1));
                this.pins[n].lineOver = true;
                this.pins[n].output = true;
                this.pins[n].bubble = true;
            }
        }

        if (this.hasFlag(G.FLAG_STROBE)) {
            n = this.outputPin + this.count + invertedCount;
            this.pins[n] = new Pin(this, 1, ChipElm.SIDE_S, "STR");
            this.strobe = n;
        } else
            this.strobe = -1;

        this.allocNodes();
    }

    getPostCount(): number {
        const G = GangedMultiplexerElm;
        const invertedCount = this.hasFlag(G.FLAG_INVERTED_OUTPUT) ? this.count : 0;
        const strobeCount   = this.hasFlag(G.FLAG_STROBE) ? 1 : 0;
        return this.count * 2 + 1 + this.count + invertedCount + strobeCount;
    }

    getVoltageSourceCount(): number {
        const G = GangedMultiplexerElm;
        let count = this.count;
        if (this.hasFlag(G.FLAG_INVERTED_OUTPUT))
            count += this.count;
        return count;
    }

    execute(): void {
        const G = GangedMultiplexerElm;
        const sel = this.pins[this.selectPin].value ? 1 : 0;
        const strobed = (this.strobe !== -1 && this.pins[this.strobe].value);
        for (let r = 0; r < this.count; r++) {
            const val = strobed ? false : this.pins[r * 2 + sel].value;
            this.pins[this.outputPin + r].value = val;
            if (this.hasFlag(G.FLAG_INVERTED_OUTPUT))
                this.pins[this.outputPin + this.count + r].value = !val;
        }
    }

    /** One direct 3-input mux cell per bank (select bit, a, b) - no buildMuxTree needed since
     * there's always exactly one select bit here, unlike MultiplexerElm's general N-bit case.
     * Strobe forces the bank's output low without a separate stage; inverted output is a
     * trailing NOT cell, mirroring execute()'s own logic. */
    digitalSynthesis(): DigitalSynthesis {
        const G = GangedMultiplexerElm;
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const selPin = this.selectPin + 1;
        const strobePin = this.strobe >= 0 ? this.strobe + 1 : 0;
        const desc: ChipDesc[] = [];

        for (let r = 0; r < this.count; r++) {
            const aPin = r * 2 + 1;
            const bPin = r * 2 + 2;
            const outPin = this.outputPin + r + 1;

            if (strobePin) {
                const logic: ChipLogic = (pin) => { pin[outPin] = pin[strobePin] ? 0 : (pin[selPin] ? pin[bPin] : pin[aPin]); };
                desc.push(chipStart(logic).inputPins(strobePin, selPin, aPin, bPin).outputPin(outPin).outputDelayNs(16.0, 18.0));
            } else {
                const logic: ChipLogic = (pin) => { pin[outPin] = pin[selPin] ? pin[bPin] : pin[aPin]; };
                desc.push(chipStart(logic).inputPins(selPin, aPin, bPin).outputPin(outPin).outputDelayNs(16.0, 18.0));
            }

            if (this.hasFlag(G.FLAG_INVERTED_OUTPUT)) {
                const invPin = this.outputPin + this.count + r + 1;
                const inv: ChipLogic = (pin) => { pin[invPin] = pin[outPin] ^ 1; };
                desc.push(chipStart(inv).inputPins(outPin).outputPin(invPin).outputDelayNs(16.0, 18.0));
            }
        }

        return { desc, pinMap };
    }

    getDumpType(): number { return 437; }
    getXmlDumpType(): string { return "gmux"; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Output Count", this.count, 1, 16).setDimensionless();
        if (n === 1)
            return EditInfo.createCheckbox("Inverted Output", this.hasFlag(GangedMultiplexerElm.FLAG_INVERTED_OUTPUT));
        if (n === 2)
            return EditInfo.createCheckbox("Strobe Pin", this.hasFlag(GangedMultiplexerElm.FLAG_STROBE));
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        const G = GangedMultiplexerElm;
        if (n === 0) {
            if (ei.value >= 1 && ei.value <= 16) {
                this.count = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be between 1 and 16");
            return;
        }
        if (n === 1) {
            this.flags = ei.changeFlag(this.flags, G.FLAG_INVERTED_OUTPUT);
            this.setupPins();
            this.setPoints();
            return;
        }
        if (n === 2) {
            this.flags = ei.changeFlag(this.flags, G.FLAG_STROBE);
            this.setupPins();
            this.setPoints();
            return;
        }
    }
}
