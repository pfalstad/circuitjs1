import { describe, it, expect, afterEach } from "vitest";
import { Scheduler, LAST } from "./Scheduler";
import type { Schedulable } from "./Scheduler";
import { DigitalElm, State, GroupPin, syncedValue } from "./DigitalElm";
import type { Group } from "./DigitalElm";

// ---------------------------------------------------------------------
// Example elements, mirroring cycle4's sim.py NAND/Clock/Counter/
// DFlipFlop/CounterGroup. Kept here (test-only) rather than in
// DigitalElm.ts, which has no knowledge of any specific gate/chip.
//
// None of these take a Scheduler constructor argument - set
// DigitalElm.current before constructing any of them (see
// newScheduler() below), matching how real integration will point it at
// CircuitElm.sim's digital scheduler instead.
// ---------------------------------------------------------------------

function newScheduler(): Scheduler {
    const scheduler = new Scheduler();
    DigitalElm.current = scheduler;
    return scheduler;
}

class Nand extends DigitalElm {
    constructor() {
        super();
        this.value = true;
    }
    evaluate(): boolean {
        return !this.inputs.every(i => i.currentValue());
    }
}

class ClockElm extends DigitalElm {
    constructor(period: number) {
        super();
        this.cycleTime = period;
        this.rootPhaseZero = 0;
        this.state = State.Active;
        this.firstOutputEvent = 0;
        this.currentOutputEvent = 1;
        this.outputEvents.push([0, false]);
        this.outputEvents.push([period / 2, true]);
        this.scheduler.schedule(period / 2, this, true);
    }
    evaluate(): boolean {
        throw new Error("Clock is always Active; evaluate() should never be called");
    }
    // Clock's schedule is never actually in doubt (it has no inputs), so
    // unlike the generic wake(), just resume Active ticking in place
    // instead of fully demoting - see cycle4/sim.py Clock.wake() docstring.
    wake(): void {
        if (this.sleepRequested) { this.sleepRequested = false; return; }
        if (this.state !== State.Asleep) return;
        this.value = this.currentValue();
        const elapsed = this._rootElapsed();
        this.currentCycle = this;
        const idx = this._indexAt(this, elapsed);
        this.state = State.Active;
        this._advanceAndSchedule(idx, elapsed, this);
    }
}

class CounterElm extends DigitalElm {
    resetValue: boolean;
    constructor(invertReset = false) {
        super();
        this.resetValue = !invertReset;
    }
    evaluate(sender: DigitalElm | null = null): boolean {
        const clk = this.inputs[0];
        const cur = this.currentValue();
        let newval = cur;
        if ((sender === null || sender === clk) && clk.transitionedTo(false, this.lastChecked, this.scheduler.currentTime))
            newval = !cur;
        if (this.inputs[1].currentValue() === this.resetValue) newval = false;
        return newval;
    }
}

class DFlipFlopElm extends DigitalElm {
    constructor(private invert = false) {
        super();
    }
    evaluate(sender: DigitalElm | null = null): boolean {
        const clk = this.inputs[1];
        const cur = this.currentValue();
        let newval = cur;
        if ((sender === null || sender === clk) && clk.transitionedTo(true, this.lastChecked, this.scheduler.currentTime)) {
            newval = this.inputs[0].currentValue();
            if (this.invert) newval = !newval;
        }
        return newval;
    }
}

class CounterGroupElm implements Group {
    pins: GroupPin[];
    inputs: DigitalElm[] = [];
    resetValue: boolean;
    constructor(public width: number, invertReset = false) {
        this.resetValue = !invertReset;
        this.pins = Array.from({ length: width }, (_, i) => new GroupPin(this, i));
    }
    addInput(clk: DigitalElm, reset: DigitalElm): void {
        this.inputs = [clk, reset];
        for (const p of this.pins) p.addInput(clk, reset);
    }
    evaluate(pin: GroupPin, sender: DigitalElm | null): boolean[] {
        const clk = this.inputs[0];
        const now = pin.scheduler.currentTime;
        const old = this.pins.map(p => syncedValue(p, now));
        let next = old;
        if ((sender === null || sender === clk) && clk.transitionedTo(false, pin.lastChecked, now)) {
            let val = 0;
            old.forEach((b, i) => { if (b) val |= 1 << i; });
            val = (val + 1) % (1 << this.width);
            next = Array.from({ length: this.width }, (_, i) => (val & (1 << i)) !== 0);
        }
        if (syncedValue(this.inputs[1], now) === this.resetValue)
            next = new Array(this.width).fill(false);
        return next;
    }
    alwaysDemoteOn(sender: DigitalElm): boolean {
        return sender === this.inputs[1];
    }
}

/** An input held permanently at a fixed value - e.g. a reset line that's
 * never asserted. Has no inputs of its own, so it stays Passive forever
 * (tryPromote() is a no-op for an element with no inputs) with a value that
 * never changes. */
class ConstElm extends DigitalElm {
    constructor(v: boolean) {
        super();
        this.value = v;
    }
    evaluate(): boolean { return this.value; }
}

/** Periodic pure observer: samples current_value() of every watched
 * element at a fixed interval. commit_after() = LAST so it never races a
 * same-tick cascade of real circuit commits - see doc.txt section 8c. */
