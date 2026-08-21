import { describe, it, expect, beforeEach, vi } from "vitest";
import { Scheduler } from "./Scheduler";
import { DigitalElm, DigitalConst, State } from "./DigitalElm";
import { CircuitElm } from "../CircuitElm";
import { DelayBufferElm } from "../DelayBufferElm";

// DelayBufferElm can't be constructed headlessly (needs CircuitElm.app - see
// ChipGroupLogic.test.ts), so this bypasses the constructor via
// Object.create(), same trick GateEvaluate.test.ts uses, while exercising
// the real evaluate()/inputUpdated() delay-and-glitch-filter logic (and,
// via the inherited base-class machinery, real promotion/sleep).
function fakeBuffer(delay: number, threshold = 2.5): DelayBufferElm {
    const buf = Object.create(DelayBufferElm.prototype) as any;
    buf.inputs = [];
    buf.liveOutputs = [];
    buf.value = false;
    buf.state = State.Passive;
    buf.history = [];
    buf.trustedInputs = new Set();
    buf.outputEvents = [];
    buf.cycleTime = 0;
    buf.firstOutputEvent = 0;
    buf.currentOutputEvent = 0;
    buf.cycleParent = null;
    buf.cycleSpanEnd = null;
    buf.currentCycle = buf;
    buf.previousCycle = null;
    buf.rootPhaseZero = 0;
    buf.sleepBase = 0;
    buf.backfillCycle = buf;
    buf.backfillTime = 0;
    buf.lastChecked = 0;
    buf.sleepRequested = false;
    buf.lastCascadedCycleTime = 0;
    buf.digitalDebug = false;
    buf.delay = delay;
    buf.threshold = threshold;
    return buf as DelayBufferElm;
}

// A DigitalConst has no inputs and never records history itself - it's a
// fine stand-in for a driver as long as tests push into `.history`
// themselves to mimic what a real commit() would do, since
// DelayBufferElm.evaluate() now reads the input's history directly (see
// debouncedValueAt()) rather than just its live .value.
function setInputAt(input: DigitalConst, tick: number, val: boolean): void {
    (input as any).value = val;
    (input as any).history.push([tick, val]);
}

beforeEach(() => {
    DigitalElm.current = new Scheduler();
    CircuitElm.sim = { maxTimeStep: 1 } as any; // 1 tick = 1 "second" for these tests
});

describe("DelayBufferElm digital delay/glitch-filter", () => {
    it("passes a sustained input change through after exactly `delay` ticks", () => {
        const buf = fakeBuffer(5);
        const input = new DigitalConst(false);
        buf.inputs = [input];
        const sched = DigitalElm.current;

        setInputAt(input, 0, true);
        buf.inputUpdated(input);
        expect(buf.value).toBe(false); // not yet - still pending

        sched.runUntil(4);
        expect(buf.value).toBe(false); // one tick short of the delay

        sched.runUntil(5);
        expect(buf.value).toBe(true); // delay elapsed, transition committed
    });

    it("filters a glitch shorter than `delay`", () => {
        const buf = fakeBuffer(10);
        const input = new DigitalConst(false);
        buf.inputs = [input];
        const sched = DigitalElm.current;

        // input rises at t=0, falls back at t=3 - well within the 10-tick delay
        setInputAt(input, 0, true);
        buf.inputUpdated(input);
        sched.runUntil(3);
        setInputAt(input, 3, false);
        buf.inputUpdated(input);

        sched.runUntil(20);
        expect(buf.value).toBe(false); // glitch never reached the output
        expect(buf.history.length).toBe(0);
    });

    it("times a late transition from the most recent edge, not the first bounce", () => {
        const buf = fakeBuffer(10);
        const input = new DigitalConst(false);
        buf.inputs = [input];
        const sched = DigitalElm.current;

        setInputAt(input, 0, true); buf.inputUpdated(input);  // t=0: A->B
        sched.runUntil(3);
        setInputAt(input, 3, false); buf.inputUpdated(input); // t=3: B->A (cancels)
        sched.runUntil(6);
        setInputAt(input, 6, true); buf.inputUpdated(input);  // t=6: A->B again

        sched.runUntil(10);
        expect(buf.value).toBe(false); // only 4 ticks since the real edge at t=6
        sched.runUntil(16);
        expect(buf.value).toBe(true); // 10 ticks after t=6
    });
});

// A real, self-driving Active source (mirrors DigitalElm.test.ts's own
// ClockElm helper) - used to verify DelayBufferElm can promote itself, not
// just stay permanently Passive.
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

describe("DelayBufferElm promotion", () => {
    it("goes Active/Asleep (not permanently Passive) behind a periodic source", () => {
        const sched = DigitalElm.current;
        const clock = new ClockElm(100); // period 100, half-period edges at 0/50/100/...
        const buf = fakeBuffer(5); // delay well under the 50-tick half-period - no glitch filtering
        buf.addInput(clock);

        sched.runUntil(5000);

        expect(buf.state).not.toBe(State.Passive);
        // Sanity: the promoted/sleeping value should still be the clock's
        // value from exactly `delay` ticks ago - e.g. at the last full
        // clock edge before "now", offset by delay.
        const elapsedInPeriod = (sched.currentTime - 5) % 100;
        const expected = elapsedInPeriod >= 50;
        expect(buf.currentValue()).toBe(expected);
    });

    it("backfills an Asleep input before reading its history (regression: thrashing Active/Passive)", () => {
        // Reproduces a real bug: this buffer's own self-driven Active
        // ticks re-verify via evaluate() on every tick (see prepare()'s
        // "active" branch in DigitalElm.ts), which calls back into
        // debouncedValueAt(). An Asleep input's .history isn't kept live -
        // reading it without backfilling first showed a stale value,
        // causing the buffer to spuriously demote, re-promote, demote
        // again, and so on - never settling into Asleep itself as long as
        // something kept asking it to reconfirm.
        const buf = fakeBuffer(5);
        const input: any = {
            state: State.Asleep,
            // Deliberately stale/incomplete - the real transition to
            // `true` at tick 20 only shows up once _backfillHistory() is
            // called, mimicking an Asleep element's real behavior.
            history: [[0, false]],
            currentValue: () => true,
            _backfillHistory: vi.fn((now: number) => { input.history.push([20, true]); }),
        };
        buf.inputs = [input];

        const sched = DigitalElm.current;
        sched.runUntil(30); // now = 30, well past the tick-20 edge + 5-tick delay

        expect((buf as any).evaluate()).toBe(true);
        expect(input._backfillHistory).toHaveBeenCalledWith(30);
    });
});
