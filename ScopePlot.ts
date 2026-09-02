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
import { SimulationManager } from "./SimulationManager";
import { CirSim } from "./CirSim";
import { Locale } from "./Locale";
import {
    UNITS_V, UNITS_A, UNITS_OHMS, UNITS_W, UNITS_C,
    V_POSITION_STEPS,
} from "./ScopeConstants";
import { ChipState } from "./digital/chip";
import type { Chip } from "./digital/chip";
import { digitalScopeSourceNew } from "./digital/DigitalGraphBuilder";

// plot of single value on a scope
export class ScopePlot {
    minValues: number[];
    maxValues: number[];
    scopePointCount: number;
    ptr: number; // ptr is pointer to the current sample
    value: number; // Value - the property being shown - e.g. VAL_CURRENT
    // scopePlotSpeed is in sim timestep units per pixel
    scopePlotSpeed: number;
    units: number;
    lastUpdateTime: number;
    lastValue: number;
    color: string;
    elm: CircuitElm | null;
   // Has a manual scale in "/div" format been put in by the user (as opposed to being
   // inferred from a "MaxValue" format or from an automatically calculated scale)?
   // Manual scales should be kept to sane values anyway, but this shows if this is a user
   // intention we should respect, or if we should try and populate reasonable values from
   // the data we have
    manScaleSet: boolean = false;
    manScale: number = 1.0; // Units per division
    manVPosition: number = 0; // 0 is center of screen. +V_POSITION_STEPS/2 is top of screen
    gridMult: number = 0;
    plotOffset: number = 0;
    acCoupled: boolean = false;
    acAlpha: number = 0.9999; // Filter coefficient for AC coupling
    acLastOut: number = 0; // Store y[i-1] term for AC coupling filter

    // If this plot is showing a single-output digital element's voltage
    // (GateElm/InverterElm/DelayBufferElm, or a digital RailElm source) -
    // or a wire-equivalent node (LabeledNodeElm, ...) driven by one - this
    // is that actual driver's real Chip (dice-ts engine - see
    // digital/DigitalGraphBuilder.ts's digitalScopeSourceNew()) - see
    // fillFromDigitalHistory()'s docstring for why such a plot is filled
    // completely differently from a normal analog one. null for every other
    // plot (including current/other non-voltage plots on a digital
    // element - only the voltage trace goes through the digital fast path).
    // NOT readonly: see refreshDigitalSource().
    digitalChip: Chip | null;
    // scheduler tick this plot's arrays were last rebuilt for, so a
    // redundant draw() within the same tick (e.g. no simulation progress
    // between frames) doesn't repeat the O(new history entries) rebuild.
    private lastDigitalFillTick: number = -1;
    // globalTime at the moment this plot most recently acquired digitalChip
    // (constructor, or refreshDigitalSource() resolving a new one) - a scope
    // has no use for whatever happened on the signal before it existed, so
    // fillFromDigitalHistory() never displays history older than this, and
    // setDigitalChip() below fast-forwards the chip's own backfill cursor
    // past it too (Chip.skipBackfillTo()) so it's never even walked/recorded
    // in the first place. See setDigitalChip()'s own docstring for the one
    // case (another Scope already watching the same chip) this doesn't fully
    // isolate against.
    private historyEpoch: bigint = 0n;

    static readonly FLAG_AC = 1;

    constructor(e: CircuitElm | null, u: number);
    constructor(e: CircuitElm | null, u: number, v: number, manS: number);
    constructor(e: CircuitElm | null, u: number, v?: number, manS?: number) {
        this.elm = e;
        this.units = u;
        this.value = 0;
        this.scopePointCount = 0;
        this.ptr = 0;
        this.scopePlotSpeed = 0;
        this.lastUpdateTime = 0;
        this.lastValue = 0;
        this.color = "#FFFFFF";
        this.minValues = [];
        this.maxValues = [];
        this.digitalChip = null;
        this.setDigitalChip((u === UNITS_V) ? digitalScopeSourceNew(e) : null);
        if (v !== undefined && manS !== undefined) {
            this.value = v;
            this.manScale = manS;
            // ohms can only be positive, so move the v position to the bottom.
            // power can be negative for caps and inductors, but still move to the bottom (for backward compatibility)
            if (u === UNITS_OHMS || u === UNITS_W || u === UNITS_C)
                this.manVPosition = -V_POSITION_STEPS / 2;
        }
    }

