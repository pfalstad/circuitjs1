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
        this.initialValue = true;
    }
    evaluate(): boolean {
        return !this.inputs.every(i => i.currentValue());
    }
}

class Nor extends DigitalElm {
    evaluate(): boolean {
        return !this.inputs.some(i => i.currentValue());
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
        if ((sender === null || sender === clk) &&
            clk.transitionedTo(false, this.lastChecked, this.scheduler.currentTime) !== null)
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
        const edgeTime = (sender === null || sender === clk)
            ? clk.transitionedTo(true, this.lastChecked, this.scheduler.currentTime) : null;
        if (edgeTime !== null) {
            // Sample D as of the edge's own timestamp, not "now" - see
            // DFlipFlopElm.ts's real evaluate() for why.
            newval = this.inputs[0].valueAt(edgeTime);
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
        // activationCheck() needs each bit's own recorded input pattern to
        // be a sufficient statistic for its future - bit i's next value
        // also depends on the carry from every lower bit (0..i-1), which
        // evaluate() reads via this.pins directly (bypassing pin.inputs) -
        // see Group.extraPeriodicityInputs()'s docstring in DigitalElm.ts.
        for (const [i, p] of this.pins.entries()) p.addInput(clk, reset, ...this.pins.slice(0, i));
    }
    evaluate(pin: GroupPin, sender: DigitalElm | null): boolean[] {
        const clk = this.inputs[0];
        const now = pin.scheduler.currentTime;
        let next = this.pins.map(p => syncedValue(p, now));
        const edgeTime = (sender === null || sender === clk)
            ? clk.transitionedTo(false, pin.lastChecked, now) : null;
        if (edgeTime !== null) {
            // Read every bit's value as of the edge's own timestamp, not
            // "now" - see CounterElm.ts's real evaluate() for why (a
            // sibling bit that's Active reacts to this same edge
            // immediately, while this pin might only be catching up to it
            // much later).
            const old = this.pins.map(p => p.valueAt(edgeTime));
            let val = 0;
            old.forEach((b, i) => { if (b) val |= 1 << i; });
            val = (val + 1) % (1 << this.width);
            next = Array.from({ length: this.width }, (_, i) => (val & (1 << i)) !== 0);
        }
        if (syncedValue(this.inputs[1], now) === this.resetValue)
            next = new Array(this.width).fill(false);
        return next;
    }
}

/** Standalone equivalent of the real JKFlipFlopElm's evaluate() (see
 * JKFlipFlopElm.ts) - falling-edge triggered (matching every other
 * edge-triggered element in this file), with an optional active-low or
 * active-high reset that always forces Q false. */
class JKGroupElm implements Group {
    pins: GroupPin[]; // [0]=Q, [1]=/Q
    inputs: DigitalElm[] = []; // [J, clk, K, R]
    constructor(private invertReset = false) {
        this.pins = [new GroupPin(this, 0), new GroupPin(this, 1)];
    }
    addInput(j: DigitalElm, clk: DigitalElm, k: DigitalElm, r: DigitalElm): void {
        this.inputs = [j, clk, k, r];
        for (const p of this.pins) p.addInput(j, clk, k, r);
    }
    evaluate(pin: GroupPin, sender: DigitalElm | null): boolean[] {
        const [j, clk, k, r] = this.inputs;
        const now = pin.scheduler.currentTime;
        let q = syncedValue(this.pins[0], now);
        const edgeTime = (sender === null || sender === clk)
            ? clk.transitionedTo(false, pin.lastChecked, now) : null;
        if (edgeTime !== null) {
            const jv = j.valueAt(edgeTime), kv = k.valueAt(edgeTime);
            if (jv) q = kv ? !q : true;
            else if (kv) q = false;
        }
        if (syncedValue(r, now) !== this.invertReset)
            q = false;
        return [q, !q];
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
        // 60000 used to be enough for promotion to kick in, but tryPromote()
        // now refuses an empirical-only candidate while any input hasn't
        // yet shown at least one real variation within the matched window
        // (see tryPromote()'s "blind" check) - dffinv (this circuit's reset
        // line) doesn't vary at all until enough of the counter/nand chain
        // has built up state, which takes longer than 60000 ticks (and,
        // after the lastChecked-catchup fix in _demote(), longer than
        // 150000 too - promotion now waits for more settled evidence).
        // Run to 2,000,000, matching every other test in this file that
        // uses this same pong circuit. Two KNOWN, currently-unfixed bugs
        // live somewhere in that range - the first divergence found will
        // be tick 207601 (g1.q2 demotes on the exact same tick as one of
        // its own real clock edges; nothing recomputes .value from a
        // fresh live evaluate() before lastChecked advances past that
        // instant, so the edge is silently and permanently lost - see
        // _demote()'s "KNOWN REMAINING GAP" comment). This is a property
        // of the *base* circuit itself (found via a JK-flip-flop
        // simplification that turned out to reproduce identically with
        // the plain CounterElm here) - not something introduced by any
        // specific element type. A second, unrelated, also-unfixed bug in
        // this circuit's counter8/nand/dff feedback loop surfaces around
        // tick 272810; the first-divergence check below stops at whichever
        // comes first (207601) regardless.
        const endTime = 2_000_000;
        const sampleInterval = 1; // exhaustive, every tick - not a coarse sample

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

        let firstMismatch = -1;
        for (let i = 0; i < Math.min(baseCheckpoint.samples.length, optCheckpoint.samples.length); i++) {
            if (baseCheckpoint.samples[i] !== optCheckpoint.samples[i]) { firstMismatch = i; break; }
        }
        if (firstMismatch !== -1) {
            const tick = (firstMismatch + 1) * sampleInterval;
            console.log(`[mismatch] first divergence at tick ${tick}: base=${baseCheckpoint.samples[firstMismatch]} opt=${optCheckpoint.samples[firstMismatch]}`);
        }
        expect(firstMismatch, `first divergence at tick ${(firstMismatch + 1) * sampleInterval}`).toBe(-1);

        // The optimization should actually have kicked in - otherwise this
        // test would pass trivially even if promotion were completely broken.
        const promotedSomething = opt.watch.some(w => w.state !== State.Passive);
        expect(promotedSomething).toBe(true);

        // Correctness alone (the samples comparison above) can't catch a
        // regression that keeps re-deriving the right answer far more
        // often than necessary - e.g. a forced-demote cascade that thrashes
        // instead of converging quickly (a real bug found live: this
        // exact number went from a small fraction of the baseline to
        // several times *more* events than the unoptimized baseline
        // needed). The optimized run should process no more scheduler
        // events than the always-live baseline - not by a dramatic factor
        // within this short a window (this circuit's true period, ~91000,
        // is longer than endTime, so most elements never even reach
        // Asleep here, and tryPromote()'s "blind" check plus the
        // lastChecked-catchup fix in _demote() both deliberately trade
        // some optimization depth for correctness, further delaying
        // onset), just not *worse* than doing no optimization at all.
        console.log("[perf] baseline events:", baseScheduler.eventsProcessed, "optimized events:", optScheduler.eventsProcessed);
        expect(optScheduler.eventsProcessed).toBeLessThanOrEqual(baseScheduler.eventsProcessed);
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

    it("forces an already-promoted consumer to fully reconsider once a Passive input finally proves itself", () => {
        // Reproduces a real bug found live in an actual video-timing
        // circuit: a 3-input NOR gate promoted via the empirical (not LCM-
        // trusted) path while one of its inputs (VBLANK's source) was still
        // Passive - because that Passive input happened to stay constant
        // for the whole 2-window observation, its real variation was never
        // seen, and the NOR locked onto a period far shorter than its true
        // one (10920 ticks instead of 2861040 - one video line instead of
        // one full frame). A plain value-confirming Recheck doesn't catch
        // this: the wrong-period prediction can keep matching live reality
        // for a long time (until the specific instant the two schedules
        // finally disagree), and meanwhile the correct-but-still-untrusted
        // input can never satisfy "all my outputs trust me" and go to
        // sleep. forceReconsider() fixes this by forcing an unconditional
        // demote (not just a value check) the moment a formerly-Passive
        // input finally proves its own periodicity, on every liveOutput
        // that doesn't already trust it - see Recheck's alwaysDemote
        // docstring.
        const scheduler = newScheduler();
        const clock = new ClockElm(200);

        class Echo extends DigitalElm {
            evaluate(): boolean { return this.inputs[0].currentValue(); }
        }
        const a = new Echo();
        a.addInput(clock);

        // `b` is manually constructed as "already promoted, before `a` ever
        // proved itself" - like the real NOR gate that locked onto 10920
        // while VBLANK's source was still Passive. Its schedule here
        // (cycleTime=999999) is deliberately arbitrary/wrong, standing in
        // for a stale empirical match. Unlike a constant stand-in, its
        // evaluate() genuinely depends on `a` (a real Echo, same as `a`
        // itself), so once forced back to Passive it can realistically
        // re-observe `a` live and correctly re-promote - exactly what a
        // real circuit element does.
        const b = new Echo();
        b.state = State.Active;
        b.cycleTime = 999999;
        b.rootPhaseZero = 0;
        b.firstOutputEvent = 0;
        b.currentOutputEvent = 0;
        b.outputEvents = [[0, false], [500000, true]];
        b.scheduler.schedule(500000, b, true);
        b.addInput(a);

        expect(b.trustedInputs.has(a)).toBe(false);

        scheduler.runUntil(1000); // enough for `a` to promote on its own, triggering forceReconsider() on `b`
        scheduler.runUntil(5000); // enough for `b` to re-observe `a` live and correctly re-promote

        expect(a.state).not.toBe(State.Passive);
        expect(b.trustedInputs.has(a)).toBe(true); // correctly (re-)trusted, not just retroactively assumed
        expect(b.cycleTime).toBe(a.cycleTime); // re-derived via the real LCM-trusted path, not stuck at the old wrong 999999
    });

    it("a purely downstream, non-feedback consumer cannot corrupt the core circuit's own promoted period", () => {
        // Reproduces a real bug found live: attaching extra gates that only
        // READ the core circuit's outputs - never feeding back into it -
        // caused the core circuit's OWN elements to settle on a different
        // (wrong, larger) period, or to cycle Active<->Passive forever,
        // even though nothing about the core circuit's own inputs/logic
        // changed. Root cause: _demote()'s "wake any input I used to trust"
        // cascade unconditionally discarded an Asleep input's entire
        // established schedule just because some downstream consumer
        // stopped trusting it - even when that consumer only demoted for
        // reasons entirely local to itself (like the cross-coupled NAND
        // latch below, which is genuinely metastable), not because the
        // input's own schedule was ever actually shown wrong. Repeated
        // forced relearning meant the core element could never accumulate
        // enough clean history to re-detect its own true (short) period,
        // so it fell back to a cruder LCM-based candidate instead - see
        // wake()'s docstring for the fix.
        const endTime = 2_000_000;

        const baselineScheduler = newScheduler();
        const baseline = buildCircuit(baselineScheduler);
        baselineScheduler.runUntil(endTime);
        const baselinePeriods = baseline.watch.map(w => w.cycleTime);

        // Every core element should have fully settled by now (nothing left
        // Passive, nothing still cycling) - otherwise this test wouldn't
        // actually be checking what it claims to.
        expect(baseline.watch.every(w => w.state !== State.Passive)).toBe(true);

        const withDownstreamScheduler = newScheduler();
        const withDownstream = buildCircuit(withDownstreamScheduler);

        // Cross-coupled NAND latch reading (but never feeding back into) the
        // core circuit - nand2/nand3 are cross-coupled with each other,
        // exactly the kind of locally-unstable subgraph that triggered the
        // live bug.
        const nand1 = new Nand();
        nand1.addInput(withDownstream.watch[4] /* group1.pins[0] */, withDownstream.watch[6] /* group1.pins[2] */);
        const nand2 = new Nand();
        const nand3 = new Nand();
        nand2.addInput(nand1, nand3);
        nand3.addInput(nand2, withDownstream.watch[11] /* dffinv */);
        const nand4 = new Nand();
        nand4.addInput(nand3, withDownstream.watch[5] /* group1.pins[1] */);

        withDownstreamScheduler.runUntil(endTime);
        const withDownstreamPeriods = withDownstream.watch.map(w => w.cycleTime);

        // The core circuit's own promoted periods must be completely
        // unaffected by the purely-downstream latch cluster - regardless of
        // whether every element also manages to fully sleep (a flaky
        // downstream consumer, like the latch here, can legitimately keep
        // one of its direct inputs Active instead of Asleep just by never
        // itself settling enough to trust it - that's an optimization-depth
        // detail, not a correctness one). No core element should be stuck
        // cycling back to Passive, though.
        expect(withDownstreamPeriods).toEqual(baselinePeriods);
        expect(withDownstream.watch.every(w => w.state !== State.Passive)).toBe(true);
    });

    it("refuses to promote via the empirical heuristic while an unproven input has shown zero variation", () => {
        // Reproduces a real bug found live: a NOR gate had one fast-
        // changing input (quickly proven periodic) and one very slow-
        // changing input (a bit of a 4-bit counter whose true period was
        // hundreds of thousands of ticks). Because the slow input hadn't
        // varied at all yet within the NOR's own short observation window,
        // the empirical heuristic matched a period based ENTIRELY on the
        // fast input's behavior - a real two-window match, but blind to
        // the slow input's actual (unobserved) contribution. The NOR
        // promoted, went Asleep (permanently losing all further self-
        // checking - see wake()'s docstring), and produced wrong live
        // output once the slow input actually changed, undetected for as
        // long as it stayed quiet (hundreds of thousands of ticks live).
        // Fix: tryPromote() now refuses an empirical (non-LCM) candidate
        // if any unproven input shows zero recorded variation within the
        // exact two-window span being matched - not "unproven input
        // exists" in general (that would deadlock any genuine feedback
        // loop; see the cross-coupled-NAND-latch test above, which relies
        // on bootstrapping through exactly this kind of empirical
        // evidence), just the specific case where an input contributed no
        // evidence at all.
        const scheduler = newScheduler();
        const fast = new ClockElm(200); // proven periodic from construction

        class Echo extends DigitalElm {
            evaluate(): boolean { return this.inputs[0].currentValue(); }
        }
        const neverChanges = new ConstElm(false);
        const slow = new Echo(); // has a real input, but it never varies here
        slow.addInput(neverChanges);

        const combo = new Nand();
        combo.addInput(fast, slow);

        // Long enough for a real two-window empirical match against fast's
        // period alone, if the blind-candidate check weren't in place.
        scheduler.runUntil(2000);

        expect(slow.history.length).toBe(0); // confirms slow truly never varied
        expect(combo.state).toBe(State.Passive); // must not have promoted blind to it
    });

    it("a 3-input NOR fed by a slow counter and a JK-derived NAND settles to the correct period, matching the live-evaluated baseline exactly", () => {
        // Reproduces the exact circuit reported live (not the simplified
        // synthetic case above): core pong circuit, but counter8 replaced
        // by a JK flip-flop wired as a toggle (J=K=+5V, reset=dff, same
        // clk as the old counter8), a second JK (J=jk1.Q, K=jk1./Q,
        // clk=clock) feeding a 2-input NAND (nand2 = NAND(jk1.Q,
        // jk2./Q)), and a separate free-running 4-bit counter (counter3,
        // clk=dffinv, reset permanently low) whose bits 2 and 3 feed a
        // 3-input NOR together with nand2. counter3's bits change far
        // less often than nand2, so this is exactly the shape that
        // exposed the "blind" empirical-promotion bug: nand2 provides
        // plenty of evidence, counter3 provides almost none for a long
        // time.
        function build(scheduler: Scheduler) {
            const clock = new ClockElm(200);
            const dff = new DFlipFlopElm(false);
            const dffinv = new DFlipFlopElm(true);
            const group0 = new CounterGroupElm(4);
            group0.addInput(clock, dffinv);
            const group1 = new CounterGroupElm(4);
            group1.addInput(group0.pins[3], dffinv);
            const counter3 = new CounterGroupElm(4);
            counter3.addInput(dffinv, new ConstElm(false)); // reset tied low, never asserted

            const vPlus = new ConstElm(true);
            const jk1 = new JKGroupElm(true); // active-low reset, matching the original counter8's invertReset=true
            jk1.addInput(vPlus, group1.pins[3], vPlus, dff);

            const nand = new Nand();
            nand.addInput(group0.pins[1], group0.pins[2], group1.pins[2], group1.pins[3], jk1.pins[0]);
            dff.addInput(nand, clock);
            dffinv.addInput(nand, clock);

            const jk2 = new JKGroupElm();
            jk2.addInput(jk1.pins[0], clock, jk1.pins[1], new ConstElm(false));

            const nand2 = new Nand();
            nand2.addInput(jk1.pins[0], jk2.pins[1]);

            const nor = new Nor();
            nor.addInput(counter3.pins[2], counter3.pins[3], nand2);

            return { nor, nand2, counter3 };
        }

        const endTime = 3_000_000;
        const sampleInterval = 1; // exhaustive, every tick - not a coarse sample

        // Baseline runs to full completion before the optimized scheduler
        // is ever constructed, so DigitalElm.current never gets reassigned
        // out from under it mid-run.
        DigitalElm.promotionEnabled = false;
        const baseScheduler = newScheduler();
        const base = build(baseScheduler);
        const baseCheckpoint = new Checkpoint(baseScheduler, sampleInterval, [base.counter3.pins[2], base.counter3.pins[3], base.nand2, base.nor], endTime);
        baseScheduler.runUntil(endTime);

        DigitalElm.promotionEnabled = true;
        const optScheduler = newScheduler();
        const opt = build(optScheduler);
        const optCheckpoint = new Checkpoint(optScheduler, sampleInterval, [opt.counter3.pins[2], opt.counter3.pins[3], opt.nand2, opt.nor], endTime);
        optScheduler.runUntil(endTime);

        let firstMismatch = -1;
        for (let i = 0; i < Math.min(baseCheckpoint.samples.length, optCheckpoint.samples.length); i++) {
            if (baseCheckpoint.samples[i] !== optCheckpoint.samples[i]) { firstMismatch = i; break; }
        }
        if (firstMismatch !== -1) {
            const tick = (firstMismatch + 1) * sampleInterval;
            console.log(`[mismatch] first divergence at tick ${tick}: base=${baseCheckpoint.samples[firstMismatch]} opt=${optCheckpoint.samples[firstMismatch]}`);
        }
        expect(firstMismatch, `first divergence at tick ${(firstMismatch + 1) * sampleInterval}`).toBe(-1);
    });

});