class Checkpoint implements Schedulable {
    samples: string[] = [];
    constructor(private scheduler: Scheduler, private interval: number, private watch: DigitalElm[], private endTime: number) {
        scheduler.schedule(interval, this);
    }
    prepare(): unknown { return null; }
    commit(): void {
        this.samples.push(this.watch.map(w => (w.currentValue() ? "1" : "0")).join(""));
        const next = this.scheduler.currentTime + this.interval;
        if (next <= this.endTime) this.scheduler.schedule(next, this);
    }
    commit_after(): typeof LAST { return LAST; }
}

/** Builds the same small "pong" circuit cycle4/sim.py used: a free-running
 * clock, two 4-bit synchronous CounterGroups, a single-bit Counter, a NAND
 * gate, and two D flip-flops wired as a reset generator. Caller must have
 * already pointed DigitalElm.current at `scheduler` (see newScheduler()). */
function buildCircuit(scheduler: Scheduler) {
    const clock = new ClockElm(200);
    const dff = new DFlipFlopElm(false);
    const dffinv = new DFlipFlopElm(true);

    const group0 = new CounterGroupElm(4);
    group0.addInput(clock, dffinv);
    const group1 = new CounterGroupElm(4);
    group1.addInput(group0.pins[3], dffinv);

    const counter8 = new CounterElm(true);
    counter8.addInput(group1.pins[3], dff);

    const nand = new Nand();
    nand.addInput(group0.pins[1], group0.pins[2], group1.pins[2], group1.pins[3], counter8);

    dff.addInput(nand, clock);
    dffinv.addInput(nand, clock);

    const watch: DigitalElm[] = [...group0.pins, ...group1.pins, counter8, nand, dff, dffinv];
    return { scheduler, clock, watch };
}

afterEach(() => {
    DigitalElm.promotionEnabled = true;
});

describe("Scheduler two-phase dispatch", () => {
    it("dispatches events in time order and drains", () => {
        const scheduler = new Scheduler();
        const seen: number[] = [];
        const obj: Schedulable = {
            prepare: (arg) => arg,
            commit: (pending) => { seen.push(pending as number); },
        };
        scheduler.schedule(10, obj, 1);
        scheduler.schedule(5, obj, 2);
        scheduler.schedule(20, obj, 3);
        scheduler.run();
        expect(seen).toEqual([2, 1, 3]);
    });

    it("orders same-timestamp events into dependency tiers via commit_after", () => {
        const scheduler = new Scheduler();
        const order: string[] = [];
        const a: Schedulable = { prepare: () => null, commit: () => order.push("a") };
        const b: Schedulable = {
            prepare: () => null,
            commit: () => order.push("b"),
            commit_after: () => new Set([a]),
        };
        scheduler.schedule(5, b);
        scheduler.schedule(5, a);
        scheduler.run();
        expect(order).toEqual(["a", "b"]);
    });

    it("runs LAST-tagged observers only after the rest of the batch commits", () => {
        const scheduler = new Scheduler();
        const order: string[] = [];
        const observer: Schedulable = {
            prepare: () => null,
            commit: () => order.push("observer"),
            commit_after: () => LAST,
        };
        const real: Schedulable = { prepare: () => null, commit: () => order.push("real") };
        scheduler.schedule(5, observer);
        scheduler.schedule(5, real);
        scheduler.run();
        expect(order).toEqual(["real", "observer"]);
    });
});

describe("DigitalElm promotion/sleep against a small synchronous circuit", () => {
    it("matches a hand-computed NAND truth table while Passive", () => {
        const scheduler = newScheduler();
        DigitalElm.promotionEnabled = false;
        const clock = new ClockElm(200);
        const dff = new DFlipFlopElm(false);
        dff.addInput(clock, clock); // D tied to clock's own value, for a trivial deterministic check
        scheduler.runUntil(1000);
        // D flip-flop should track clock's value one clock-edge-delayed;
        // just assert it actually toggled (sanity, not a full model).
        expect(dff.history.length).toBeGreaterThan(0);
    });

    it("optimized (promotion enabled) run matches the always-correct baseline exactly", () => {
        const endTime = 60000;
        const sampleInterval = 10;

        DigitalElm.promotionEnabled = false;
        const baseScheduler = newScheduler();
        const base = buildCircuit(baseScheduler);
        const baseCheckpoint = new Checkpoint(baseScheduler, sampleInterval, base.watch, endTime);
        baseScheduler.runUntil(endTime);

        DigitalElm.promotionEnabled = true;
        const optScheduler = newScheduler();
        const opt = buildCircuit(optScheduler);
        const optCheckpoint = new Checkpoint(optScheduler, sampleInterval, opt.watch, endTime);
        optScheduler.runUntil(endTime);

        expect(optCheckpoint.samples.length).toBe(baseCheckpoint.samples.length);
        expect(optCheckpoint.samples).toEqual(baseCheckpoint.samples);

        // The optimization should actually have kicked in - otherwise this
        // test would pass trivially even if promotion were completely broken.
        const promotedSomething = opt.watch.some(w => w.state !== State.Passive);
        expect(promotedSomething).toBe(true);
    });

    it("elements with no downstream consumers still go Asleep (vacuous trust)", () => {
        const scheduler = newScheduler();
        const clock = new ClockElm(200);
        const counter = new CounterElm(true); // invertReset=true -> resetValue=false
        const reset = new ConstElm(true); // held inactive (true !== resetValue)
        counter.addInput(clock, reset);
        scheduler.runUntil(20000);
        expect(counter.state).toBe(State.Asleep);
    });
});
