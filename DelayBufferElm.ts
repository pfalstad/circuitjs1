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
import { CircuitNode } from "./CircuitNode";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { GateElm } from "./GateElm";
import { Locale } from "./Locale";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { withDigital, State } from "./digital/DigitalElm";
import type { DigitalElmInstance } from "./digital/DigitalElm";
import { digitalStateText, appendInfoLine } from "./digital/CircuitWiring";

export class DelayBufferElm extends withDigital(CircuitElm) {
    // CircuitWiring's isGateLike() check looks for .addInput + a numeric
    // .inputCount (same convention GateElm/InverterElm use) to find this
    // element's output post (nodes[inputCount]) - fixed 1-input/1-output,
    // matching stamp()/doStep()'s existing node convention.
    readonly inputCount = 1;

    delay: number = 0;
    threshold: number = 2.5;
    highVoltage: number = 5;
    center: Point;
    gatePoly: Polygon;
    delayEndTime: number;

    // --- Digital fast-path wiring ---
    //
    // Unlike GateElm/InverterElm (pure combinational: evaluate() is a
    // memoryless function of current input state), this element's whole
    // purpose IS a configurable delay - and, per doStep()'s existing analog
    // model, a glitch-filtering one: outState only follows a change in
    // inState once inState has held continuously for `delay` seconds
    // (delayEndTime gets pushed forward to t+delay every step the two
    // already match, so only a sustained mismatch that outlasts that
    // deadline commits - a bounce shorter than `delay` never reaches the
    // output at all).
    //
    // That's expressible as a genuinely PURE evaluate() - see
    // debouncedValueAt() below - which is what lets this element promote
    // like any other: the periodicity engine (tryPromote()/_advanceAndSchedule()
    // in digital/DigitalElm.ts) only requires evaluate() to be a
    // deterministic function of committed state, and this.inputs[0].history
    // (an append-only, already-committed log) qualifies just as much as
    // this.inputs[0].currentValue() does for a combinational gate - it's
    // just also looking a little further back in time. The one thing that
    // still needs a real override is inputUpdated(): the generic Passive
    // path re-evaluates only MIN_HOP_TICKS (1 tick) after an input change,
    // which models simple propagation delay, not a multi-tick debounce -
    // without scheduling our own check exactly delayTicks() out, a
    // confirmed transition would only get noticed (and its history entry
    // timestamped) whenever some UNRELATED later event happened to trigger
    // a re-evaluation, which is both late and non-deterministic. The
    // Active/Asleep path (Recheck-based reconfirmation) is left alone -
    // Recheck just calls evaluate() and compares, which already works
    // correctly regardless of how far evaluate() itself looks back.
    private delayTicks(): number {
        return Math.max(1, Math.round(this.delay / CircuitElm.sim.maxTimeStep));
    }

    /** DigitalElm's required evaluate(): the debounced/delayed value of the
     * input, falling back to the analog voltage threshold before
     * wireDigitalCircuit() has populated this.inputs - same fallback
     * InverterElm.evaluate() uses. */
    evaluate(sender?: DigitalElmInstance | null): boolean {
        if (this.inputs.length > 0)
            return this.debouncedValueAt(this.inputs[0], this.scheduler.currentTime);
        return this.nodes[0].v > this.threshold;
    }