    /** Re-resolves digitalChip. Needed beyond the constructor's one-shot
     * digitalScopeSourceNew() call because a scope can be constructed before
     * the node graph/wire closure exists to resolve against - notably
     * ScopeSerializer.undumpXml(), which runs while a saved circuit's XML
     * is still being read element-by-element (see
     * CircuitXMLDeserializer.readElements()), well before
     * SimulationManager.makeNodeList() builds the wiring a wire-equivalent
     * passthrough like LabeledNodeElm needs digitalScopeSourceNew() to walk
     * (and before initDigitalCircuit() has even built a DigitalGraph to
     * resolve against at all). A scope added interactively via the "View in
     * Scope" menu doesn't hit this - the circuit is already fully wired by
     * then - which is why the bug only showed up after a save/reload round
     * trip. Called from Scope.draw() every frame (cheap - a couple of
     * property checks, or a short scan of one node's links) so a plot
     * self-heals as soon as wiring becomes available, without every other
     * digitalChip reader needing to know any of this. */
    refreshDigitalSource(): void {
        if (this.units !== UNITS_V) return;
        const resolved = digitalScopeSourceNew(this.elm);
        if (resolved !== this.digitalChip) this.setDigitalChip(resolved);
    }

    // Points this plot at `chip` (or at nothing) and, if it's a genuinely new signal, marks "now"
    // as the earliest time this plot will ever display for it - see historyEpoch's own docstring
    // for the display side of that (fillFromDigitalHistory()'s searchFloor clamp), which holds
    // regardless of whether `chip` was ASLEEP or already ACTIVE/PASSIVE (recording unconditionally
    // - see Chip's `output` setter) at the moment of attachment: either way, nothing timestamped
    // before historyEpoch is ever scanned into this plot's columns.
    //
    // Also fast-forwards the chip's own backfill cursor past that point (skipBackfillTo() - a
    // no-op if it's already there, e.g. another Scope is already watching this same chip and
    // keeping it caught up) so attaching to a chip that's been ASLEEP a long time with nobody
    // watching doesn't cost this first draw an expensive replay of history it's not going to show
    // anyway (see chip.ts's advanceBackfillPos()/skipBackfillTo() for why that replay can
    // otherwise be arbitrarily expensive - this is what actually avoids it).
    //
    // Known gap: that cursor is shared per-Chip, not per-Scope. If a SECOND, earlier-epoch Scope
    // is already attached to this same chip (wider/older window, still relying on the cursor to
    // keep recording from before this plot's own epoch), this skip can jump the shared cursor
    // past a stretch that Scope hasn't drawn (and thus recorded) yet, leaving a real gap on ITS
    // left edge - self-healing (it fills back in as time moves on), never wrong values, so not
    // worth a full per-Scope private history/cursor to close.
    private setDigitalChip(chip: Chip | null): void {
        this.digitalChip = chip;
        // The old arrays (if any) belonged to a different signal (or to no
        // signal at all) - don't let a stale lastDigitalFillTick suppress
        // the rebuild fillFromDigitalHistory() needs to do now.
        this.lastDigitalFillTick = -1;
        if (chip === null) return;
        this.historyEpoch = chip.circuit.globalTime;
        chip.skipBackfillTo(this.historyEpoch);
    }

    startIndex(w: number): number {
        return this.ptr + this.scopePointCount - w;
    }

