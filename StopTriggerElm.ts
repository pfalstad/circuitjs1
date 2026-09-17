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
import { Choice } from "./Choice";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Font } from "./Font";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { StringTokenizer } from "./StringTokenizer";
import { customChipStart, i1 } from "./digital/chip_desc";
import type { Chip } from "./digital/chip";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";
import { getCurrentDigitalGraph } from "./digital/DigitalGraphBuilder";
import { TIMESCALE } from "./digital/constants";

export class StopTriggerElm extends CircuitElm {
    triggerVoltage: number = 1;
    triggered: boolean = false;
    stopped: boolean = false;
    conditionActive: boolean = false;
    delay: number = 0;
    type: number = 0;
    count: number = 1;
    triggerCount: number = 0;
    // Nominal "high" voltage used to evaluate triggerVoltage against the digital 0/1 level this
    // element is watching - see digitalSynthesis()'s own comment for why the real driving
    // element's actual highVoltage isn't available at the point the condition is checked.
    // Matches ChipElm/InverterElm/DelayBufferElm's own default digital high level.
    highVoltage: number = 5;
    // Absolute Circuit.globalTime tick the pending stop is scheduled to fire at, for getInfo()'s
    // countdown display - null when not currently counting down. Ticks, not seconds, since it's
    // compared against getCurrentDigitalGraph()'s own live globalTime.
    private stopAtTick: number | null = null;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.triggerVoltage = parseFloat(st.nextToken());
            this.type = parseInt(st.nextToken());
            this.delay = parseFloat(st.nextToken());
            this.count = 1;
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "tv", this.triggerVoltage);
        CircuitXMLSerializer.dumpAttr(elem, "tp", this.type);
        CircuitXMLSerializer.dumpAttr(elem, "dl", this.delay);
        CircuitXMLSerializer.dumpAttr(elem, "ct", this.count);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.triggerVoltage = xml.parseDoubleAttr("tv", this.triggerVoltage);
        this.type = xml.parseIntAttr("tp", this.type);
        this.delay = xml.parseDoubleAttr("dl", this.delay);
        this.count = xml.parseIntAttr("ct", 1);
        if (this.count < 1)
            this.count = 1;
    }

    reset(): void {
        this.triggered = false;
        this.conditionActive = false;
        this.triggerCount = 0;
        this.stopAtTick = null;
        this.stopped = false;
    }
    getDumpType(): number { return 408; }
    getPostCount(): number { return 1; }

    setPoints(): void {
        super.setPoints();
        this.lead1 = this.interpPoint(this.point1, this.point2, 1 - 8 / this.dn);
    }

    draw(g: Graphics): void {
        g.save();
        const selected = this.needsHighlight() || this.stopped;
        g.setFont(new Font("SansSerif", selected ? Font.BOLD : 0, 14));
        g.setColor(selected ? CircuitElm.selectColor : CircuitElm.whiteColor);
        this.setBbox(this.point1, this.lead1!, 0);
        this.drawLabeledNode(g, Locale.LS("trigger"), this.point1, this.lead1!);
        this.setVoltageColor(g, this.nodes[0].v);
        if (selected) g.setColor(CircuitElm.selectColor);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        this.drawPosts(g);
        g.restore();
    }

    /* This element has no analog behavior of its own (no stamp()/doStep()) - it only ever
     * watches whatever digital signal is wired to it, so the old CircuitJS1 code drove it from
     * stepFinished(), called once per analog solver timestep. This build's digital-only
     * runCircuit() path doesn't run that solver loop at all (see SimulationManager.
     * runCircuitAnalog()'s own "kept intact and unused" comment) - and even a once-per-frame
     * replacement wouldn't do, because a single frame's runWithDeadline() call can silently
     * fast-forward through many real transitions (the whole point of the digital engine's
     * event-driven/promotion design), so sampling nodes[0].v only after the fact could miss a
     * pulse entirely or massively overshoot the requested stop time.
     *
     * Instead this wires itself directly into the digital event graph as two CUSTOM_CHIP cells,
     * so the JS below runs exactly when the engine itself processes the relevant tick -
     * regardless of frame rate, sim speed, or how many other ticks happen to land in the same
     * runWithDeadline() batch:
     *
     *  - detect (real post 0 -> internal FIRE): fires synchronously on every real transition of
     *    the watched signal (Chip.updateInputs()'s CUSTOM_CHIP branch calls straight into this,
     *    bypassing the generic LUT/cycle machinery entirely - see chip.ts). Tracks
     *    conditionActive/triggerCount exactly like the old stepFinished() did, and once `count`
     *    is reached, requests ITS OWN output to flip after `delay` real seconds via
     *    Circuit.queuePush() - the same self-scheduling idiom MonostableElm's T/EXP/Q cells use.
     *    A revert of the watched signal before that delay elapses does NOT cancel the pending
     *    flip (matches the original stepFinished()'s semantics: once triggered, the countdown
     *    runs regardless of what the signal does afterward).
     *  - stop: a chip whose only input is FIRE. When detect's requested flip actually lands (via
     *    the engine's generic queue dispatch calling this chip's updateInputs(), same mechanism
     *    that propagates any ordinary chip-to-chip wire), this performs the real side effect. A
     *    CUSTOM_CHIP can't just re-invoke itself when ITS OWN scheduled event fires - that lands
     *    in updateOutput()'s generic toggle-and-propagate code, not back in this callback - which
     *    is exactly why a second, downstream cell is needed to actually catch the transition.
     *    Reacts to every real toggle of FIRE (mask !== 0), not just 0->1: since detect only ever
     *    requests one flip per full arm/fire cycle, each such toggle unambiguously means "the
     *    countdown just elapsed", whichever way the bit happens to be moving that time - no
     *    separate reset step is needed to keep future cycles firing on a clean edge. */
    digitalSynthesis(): DigitalSynthesis {
        const IN = 1;
        const FIRE = i1;

        const detect = (chip: Chip, mask: number): void => {
            if (mask !== 0) chip.inputs ^= mask;
            const high = (chip.inputs & 1) !== 0;
            const v = high ? this.highVoltage : 0;
            const condition = (this.type === 0 && v >= this.triggerVoltage) ||
                (this.type === 1 && v <= this.triggerVoltage);
            if (!this.conditionActive && condition) {
                this.conditionActive = true;
                this.triggerCount++;
                if (!this.triggered && this.triggerCount >= this.count) {
                    this.triggered = true;
                    this.stopped = false;
                    const delayTicks = Math.max(0, Math.round(this.delay / TIMESCALE));
                    chip.pendingEvent = chip.circuit.queuePush(chip, delayTicks);
                    this.stopAtTick = chip.circuit.globalTime + delayTicks;
                }
            } else if (this.conditionActive && !condition) {
                this.conditionActive = false;
            }
        };

        const stop = (chip: Chip, mask: number): void => {
            if (mask === 0) return; // the synthetic call Chip.initialize() makes at build time
            chip.inputs ^= mask;
            this.triggered = false;
            this.triggerCount = 0;
            this.stopped = true;
            this.stopAtTick = null;
            CircuitElm.app.setSimRunning(false);
            // setSimRunning() alone only stops the NEXT runCircuit() call from happening - the
            // runWithDeadline() call THIS callback is running inside of has already been handed
            // its whole tick budget and would otherwise keep draining the event queue through the
            // rest of it regardless. requestHalt() ends that call right here instead, so drawing/
            // getInfo() right after this frame see the state as of this exact tick, not whatever
            // the rest of the batch would have advanced it to.
            chip.circuit.requestHalt();
        };

        return {
            desc: [
                customChipStart(detect).inputPins(IN).outputPin(FIRE),
                customChipStart(stop).inputPins(FIRE),
            ],
            pinMap: new Map([[0, IN]]),
        };
    }

    getVoltageDiff(): number { return this.nodes[0].v; }

    getInfo(arr: string[]): void {
        arr[0] = "stop trigger";
        arr[1] = "V = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[2] = "Vtrigger = " + CircuitElm.getVoltageText(this.triggerVoltage);
        if (this.triggered && this.stopAtTick !== null) {
            const now = getCurrentDigitalGraph()?.circuit.globalTime ?? this.stopAtTick;
            const remaining = Number(this.stopAtTick - now) * TIMESCALE;
            arr[3] = "stopping in " + CircuitElm.getUnitText(Math.max(0, remaining), "s");
        } else if (this.stopped)
            arr[3] = "stopped";
        else
            arr[3] = "waiting";
        if (!this.stopped && this.count > 1)
            arr[3] += " (" + Math.min(this.triggerCount, this.count) + "/" + this.count + ")";
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("Voltage", this.triggerVoltage).setUnitStep();
        if (n === 1) {
            const ei = new EditInfo("Trigger Type", this.type, -1, -1);
            ei.choice = new Choice();
            ei.choice.add(">=");
            ei.choice.add("<=");
            ei.choice.select(this.type);
            return ei;
        }
        if (n === 2) return new EditInfo("Delay (s)", this.delay);
        if (n === 3) {
            const ei = new EditInfo("Required Count", this.count, -1, -1);
            return ei.setDimensionless().setPositive();
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.triggerVoltage = ei.value;
        if (n === 1) this.type = ei.choice!.getSelectedIndex();
        if (n === 2) this.delay = ei.value;
        if (n === 3) {
            this.count = Math.trunc(ei.value);
            if (this.count < 1)
                this.count = 1;
        }
    }
}
