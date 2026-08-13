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
import { Checkbox } from "./Checkbox";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Locale } from "./Locale";
import { GroupPin, syncedValue } from "./digital/DigitalElm";
import type { Group, DigitalElmInstance } from "./digital/DigitalElm";

export class CounterElm extends ChipElm implements Group {
    invertreset: boolean = false;
    modulus: number = 0;

    // --- Group/GroupPin: digital fast-path scaffolding, dormant until a
    // future circuit-detection/wiring pass populates `inputs` and calls
    // initDigitalPins() - see DFlipFlopElm.ts for the same pattern.
    // inputs layout: [clk, reset, updown?] (updown present iff hasUpDown()).
    // digitalPins[k] is bit (bits-1-k) - i.e. digitalPins[0] is the MSB,
    // matching execute()'s own pins[2+k] <-> bit(bits-1-k) relationship
    // below (fixed regardless of the bitOrder display flag, since
    // makeBitPins() is always called with reversed=true for this chip).
    inputs: DigitalElmInstance[] = [];
    digitalPins: GroupPin[] = [];

    initDigitalPins(): void {
        this.digitalPins = Array.from({ length: this.bits }, (_, k) => new GroupPin(this, k));
    }

    /** Pure equivalent of execute() (see below) - computes the whole
     * register's next state without mutating anything. Kept memory O(bits)
     * via per-bit GroupPins (see doc.txt's CounterGroup design) even though
     * this evaluate() computes the whole word at once, same as any
     * synchronous multi-bit register's shared next-state logic must. */
    evaluate(pin: GroupPin, sender: DigitalElmInstance | null): boolean[] {
        const clk = this.inputs[0];
        const reset = this.inputs[1];
        const updown = this.hasUpDown() ? this.inputs[2] : null;
        const now = pin.scheduler.currentTime;
        const neg = this.negativeEdgeTriggered();

        const old = this.digitalPins.map(p => syncedValue(p, now));
        let next = old;
        if ((sender === null || sender === clk) && clk.transitionedTo(!neg, pin.lastChecked, now)) {
            let value = 0;
            old.forEach((b, k) => { if (b) value |= 1 << (this.bits - 1 - k); });
            const dir = (updown && syncedValue(updown, now)) ? -1 : 1;
            value += dir;
            if (this.modulus !== 0)
                value = ((value % this.modulus) + this.modulus) % this.modulus;
            next = Array.from({ length: this.bits }, (_, k) => (value & (1 << (this.bits - 1 - k))) !== 0);
        }
        if (syncedValue(reset, now) !== this.invertreset)
            next = new Array(this.bits).fill(false);
        return next;
    }

    /** Reset (and a direction flip, which changes the register's future
     * evolution just as fundamentally) must always demote every bit rather
     * than risk one slipping through on a lucky value match - same
     * reasoning as GroupPin.prepare()'s own docstring. */
    alwaysDemoteOn(sender: DigitalElmInstance): boolean {
        return sender === this.inputs[1] || (this.hasUpDown() && sender === this.inputs[2]);
    }
    static readonly FLAG_UP_DOWN       = 4;
    static readonly FLAG_NEGATIVE_EDGE = 8;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            this.invertreset = true;
            try {
                this.invertreset = st!.nextToken() === "true";
                this.modulus = parseInt(st!.nextToken());
            } catch (e) {}
            this.pins[1].bubble = this.invertreset;
        }
    }

    dump(): string {
        return super.dump() + " " + this.invertreset + " " + this.modulus;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "in", this.invertreset);
        CircuitXMLSerializer.dumpAttr(elem, "mo", this.modulus);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.invertreset = xml.parseBooleanAttr("in", this.invertreset);
        this.modulus = xml.parseIntAttr("mo", this.modulus);
        this.pins[1].bubble = this.invertreset;
    }

    needsBits(): boolean { return true; }
    allowBus(): boolean { return true; }

    getChipName(): string {
        if (this.modulus === 0)
            return "Counter";
        return Locale.LS("Counter") + Locale.LS(" (mod ") + this.modulus + ")";
    }

    setupPins(): void {
        if (!this.bits) return;
        this.sizeX = 2;
        this.sizeY = this.useBus() ? 3 : this.bits;
        this.pins = new Array(this.getPostCount());
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "");
        this.pins[0].clock = true;
        this.pins[0].bubble = this.negativeEdgeTriggered();
        this.pins[1] = new Pin(this, this.sizeY - 1, ChipElm.SIDE_W, "R");
        this.pins[1].bubble = this.invertreset;
        this.makeBitPins(this.bits, 0, ChipElm.SIDE_E, 2, "Q", true, true, true);
        if (this.hasUpDown())
            this.pins[this.bits + 2] = new Pin(this, this.sizeY - 2, ChipElm.SIDE_W, "U/D");
        this.allocNodes();
    }

    getPostCount(): number {
        return this.hasUpDown() ? this.bits + 3 : this.bits + 2;
    }

    getVoltageSourceCount(): number { return this.bits; }

    hasUpDown(): boolean { return this.hasFlag(CounterElm.FLAG_UP_DOWN); }
    negativeEdgeTriggered(): boolean { return this.hasFlag(CounterElm.FLAG_NEGATIVE_EDGE); }

    execute(): void {
        const neg = this.negativeEdgeTriggered();
        if (this.pins[0].value !== neg && this.lastClock === neg) {
            let value = 0;

            // get direction
            let dir = 1;
            if (this.hasUpDown() && this.pins[this.bits + 2].value)
                dir = -1;

            // get current value
            const lastBit = 2 + this.bits - 1;
            for (let i = 0; i !== this.bits; i++)
                if (this.pins[lastBit - i].value)
                    value |= 1 << i;

            // update value
            value += dir;
            if (this.modulus !== 0)
                value = ((value % this.modulus) + this.modulus) % this.modulus;

            // convert value to binary
            for (let i = 0; i !== this.bits; i++)
                this.pins[lastBit - i].value = (value & (1 << i)) !== 0;
        }
        if (!this.pins[1].value === this.invertreset) {
            for (let i = 0; i !== this.bits; i++)
                this.pins[i + 2].value = false;
        }
        this.lastClock = this.pins[0].value;
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Invert reset pin", this.invertreset);
            return ei;
        }
        if (n === 1)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        if (n === 2)
            return new EditInfo("Modulus", this.modulus, 1, 1).setDimensionless();
        if (n === 3) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Up/Down Pin", this.hasUpDown());
            return ei;
        }
        if (n === 4) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Negative Edge Triggered", this.negativeEdgeTriggered());
            return ei;
        }
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.invertreset = ei.checkbox!.getState();
            this.setupPins();
            this.setPoints();
        }
        if (n === 1) {
            if (ei.value >= 3) {
                this.bits = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be >= 3");
        }
        if (n === 2)
            this.modulus = Math.trunc(ei.value);
        if (n === 3) {
            this.flags = ei.changeFlag(this.flags, CounterElm.FLAG_UP_DOWN);
            this.setupPins();
            this.setPoints();
        }
        if (n === 4) {
            this.flags = ei.changeFlag(this.flags, CounterElm.FLAG_NEGATIVE_EDGE);
            this.setupPins();
            this.setPoints();
        }
    }

    getDumpType(): number { return 164; }
    getXmlDumpType(): string { return "ctr"; }
}
