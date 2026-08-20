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
import { withDigital } from "./digital/DigitalElm";
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
    // memoryless function of current input state, with the generic
    // Passive/Active machinery in DigitalElm.ts applying a fixed one-tick
    // propagation delay), this element's whole purpose IS a configurable
    // delay - and, per doStep()'s existing analog model, a glitch-filtering
    // one: outState only follows a change in inState once inState has held
    // continuously for `delay` seconds, since delayEndTime gets pushed
    // forward to t+delay every step the two already match, and only a
    // sustained mismatch that outlasts that deadline commits. That needs
    // its own pending-transition bookkeeping rather than the generic
    // evaluate()-driven promotion path, so this class overrides
    // inputUpdated()/prepare()/commit() outright instead of just evaluate()
    // - and, as a consequence, never calls tryPromote(): it stays
    // permanently Passive (always correct, just not self-scheduling/
    // sleepable the way a promoted gate can become). Downstream elements
    // reading this buffer's output are unaffected - they still see a
    // normal DigitalElmInstance and can promote around it as usual.
    private pendingTarget: boolean | null = null;
    // The scheduled tick the current pendingTarget is due to commit at. Not
    // redundant with pendingTarget: since scheduled events can't be
    // cancelled (Scheduler has no such primitive), an earlier pending
    // transition's now-obsolete event can still be sitting in the queue
    // when a LATER, unrelated edge happens to schedule the very same target
    // value again - matching pendingTarget alone would let that old event
    // fire the new transition too early. Comparing against the exact
    // deadline this specific pending transition was scheduled for is what
    // actually distinguishes "the event I'm expecting" from "some other,
    // stale event that happens to agree on the value."
    private pendingDeadline = -1;

    private delayTicks(): number {
        return Math.max(1, Math.round(this.delay / CircuitElm.sim.maxTimeStep));
    }

    resetDigital(): void {
        super.resetDigital();
        this.pendingTarget = null;
        this.pendingDeadline = -1;
    }

    /** DigitalElm's required evaluate(): the input's current live value,
     * falling back to the analog voltage threshold before wireDigitalCircuit()
     * has populated this.inputs - same thin-wrapper pattern as
     * InverterElm.evaluate(). This buffer's actual delay/glitch-filtering
     * behavior lives in inputUpdated()/prepare()/commit() below, not here -
     * evaluate() itself is just "what does the input say right now." */
    evaluate(sender?: DigitalElmInstance | null): boolean {
        if (this.inputs.length > 0)
            return this.inputs[0].currentValue();
        return this.nodes[0].v > this.threshold;
    }

    /** Reacts to the input changing. If the input is back to matching our
     * current output, any pending transition is moot - cancel it (mirrors
     * doStep()'s delayEndTime being pushed forward whenever inState ===
     * outState). Otherwise, if this isn't already the pending target
     * (e.g. a redundant notification), start a fresh delay window: schedule
     * a check delayTicks() from now, and remember what value it should
     * commit to if the input is still there when it fires. */
    inputUpdated(sender: DigitalElmInstance | null = null): void {
        const inputVal = this.evaluate();
        if (this.digitalDebug)
            console.log("[digital] DelayBufferElm inputUpdated", "value=", this.value,
                "inputVal=", inputVal, "pendingTarget=", this.pendingTarget);
        if (inputVal === this.value) {
            this.pendingTarget = null;
            return;
        }
        if (this.pendingTarget === inputVal) return;
        this.pendingTarget = inputVal;
        this.pendingDeadline = this.scheduler.currentTime + this.delayTicks();
        this.scheduler.schedule(this.pendingDeadline, this);
    }

    /** Phase 1: is the pending transition still live? Re-reads the input
     * live (rather than trusting the `inputVal` captured back when this was
     * scheduled) since a later bounce may have changed pendingTarget, or
     * cancelled it back to matching this.value, in the meantime - either
     * case makes this check stale and it's ignored, same as doStep() checking
     * `CircuitElm.sim.t >= this.delayEndTime` against whatever inState/outState
     * actually are by the time it runs. Also requires this to be exactly the
     * event scheduled for the CURRENT pendingTarget (see pendingDeadline's
     * docstring) - not just any earlier, already-superseded event that
     * happens to agree on the target value. */
    // Return type is deliberately `any`: the base class's prepare() returns
    // its own unexported Pending union (a set of {kind: "..."} records) that
    // this override's plain boolean-or-null pending value doesn't belong
    // to - commit() below only ever sees what this same override returned,
    // so the mismatch is safe in practice, just not expressible as a proper
    // covariant override.
    prepare(val: unknown): any {
        const inputVal = this.evaluate();
        if (this.scheduler.currentTime !== this.pendingDeadline) return null;
        if (inputVal !== this.pendingTarget || inputVal === this.value) return null;
        return inputVal;
    }

    /** Phase 2: commit the confirmed transition. */
    commit(pending: unknown): void {
        if (pending === null) return;
        this.value = pending as boolean;
        this.pendingTarget = null;
        this.pendingDeadline = -1;
        this.history.push([this.scheduler.currentTime, this.value]);
        this.notifyOutputs();
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