    /** The value `input` had settled to as of `now`, applying this
     * buffer's own delay as a glitch filter: a transition only "confirms"
     * (and the value it introduces takes effect delayTicks() after it) if
     * no LATER transition preempts it within that same window - exactly
     * mirroring doStep()'s delayEndTime logic (see this class's header
     * comment), just expressed as a pure function over input.history
     * instead of a per-timestep running deadline. Pure and re-derivable at
     * any `now`: never mutates anything, so it's safe to call from
     * evaluate() as often as the periodicity engine likes (promotion
     * attempts, Recheck reconfirmation, backfill, ...) without needing any
     * bookkeeping of its own to stay consistent. */
    private debouncedValueAt(input: DigitalElmInstance, now: number): boolean {
        const delay = this.delayTicks();
        // An Asleep input stops appending to its own history live (that's
        // the whole point of Asleep - see digital/DigitalElm.ts) - reading
        // it without catching up first would silently miss every
        // transition that "happened" during sleep, exactly the same
        // staleness transitionedTo() already guards against. Missing that
        // here was a real bug found live: this buffer's own self-driven
        // Active ticks re-verify via evaluate() on every tick (see
        // prepare()'s "active" branch in digital/DigitalElm.ts), and an
        // Asleep input's un-backfilled history made that re-verification
        // see a stale value, spuriously demoting - then re-promoting, then
        // demoting again - so the buffer could never settle into Asleep
        // itself as long as something (e.g. a downstream consumer's own
        // Recheck) kept asking. Without a downstream consumer, vacuous
        // trust let the buffer reach Asleep before this could ever bite,
        // masking the bug entirely.
        if (input.state === State.Asleep) input._backfillHistory(now);
        const hist = input.history; // ascending [tick, value]
        if (hist.length === 0)
            return input.currentValue(); // never changed - nothing to debounce
        // Binary search: first index whose deadline (tick + delay) is
        // still in the future as of `now` - candidates are everything
        // before it.
        let lo = 0, hi = hist.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (hist[mid][0] + delay <= now) lo = mid + 1; else hi = mid;
        }
        for (let i = lo - 1; i >= 0; i--) {
            const [ti, vi] = hist[i];
            const nextTick = (i + 1 < hist.length) ? hist[i + 1][0] : null;
            if (nextTick !== null && nextTick < ti + delay)
                continue; // preempted by a later bounce before confirming - never reached the output
            return vi;
        }
        return false; // nothing confirmed yet - same before-first-entry default every DigitalElmInstance uses
    }

    /** Reacts to the input changing. The Active/Asleep case is exactly the
     * base class's own behavior (Recheck-based reconfirmation - see this
     * class's header comment for why that's fine as-is). The Passive case
     * schedules our own re-evaluation delayTicks() out - the earliest
     * moment this specific edge could possibly confirm - rather than the
     * generic MIN_HOP_TICKS. */
    inputUpdated(sender: DigitalElmInstance | null = null): void {
        if (this.state === State.Active || this.state === State.Asleep) {
            super.inputUpdated(sender);
            return;
        }
        this.scheduler.schedule(this.scheduler.currentTime + this.delayTicks(), this);
    }

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.noDiagonal = true;
            this.threshold = 2.5;
            this.highVoltage = 5;
        } else {
            super(xa, ya, xb, yb!, f!);
            this.noDiagonal = true;
            this.delay = parseFloat(st!.nextToken());
            this.threshold = 2.5;
            this.highVoltage = 5;
            try {
                this.threshold = parseFloat(st!.nextToken());
                this.highVoltage = parseFloat(st!.nextToken());
            } catch (e) {}
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "dl", this.delay);
        CircuitXMLSerializer.dumpAttr(elem, "th", this.threshold);
        CircuitXMLSerializer.dumpAttr(elem, "hv", this.highVoltage);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.delay = xml.parseDoubleAttr("dl", this.delay);
        this.threshold = xml.parseDoubleAttr("th", this.threshold);
        this.highVoltage = xml.parseDoubleAttr("hv", this.highVoltage);
    }

    getDumpType(): number { return 422; }
    setHighVoltage(hv: number): void { this.highVoltage = hv; }

    draw(g: Graphics): void {
        this.drawPosts(g);
        this.draw2Leads(g);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickPolygon(g, this.gatePoly);
        if (GateElm.useEuroGates())
            this.drawCenteredText(g, "1", this.center.x, this.center.y - 6, true);
        this.curcount = this.updateDotCountImpl(this.current, this.curcount);
        this.drawDots(g, this.lead2!, this.point2, this.curcount);
    }

    setPoints(): void {
        super.setPoints();
        const hs = 16;
        let ww = 16 - 2;
        if (ww > this.dn / 2)
            ww = Math.floor(this.dn / 2);
        this.lead1 = this.interpPoint(this.point1, this.point2, .5 - ww / this.dn);
        this.lead2 = this.interpPoint(this.point1, this.point2, .5 + ww / this.dn);

        if (GateElm.useEuroGates()) {
            const pts = this.newPointArray(4);
            const l2 = this.interpPoint(this.point1, this.point2, .5 + (ww - 5) / this.dn);
            this.interpPoint2(this.lead1!, l2, pts[0], pts[1], 0, hs);
            this.interpPoint2(this.lead1!, l2, pts[3], pts[2], 1, hs);
            this.gatePoly = this.createPolygon(pts);
            this.center = this.interpPoint(this.lead1!, l2, .5);
        } else {
            const triPoints = this.newPointArray(3);
            this.interpPoint2(this.lead1!, this.lead2!, triPoints[0], triPoints[1], 0, hs);
            triPoints[2] = this.interpPoint(this.point1, this.point2, .5 + ww / this.dn);
            this.gatePoly = this.createPolygon(triPoints);
        }
        this.setBbox(this.point1, this.point2, hs);
    }

    getVoltageSourceCount(): number { return 1; }

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[1], this.voltSource);
    }

    doStep(): void {
        let inState = this.nodes[0].v > this.threshold;
        let outState = this.nodes[1].v > this.threshold;
        if (inState !== outState) {
            if (CircuitElm.sim.t >= this.delayEndTime)
                outState = inState;
        } else
            this.delayEndTime = CircuitElm.sim.t + this.delay;
        CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[1], this.voltSource, outState ? this.highVoltage : 0);
    }

    getVoltageDiff(): number { return this.nodes[0].v; }

    getInfo(arr: string[]): void {
        arr[0] = Locale.LS("buffer");
        arr[1] = Locale.LS("delay = ") + CircuitElm.getUnitText(this.delay, "s");
        arr[2] = "Vi = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[3] = "Vo = " + CircuitElm.getVoltageText(this.nodes[1].v);
        appendInfoLine(arr, "opt: " + digitalStateText(this));
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Delay (s)", this.delay, 0, 0);
        if (n === 1)
            return new EditInfo("Threshold (V)", this.threshold, 0, 0);
        if (n === 2)
            return new EditInfo("High Logic Voltage", this.highVoltage, 0, 0).setUnitStep();
        if (n === 3)
            return EditInfo.createCheckbox("Digital Debug", this.digitalDebug);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.delay = ei.value;
        if (n === 1)
            this.threshold = ei.value;
        if (n === 2)
            this.highVoltage = ei.value;
        if (n === 3)
            this.digitalDebug = ei.checkbox.getState();
    }

    // there is no current path through the inverter input, but there
    // is an indirect path through the output to ground.
    getConnection(n1: number, n2: number): boolean { return false; }
    hasGroundConnection(n1: number): boolean { return n1 === 1; }

    getCurrentIntoNode(n: number): number {
        if (n === 1)
            return this.current;
        return 0;
    }
}
