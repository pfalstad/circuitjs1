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
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Locale } from "./Locale";
import { GroupPin, syncedValue, State } from "./digital/DigitalElm";
import type { Group, DigitalElmInstance } from "./digital/DigitalElm";
import { digitalStateText, appendInfoLine } from "./digital/CircuitWiring";

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

    // Persists across re-stamps (unlike digitalPins itself, rebuilt from
    // scratch by initDigitalPins() below - see DFlipFlopElm.ts for why).
    digitalDebugPins = false;

    // Dedicated clock-edge watermark, one per pin (index-matched to
    // digitalPins) - NOT the same thing as each pin's own generic
    // pin.lastChecked, and that distinction is load-bearing. See
    // evaluate()'s own comment below for why sharing the generic watermark
    // with clock-edge detection is a real bug: commit()'s "passive" branch
    // (digital/DigitalElm.ts) advances pin.lastChecked to `now` on EVERY
    // recompute regardless of what triggered it - including a reset-line
    // change, which evaluate() below deliberately does NOT check the clock
    // for. If a real clock edge happens to land on that exact same tick,
    // the reset-triggered recompute's pin.lastChecked = now silently
    // consumes it: transitionedTo()'s window is (since, until], exclusive
    // of `since`, so the next clock-triggered check - using since = that
    // same tick - can never see an edge that occurred AT it. The edge is
    // gone, permanently, with no increment ever applied for it. A real bug
    // found live: reproduced with a reset line and a clock edge landing on
    // the same tick, which the digital fast-path's own self-driven timing
    // made far more likely to actually coincide than it would under live
    // per-timestep simulation. Rebuilt fresh (like digitalPins itself) by
    // initDigitalPins() below, not persisted across re-stamps.
    private lastClockChecked: number[] = [];

    initDigitalPins(): void {
        this.digitalPins = Array.from({ length: this.bits }, (_, k) => new GroupPin(this, k));
        for (const p of this.digitalPins) p.digitalDebug = this.digitalDebugPins;
        this.lastClockChecked = new Array(this.bits).fill(0);
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
        // Use lastClockChecked, not pin.lastChecked, for the SAME reason
        // this field exists at all - see its own docstring. Falls back to
        // 0 (never checked) if initDigitalPins() didn't run for this pin
        // (e.g. a test building a CounterElm via Object.create() and
        // wiring digitalPins by hand) rather than crashing - matches
        // pin.lastChecked's own default-0 convention.
        const checkingClock = sender === null || sender === clk;
        if (checkingClock && clk.transitionedTo(!neg, this.lastClockChecked?.[pin.index] ?? 0, now)) {
            let value = 0;
            old.forEach((b, k) => { if (b) value |= 1 << (this.bits - 1 - k); });
            const dir = (updown && syncedValue(updown, now)) ? -1 : 1;
            value += dir;
            if (this.modulus !== 0)
                value = ((value % this.modulus) + this.modulus) % this.modulus;
            next = Array.from({ length: this.bits }, (_, k) => (value & (1 << (this.bits - 1 - k))) !== 0);
        }
        // Only mark the clock's window as checked through `now` when we
        // actually looked - a reset-only (or other non-clock) recompute
        // must leave this watermark untouched, so a later clock-triggered
        // check still covers the ground this one skipped.
        if (checkingClock) {
            if (!this.lastClockChecked) this.lastClockChecked = [];
            this.lastClockChecked[pin.index] = now;
        }
        if (syncedValue(reset, now) !== this.invertreset)
            next = new Array(this.bits).fill(false);
        return next;
    }

    /** modulus*clockPeriod is the register's true period whenever it wraps
     * via an explicit modulus rather than plain binary overflow - but
     * nothing about that is derivable from provenInputs' own cycleTimes
     * (tryPromote()'s generic LCM candidate only sees the CLOCK's period,
     * with no visibility into this element's own modulus configuration).
     * Left to empirical guessing alone, a non-power-of-2 modulus's
     * wraparound-driven irregularity (some bit's simple alternating
     * pattern skips a beat once per full cycle) can go completely
     * unobserved for many candidate periods before the wraparound is ever
     * seen even once, letting a much shorter, purely coincidental period
     * match and lock in - see tryPromote()'s own docstring for a real bug
     * found exactly this way. Restricted to the case this reasoning
     * actually covers: a fixed, single-direction count (hasUpDown() lets
     * the count direction reverse mid-cycle, which this simple
     * modulus*clockPeriod formula doesn't account for) driven by an
     * already-proven periodic clock. */
    extraPromotionCandidates(pin: GroupPin): number[] {
        if (this.modulus === 0 || this.hasUpDown()) return [];
        const clk = this.inputs[0];
        if (!clk || !((clk.state === State.Active || clk.state === State.Asleep) && clk.cycleTime > 0))
            return [];
        return [this.modulus * clk.cycleTime];
    }

    /** Reset (and a direction flip, which changes the register's future
     * evolution just as fundamentally) must always demote every bit rather
     * than risk one slipping through on a lucky value match - same
     * reasoning as GroupPin.prepare()'s own docstring. */
    alwaysDemoteOn(sender: DigitalElmInstance): boolean {
        return sender === this.inputs[1] || (this.hasUpDown() && sender === this.inputs[2]);
    }

    /** Same propagation-delay modeling as GateElm.propagationDelayTicks() (seconds ->
     * ticks, floored at 1 - see the Digital mixin's own propagationDelayTicks()
     * docstring), applied here via the Group hook since a counter's pins
     * are individually-tracked GroupPins rather than the chip itself. */
    propagationDelay: number = 0;
    propagationDelayTicks(pin: GroupPin): number {
        const step = CircuitElm.sim?.maxTimeStep;
        if (!step) return 1;
        return Math.max(1, Math.round(this.propagationDelay / step));
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        // One line per bit (not a summary): with limited horizontal room in
        // the info box, a combined "opt: Active x3, Asleep x1"-style line
        // doesn't say WHICH bit is the odd one out, which is exactly what
        // matters when tracking down why a specific bit isn't sleeping.
        // Uses each pin's own real label (pins[i].text, e.g. "Q0") rather
        // than a made-up index - digitalPins[k]'s corresponding Q-number
        // depends on the Bit Order setting (MSB/LSB first), so only the
        // pin's own text is guaranteed to match what's actually drawn on
        // the chip.
        let k = 0;
        for (const pin of this.pins) {
            if (!pin.output) continue;
            appendInfoLine(arr, `${pin.text}: ${digitalStateText(this.digitalPins[k])}`);
            k++;
        }
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
        if (n === 5) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Digital Debug", this.digitalDebugPins);
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
        if (n === 5) {
            this.digitalDebugPins = ei.checkbox!.getState();
            for (const p of this.digitalPins) p.digitalDebug = this.digitalDebugPins;
        }
    }

    getDumpType(): number { return 164; }
    getXmlDumpType(): string { return "ctr"; }
}
