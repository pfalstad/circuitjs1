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


import { digitalScopeSourceNew } from "./digital/DigitalGraphBuilder";
import { ChipState } from "./digital/chip";
import type { Chip, HistoryWatcher } from "./digital/chip";

// One JS-side watch on a named signal. Mirrors ScopePlot's own digitalChip attachment
// (setDigitalChip()/historyFloor()) - see that file's comments for why a HistoryWatcher has to
// track its own floor into Chip.history rather than re-scanning from the start every poll: this
// is the same pattern, just reporting to JS instead of painting a scope trace.
class JSSignalWatch implements HistoryWatcher {
    name: string;
    chip: Chip | null = null;
    // Tick chip.history has been read up through, or -1 if never (see historyEpoch below for
    // where a cold-start read begins instead).
    lastFilledTick: number = -1;
    // globalTime as of attachment - a cold start never reports history from before this.
    historyEpoch: number = 0;

    constructor(name: string) { this.name = name; }

    historyFloor(): number {
        return this.lastFilledTick < 0 ? -1 : this.lastFilledTick;
    }

    setChip(chip: Chip | null): void {
        if (this.chip !== null)
            this.chip.removeHistoryWatcher(this);
        this.chip = chip;
        this.lastFilledTick = -1;
        if (chip === null)
            return;
        this.historyEpoch = chip.circuit.globalTime;
        // Same reasoning as ScopePlot.setDigitalChip(): skip the chip's shared backfill cursor
        // forward to "now" so attaching to a long-asleep chip doesn't force an expensive replay
        // of history this watch is never going to report anyway.
        chip.skipBackfillTo(this.historyEpoch);
        chip.addHistoryWatcher(this);
    }

    detach(): void {
        this.chip?.removeHistoryWatcher(this);
        this.chip = null;
    }
}

export class JSInterface {
    app: any;
    private signalWatches: Map<string, JSSignalWatch> = new Map();

    constructor(app: any) {
        this.app = app;
    }

    setExtVoltage(name: string, v: number): void {
        for (let i = 0; i !== this.app.elmList.length; i++) {
            const ce = this.app.getElm(i);
            if (ce.isExtVoltageElm()) {
                if (ce.getName() === name)
                    ce.setVoltage(v);
            }
        }
    }

    /** Live phase/duty-cycle nudge for a named digital clock rail (e.g. an ExtClockElm) without a
     * full circuit re-analyze - see RailElm.retimePhase()'s own docstring for why this stays on
     * the fast digital path (no per-tick JS callback: the engine's own free-running
     * Cycle/outputEvents machinery keeps driving the signal after this one-shot re-prime).
     * `phaseShift` is in radians, same convention as the rail's own phaseShift property/
     * VoltageElm's analog phase field. `dutyCycle` (0-1 fraction) is optional and left unchanged
     * when omitted. No-op if `name` isn't a digital clock rail or hasn't been wired into the
     * circuit yet. */
    setExtClock(name: string, phaseShift: number, dutyCycle?: number): void {
        const elm = this.findElmByName(name);
        if (elm === null || typeof elm.retimePhase !== "function") return;
        const chip = digitalScopeSourceNew(elm);
        if (chip === null) return;
        elm.retimePhase(chip, phaseShift, dutyCycle);
    }

    getJSElements(): object[] {
        const arr: object[] = [];
        for (let i = 0; i !== this.app.elmList.length; i++) {
            const ce = this.app.getElm(i);
            ce.addJSMethods();
            arr.push(ce.getJavaScriptObject());
        }
        return arr;
    }

    getLabeledNodeVoltage(name: string): number { return this.app.sim.getLabeledNodeVoltage(name); }

    private findElmByName(name: string): any {
        for (let i = 0; i !== this.app.elmList.length; i++) {
            const ce = this.app.getElm(i);
            if (typeof ce.getName === "function" && ce.getName() === name)
                return ce;
        }
        return null;
    }