    reset(spc: number, sp: number, full: boolean): void {
        let oldSpc = this.scopePointCount;
        this.scopePointCount = spc;
        if (this.scopePlotSpeed !== sp)
            oldSpc = 0; // throw away old data
        this.scopePlotSpeed = sp;
        // Adjust the time constant of the AC coupled filter in proportion to the number of samples
        // we are seeing on the scope (if my maths is right). The constant is empirically determined
        this.acAlpha = 1.0 - 1.0 / (1.15 * sp * spc);
        const oldMin = this.minValues;
        const oldMax = this.maxValues;
        this.minValues = new Array(spc).fill(0);
        this.maxValues = new Array(spc).fill(0);
        if (oldMin !== null && oldMin.length > 0 && !full) {
            // preserve old data if possible
            let i;
            for (i = 0; i !== spc && i !== oldSpc; i++) {
                const i1 = (-i) & (spc - 1);
                const i2 = (this.ptr - i) & (oldSpc - 1);
                this.minValues[i1] = oldMin[i2];
                this.maxValues[i1] = oldMax[i2];
            }
        } else
            this.lastUpdateTime = SimulationManager.theSim!.t;
        this.ptr = 0;
        // Array size/window just changed (or was thrown away above) - force
        // the next draw() to fully rebuild from history rather than trusting
        // whatever partial data the copy loop above preserved.
        this.lastDigitalFillTick = -1;
    }

    timeStep(): void {
        if (this.elm === null)
            return;
        if (this.digitalChip !== null)
            // Digital plots are never sampled per-timestep - see
            // fillFromDigitalHistory(). Scope.timeStep() already skips
            // calling this for digital plots; this guard is just so a
            // stray direct call can't corrupt the history-built arrays.
            return;
        let v = this.elm.getScopeValue(this.value);
         // AC coupling filter. 1st order IIR high pass
         // y[i] = alpha x (y[i-1]+x[i]-x[i-1])
         // We calculate for all iterations (even DC coupled) to prime the data in case they switch to AC later
        const newAcOut = this.acAlpha * (this.acLastOut + v - this.lastValue);
        this.lastValue = v;
        this.acLastOut = newAcOut;
        if (this.isAcCoupled())
            v = newAcOut;
        if (v < this.minValues[this.ptr])
            this.minValues[this.ptr] = v;
        if (v > this.maxValues[this.ptr])
            this.maxValues[this.ptr] = v;
        const maxTimeStep = SimulationManager.theSim!.maxTimeStep;
        if (SimulationManager.theSim!.t - this.lastUpdateTime >= maxTimeStep * this.scopePlotSpeed) {
            this.ptr = (this.ptr + 1) & (this.scopePointCount - 1);
            this.minValues[this.ptr] = this.maxValues[this.ptr] = v;
            this.lastUpdateTime += maxTimeStep * this.scopePlotSpeed;
        }
    }

    /** Rebuilds minValues/maxValues (the same per-pixel-column min/max
     * arrays timeStep() accretes one simulation tick at a time for an
     * analog plot) in a single pass over digitalChip.history - the Chip's
     * own append-only list of (tick, value) changes (see digital/chip.ts).
     * This is *not* called once per simulation timestep the way timeStep()
     * is: under the digital fast-path optimization, a promoted/sleeping
     * chip can skip real work for thousands of ticks at a stretch (that's
     * the whole point of the optimization), so sampling "the current
     * value" every tick would either force it to keep doing that work
     * anyway (defeating the optimization) or read a stale value that was
     * never updated live while asleep. Instead this runs once per draw()
     * (see Scope.draw()), walking however many genuine transitions
     * actually happened - typically far fewer than the number of simulated
     * ticks - and fills the display arrays exactly as if per-tick sampling
     * had produced them, so downstream drawing code (drawPlot(),
     * calcMaxAndMin(), the FFT/trigger machinery, etc.) sees an
     * ordinary-looking analog-shaped plot and needs no digital-specific
     * cases of its own. */
    fillFromDigitalHistory(): void {
        const chip = this.digitalChip;
        if (chip === null || this.scopePlotSpeed === 0) return;
        const nowBig = chip.circuit.globalTime;
        if (chip.state === ChipState.ASLEEP) chip.backfillHistory(nowBig);
        const now = Number(nowBig);
        if (this.lastDigitalFillTick === now) return;
        this.lastDigitalFillTick = now;

        const spc = this.scopePointCount;
        const sp = this.scopePlotSpeed; // ticks per pixel column (1 tick = 1 maxTimeStep)
        const hist = chip.history; // ascending {time, value}
        // this.elm may be a wire-equivalent passthrough (e.g. LabeledNodeElm)
        // with no highVoltage of its own - the actual level lives on
        // whatever digital element really drives the node (this.elm and
        // whatever elm digitalChip actually came from may differ - see
        // digitalScopeSourceNew()).
        const hv = (this.elm as any)?.highVoltage ?? 5;
        const windowStart = now - spc * sp;
        // Never look further back than this plot's own historyEpoch - see its docstring.
        const searchFloor = Math.max(windowStart, Number(this.historyEpoch));

        // Binary search: first history index with tick > searchFloor.
        let lo = 0, hi = hist.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (Number(hist[mid].time) <= searchFloor) lo = mid + 1; else hi = mid;
        }
        let hIdx = lo;
        let curVal = lo > 0 ? hist[lo - 1].value : (hist.length > 0 ? hist[0].value : chip.output);