    // Starts (or keeps) watching the named signal (a labeled node, or anything else with a
    // getName() - e.g. an ext voltage) for digital changes - see pollSignals()'s docstring for
    // what watchers actually receive. Idempotent: watching an already-watched name is a no-op.
    watchSignal(name: string): void {
        if (!this.signalWatches.has(name))
            this.signalWatches.set(name, new JSSignalWatch(name));
    }

    unwatchSignal(name: string): void {
        const w = this.signalWatches.get(name);
        if (w) {
            w.detach();
            this.signalWatches.delete(name);
        }
    }

    /** Once per draw (called from callUpdateHook(), same cadence as the onupdate hook - see
     * UIManager.drawBottomArea()), re-resolves each watched signal's driving Chip (elements may
     * not be wired up yet the first few frames - see ScopePlot.refreshDigitalSource()'s own
     * comment for why this has to be a re-check, not a one-shot resolve) and reports every
     * transition recorded in that chip's own history since the last poll - the same
     * change-list-based approach ScopePlot2d.fillDigitalRaster() uses to paint a scope's digital
     * raster mode, so JS-side code (e.g. a JS-drawn 2D scope) can do the same thing that code
     * does, without needing per-timestep callbacks the digital fast path can't cheaply provide
     * (a promoted/sleeping chip skips real ticks entirely - see SimulationManager.runCircuit()'s
     * own comment). Calls onsignalupdate at most once, with one entry per signal that actually
     * changed or was just (re)attached; does nothing (no hook call) if no watch has anything new. */
    private pollSignals(): void {
        if (this.signalWatches.size === 0)
            return;
        const signals: Record<string, { changes: { tick: number, value: number }[], now: number }> = {};
        let any = false;
        for (const w of this.signalWatches.values()) {
            const elm = this.findElmByName(w.name);
            const chip = elm !== null ? digitalScopeSourceNew(elm) : null;
            if (chip !== w.chip)
                w.setChip(chip);
            if (w.chip === null)
                continue;
            const chip2 = w.chip;
            const globalTime = chip2.circuit.globalTime;
            const backfilledTo = chip2.state === ChipState.ASLEEP ? chip2.backfillHistory(globalTime) : globalTime;
            // Clamp to what backfillHistory() actually reached - same reasoning as
            // ScopePlot.fillFromDigitalHistory()'s own clamp.
            const now = Number(backfilledTo < globalTime ? backfilledTo : globalTime);
            if (w.lastFilledTick === now)
                continue;
            const hist = chip2.history;
            const coldStart = w.lastFilledTick < 0;
            const floor = coldStart ? Number(w.historyEpoch) : w.lastFilledTick;
            // Cold start excludes entries AT floor (historyEpoch is a hard "never show before
            // this" clamp - see ScopePlot.fillFromDigitalHistory()'s identical cold-start search).
            // Steady state must NOT exclude them: floor there is the previous call's `now`, and an
            // entry landing exactly on it was deliberately deferred (see the `< now` walk bound
            // below) rather than dropped - excluding it here too would lose it for good.
            let lo = 0, hi = hist.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                const cmp = coldStart ? Number(hist[mid].time) <= floor : Number(hist[mid].time) < floor;
                if (cmp) lo = mid + 1; else hi = mid;
            }
            const changes: { tick: number, value: number }[] = [];
            if (coldStart)
                // Report the level in effect as of `floor` first, so JS doesn't have to guess the
                // starting value before the first real transition.
                changes.push({ tick: floor, value: lo > 0 ? hist[lo - 1].value : (hist.length > 0 ? (hist[0].value ^ 1) : chip2.output) });
            for (let i = lo; i < hist.length && Number(hist[i].time) < now; i++)
                changes.push({ tick: Number(hist[i].time), value: hist[i].value });
            w.lastFilledTick = now;
            // A transition landing exactly at `now` is excluded above (half-open range, same as
            // ScopePlot2d.fillDigitalRaster()) and picked up on a later poll instead once `now`
            // has advanced past it - so `now` moving with nothing YET to report isn't itself
            // worth a hook call.
            if (changes.length === 0) continue;
            signals[w.name] = { changes, now };
            any = true;
        }
        if (any)
            this.callSignalUpdateHook(signals, this.app.sim.maxTimeStep);
    }

    private callSignalUpdateHook(signals: object, secondsPerTick: number): void {
        const hook = (window as any).CircuitJS1?.onsignalupdate;
        if (hook)
            hook((window as any).CircuitJS1, signals, secondsPerTick);
    }

    // Delegate methods for JS API access
    setSimRunning(run: boolean): void { this.app.setSimRunning(run); }
    simIsRunning(): boolean { return this.app.simIsRunning(); }
    doExportAsSVGFromAPI(): void { this.app.imageExporter.doExportAsSVGFromAPI(); }
    dumpCircuit(): string { return this.app.dumpCircuit(); }
    importCircuitFromText(t: string, s: boolean): void { this.app.importCircuitFromText(t, s); }
    getTime(): number { return this.app.sim.t; }
    getTimeStep(): number { return this.app.sim.timeStep; }
    setTimeStep(ts: number): void { this.app.sim.timeStep = ts; }
    getMaxTimeStep(): number { return this.app.sim.maxTimeStep; }
    setMaxTimeStep(ts: number): void { this.app.sim.maxTimeStep = this.app.sim.timeStep = ts; }

    setupJSInterface(): void {
        const that = this;
        (window as any).CircuitJS1 = {
            setSimRunning:  (run: boolean) => that.setSimRunning(run),
            getTime:        () => that.getTime(),
            getTimeStep:    () => that.getTimeStep(),
            setTimeStep:    (ts: number) => that.setTimeStep(ts), // don't use this, see #843
            getMaxTimeStep: () => that.getMaxTimeStep(),
            setMaxTimeStep: (ts: number) => that.setMaxTimeStep(ts),
            isRunning:      () => that.simIsRunning(),
            getNodeVoltage: (n: string) => that.getLabeledNodeVoltage(n),
            setExtVoltage:  (n: string, v: number) => that.setExtVoltage(n, v),
            getElements:    () => that.getJSElements(),
            watchSignal:    (n: string) => that.watchSignal(n),
            unwatchSignal:  (n: string) => that.unwatchSignal(n),
            setExtClock:    (n: string, phaseShift: number, dutyCycle?: number) => that.setExtClock(n, phaseShift, dutyCycle),
            getCircuitAsSVG: () => that.doExportAsSVGFromAPI(),
            exportCircuit:  () => that.dumpCircuit(),
            importCircuit:  (circuit: string, subcircuitsOnly: boolean) => that.importCircuitFromText(circuit, subcircuitsOnly),
        };
        const hook = (window as any).oncircuitjsloaded;
        if (hook)
            hook((window as any).CircuitJS1);
    }

    callUpdateHook(): void {
        // Once-per-draw cadence (see UIManager.drawBottomArea()) is exactly what signal watches
        // need - see pollSignals()'s own docstring.
        this.pollSignals();
        const hook = (window as any).CircuitJS1?.onupdate;
        if (hook)
            hook((window as any).CircuitJS1);
    }

    callAnalyzeHook(): void {
        const hook = (window as any).CircuitJS1?.onanalyze;
        if (hook)
            hook((window as any).CircuitJS1);
    }

    callTimeStepHook(): void {
        const hook = (window as any).CircuitJS1?.ontimestep;
        if (hook)
            hook((window as any).CircuitJS1);
    }

    callSVGRenderedHook(svgData: string): void {
        const hook = (window as any).CircuitJS1?.onsvgrendered;
        if (hook)
            hook((window as any).CircuitJS1, svgData);
    }

    // Called on a single click that lands on a circuit element (see MouseManager.onClick()).
    // `index` is the element's position in the list returned by getElements().
    callClickElmHook(index: number, elm: any): void {
        const hook = (window as any).CircuitJS1?.onclickelm;
        if (hook == null)
            return;
        elm.addJSMethods();
        hook((window as any).CircuitJS1, index, elm.getJavaScriptObject());
    }
}