        for (let col = 0; col < spc; col++) {
            const colEnd = windowStart + (col + 1) * sp;
            const v0 = curVal ? hv : 0;
            let mn = v0, mx = v0;
            while (hIdx < hist.length && Number(hist[hIdx].time) < colEnd) {
                curVal = hist[hIdx].value;
                const v = curVal ? hv : 0;
                if (v < mn) mn = v;
                if (v > mx) mx = v;
                hIdx++;
            }
            this.minValues[col] = mn;
            this.maxValues[col] = mx;
        }
        // See startIndex()/reset()'s (ptr - i) & (spc - 1) convention: ptr
        // is the newest column. minValues/maxValues were just filled
        // oldest-to-newest at indices 0..spc-1, so ptr = spc - 1 makes
        // index spc-1 (the last one written, i.e. newest) resolve to
        // offset 0 from ptr - exactly matching that convention without
        // needing an actual circular write.
        this.ptr = spc - 1;
        this.lastValue = curVal ? hv : 0;
    }

    getUnitText(v: number): string {
        switch (this.units) {
        case UNITS_V:
            return CircuitElm.getVoltageText(v);
        case UNITS_A:
            return CircuitElm.getCurrentText(v);
        case UNITS_OHMS:
            return CircuitElm.getUnitText(v, Locale.ohmString);
        case UNITS_W:
            return CircuitElm.getUnitText(v, "W");
        case UNITS_C:
            return CircuitElm.getUnitText(v, "C");
        }
        return "";
    }

    static readonly colors: string[] = [
        "#FF0000", "#FF8000", "#FF00FF", "#7F00FF",
        "#0000FF", "#0080FF", "#FFFF00", "#00FFFF",
    ];

    assignColor(count: number): void {
        if (count > 0) {
            this.color = ScopePlot.colors[(count - 1) % 8];
            return;
        }
        switch (this.units) {
        case UNITS_V:
            this.color = CircuitElm.positiveColor.getHexValue();
            break;
        case UNITS_A:
            this.color = (CirSim.theApp.isPrintable()) ? "#A0A000" : "#FFFF00";
            break;
        default:
            this.color = (CirSim.theApp.isPrintable()) ? "#000000" : "#FFFFFF";
            break;
        }
    }

    setAcCoupled(b: boolean): void {
        if (this.canAcCouple()) {
            this.acCoupled = b;
        } else
            this.acCoupled = false;
    }

    canAcCouple(): boolean {
        // A digital plot's minValues/maxValues are rebuilt wholesale from
        // history on every draw (see fillFromDigitalHistory()), not
        // accreted sample-by-sample like acLastOut/lastValue assume - AC
        // coupling's IIR filter has no meaningful per-sample state to run
        // against here.
        return this.units === UNITS_V && this.digitalChip === null; // AC coupling is permitted if the plot is displaying volts
    }

    isAcCoupled(): boolean {
        return this.acCoupled;
    }

    getPlotFlags(): number {
        return (this.acCoupled ? ScopePlot.FLAG_AC : 0);
    }
}
