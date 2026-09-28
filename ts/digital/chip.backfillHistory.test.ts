// Targeted unit test for Chip.backfillHistory() (see noble-stirring-rabin.md Phase 5), which
// reconstructs `history` for a chip that's currently ASLEEP by walking its own outputEvents
// schedule with a side-effect-free cursor. Builds a Chip directly (not through a real promoted
// circuit - reliably driving a real chip all the way to ASLEEP via the promotion machinery is
// its own can of worms, not what this test is targeting) and hand-seeds its Cycle/outputEvents
// fields the same way clockChip.ts's clockLogic() and updateOutput()'s real ASLEEP-entry branch
// do, then verifies the walk against times/values worked out by hand from those same two real
// code paths (see the comment above each expectation below for the trace).
import { describe, it, expect } from "vitest";
import { Chip, ChipState, Cycle, Event } from "./chip";
import { MAX_U64 } from "./constants";

const fakeCircuit = { globalTime: 0 } as any;

// A 1-pin CUSTOM_CHIP shell (logic:null, custom:null) - the constructor takes the CUSTOM_CHIP
// early-return path, leaving every Cycle/outputEvents field at its default, ready for us to
// hand-fill exactly like clockLogic()/activateInputs() would.
function bareChip(): Chip {
    return new Chip(8, 8, fakeCircuit, { logic: null, custom: null, delay: [0, 0], inPins: [], evPins: [], outPin: 0, prevOutPin: 0 });
}

/** Sets up a 2-entry periodic schedule (offsets 0 and `d0` within a `d0+d1`-tick period,
 * matching clockChip.ts's clockLogic() shape exactly) and puts the chip to sleep at
 * `sleepIdx`/`sleepAbsTime`/`sleepValue` - the same three fields updateOutput()'s ASLEEP-entry
 * branch seeds from `this.currentCycle.currentOutputEvent`/`globalTime`/`this.output`. */
function asleepClockChip(d0: number, d1: number, sleepIdx: number, sleepAbsTime: number, sleepValue: number): Chip {
    const chip = bareChip();
    chip.outputEvents.push_back(new Event(0));
    chip.outputEvents.push_back(new Event(d0));
    chip.cycleTime = d0 + d1;
    chip.firstOutputEvent = chip.outputEvents.begin();
    chip.currentCycle = chip as unknown as Cycle;

    chip.state = ChipState.ASLEEP;
    (chip as any).backfillPos = { level: chip, idx: sleepIdx, entryTime: 0, exitBound: MAX_U64, sub: null };
    (chip as any).backfillAbsTime = sleepAbsTime;
    (chip as any).backfillValue = sleepValue;
    return chip;
}

/** Builds a Cycle for a nested sub-cycle placeholder, matching exactly what deactivateOutputs()
 * produces: its own small periodic `entries` (each a [time, state] pair), `cycleTime` (its own
 * period) and `cycleDuration` (how much of the parent's slot for it is "active" before the parent
 * regains control - see deactivateOutputs()'s own `globalTime - activationTime + 1`). */
function makeSubCycle(entries: [number, number][], cycleTime: number, cycleDuration: number): Cycle {
    const c = new Cycle(8, 8);
    for (const [t, s] of entries) c.outputEvents.push_back(new Event(t, s));
    c.firstOutputEvent = c.outputEvents.begin();
    c.cycleTime = cycleTime;
    c.cycleDuration = cycleDuration;
    return c;
}

/** Builds a chip whose outputEvents match a real self-resetting counter's LSB exactly as captured
 * from a live repro of the reported bug (a 4-bit counter, Q2/Q3 -> AND -> reset): top-level period
 * 23976 ticks, containing 3 real toggles interleaved with 3 nested sub-cycle placeholders (each
 * period 3996, active for 3997 of those ticks) - plus one leftover placeholder before
 * firstOutputEvent, from an earlier learning round, that's never actually visited. Frozen ASLEEP
 * with currentOutputEvent resting directly ON a placeholder (matching updateOutput()'s own
 * ASLEEP-wake peek path - see captureBackfillPos()'s docstring), the exact condition that froze
 * currentValue()/backfillHistory() before this file's KNOWN GAP was fixed. Captures the actual
 * Cirque index of each pushed entry via oe.end() rather than assuming a fixed numbering - a fresh
 * Cirque's own index base is an implementation detail, not something to hardcode. */
function asleepNestedCounterChip(): Chip {
    const chip = bareChip();
    chip.currentCycle = chip as unknown as Cycle;
    chip.cycleTime = 23976;
    const oe = chip.outputEvents;

    oe.push_back(new Event(2997, 0, 1, makeSubCycle([[2997, 0], [4995, 1]], 3996, 3997))); // leftover, never visited
    const first = oe.end();
    oe.push_back(new Event(8991, 1)); // = firstOutputEvent
    chip.firstOutputEvent = first;
    const sleepIdx = oe.end();
    oe.push_back(new Event(10989, 0, 1, makeSubCycle([[10989, 0], [12987, 1]], 3996, 3997))); // the placeholder we fall asleep on
    oe.push_back(new Event(16983, 1));
    oe.push_back(new Event(18981, 0, 1, makeSubCycle([[18981, 0], [20979, 1]], 3996, 3997)));
    oe.push_back(new Event(24975, 1));
    oe.push_back(new Event(26973, 0, 1, makeSubCycle([[26973, 0], [28971, 1]], 3996, 3997)));

    chip.state = ChipState.ASLEEP;
    chip.sleepTime = 32967;
    (chip as any).backfillPos = { level: chip as unknown as Cycle, idx: sleepIdx, entryTime: 0, exitBound: MAX_U64, sub: null };
    (chip as any).backfillAbsTime = 32967;
    (chip as any).backfillValue = 1;
    return chip;
}

// Ground truth for asleepNestedCounterChip(), computed independently: every transition happens
// exactly 1998 ticks after the last (a self-resetting counter's LSB toggles at half the clock
// period, unaffected by the reset since it divides evenly - see the bug investigation), starting
// value 1 at t=32967 (the sleep-time seed).
function expectedNestedSequence(count: number): { time: number; value: number }[] {
    const out: { time: number; value: number }[] = [];
    let t = 32967, v = 1;
    for (let i = 0; i < count; i++) { t += 1998; v ^= 1; out.push({ time: t, value: v }); }
    return out;
}

describe("Chip.backfillHistory()", () => {
    it("replays transitions across a wrap boundary (delay[0]=3, delay[1]=7, asleep right after a wrap-triggered firing)", () => {
        // Trace (see clockChip.ts's clockLogic() for the same currentOutputEvent convention -
        // "index of the entry already in effect", advanced immediately after each firing, exactly
        // like this file's backfillHistory() cursor):
        //   asleep at t=110, idx=0 (value 0 already in effect - this is what a real chip's
        //   updateOutput() would have just landed on after a wrap-around firing).
        //   next: idx===firstOutputEvent(0) -> delay = time[0] + cycleTime - back().time
        //                                            = 0 + 10 - 3 = 7  -> fires at 117, value 1
        //   next: idx=1 (!=first) -> delay = time[1]-time[0] = 3-0 = 3  -> fires at 120, value 0
        //   next: idx wraps to 0 -> delay = 7 again                     -> fires at 127, value 1
        const chip = asleepClockChip(3, 7, 0, 110, 0);

        chip.backfillHistory(125);

        expect(chip.history).toEqual([
            { time: 117, value: 1 },
            { time: 120, value: 0 },
        ]);
    });

    it("is resumable: two partial calls land on the same history as one call to the later time", () => {
        const chipTwoStep = asleepClockChip(3, 7, 0, 110, 0);
        chipTwoStep.backfillHistory(118); // stops mid-way between the 117 and 120 transitions
        chipTwoStep.backfillHistory(125); // resumes from wherever it left off

        const chipOneStep = asleepClockChip(3, 7, 0, 110, 0);
        chipOneStep.backfillHistory(125);

        expect(chipTwoStep.history).toEqual(chipOneStep.history);
        expect(chipTwoStep.history).toEqual([
            { time: 117, value: 1 },
            { time: 120, value: 0 },
        ]);
    });

    it("replays several full periods forward", () => {
        // Same schedule, asleep at idx=0/t=100 (the wrap formula applies from idx=0 regardless of
        // whether this is a real post-wrap position or - as here - a synthetic starting point;
        // see the first test's comment for why idx=0 always means "delay = cycleTime -
        // back().time" = 7, not delay[0]=3 - that asymmetry is real: a genuine chip can only ever
        // reach ASLEEP mid-simulation after at least one real firing already advanced past its
        // special-cased construction-time schedule (see clockChip.ts), never straight from
        // activation, so idx=0 always means "just wrapped" in practice). Period is 10 ticks
        // (3+7), alternating +7/+3 forever: 107,110,117,120,127,130,137,140,(147 > 145, stop).
        const chip = asleepClockChip(3, 7, 0, 100, 0);
        chip.backfillHistory(145);

        const expectedTimes = [107, 110, 117, 120, 127, 130, 137, 140];
        expect(chip.history.map(h => h.time)).toEqual(expectedTimes);
        // Values alternate strictly (2 flips/period keeps parity across each wrap).
        expect(chip.history.map(h => h.value)).toEqual([1, 0, 1, 0, 1, 0, 1, 0]);
    });

    it("does nothing for a chip that isn't ASLEEP", () => {
        const chip = asleepClockChip(3, 7, 0, 110, 0);
        chip.state = ChipState.ACTIVE;
        chip.backfillHistory(200);
        expect(chip.history).toEqual([]);
    });

    it("does nothing (rather than mutating anything) once already caught up to `now`", () => {
        const chip = asleepClockChip(3, 7, 0, 110, 0);
        chip.backfillHistory(110); // now === backfillAbsTime already
        expect(chip.history).toEqual([]);
    });

    it("returns `now` once it actually catches up to it", () => {
        const chip = asleepClockChip(3, 7, 0, 110, 0);
        expect(chip.backfillHistory(125)).toBe(125);
    });

    it("returns partial progress (not `now`) when a single call's iteration budget runs out first - the resumable cursor callers MUST clamp to instead of assuming `history` is complete up to `now` (see ScopePlot.fillFromDigitalHistory()/ScopePlot2d.fillDigitalRaster())", () => {
        // Period 2 ticks (d0=1, d1=1): reaching a `now` millions of ticks out needs one real
        // toggle per tick - far more than advanceBackfillPos()'s own per-call iteration budget.
        const chip = asleepClockChip(1, 1, 0, 0, 0);
        const reached = chip.backfillHistory(3_000_000);

        expect(reached).toBeGreaterThan(0);
        expect(reached).toBeLessThan(3_000_000);
        // Everything actually recorded is real (strictly increasing time, strictly alternating
        // value) - the walk just hasn't reached `now` yet, it isn't wrong about what it recorded.
        expect(chip.history.length).toBeGreaterThan(0);
        for (let i = 1; i < chip.history.length; i++) {
            expect(chip.history[i].time).toBeGreaterThan(chip.history[i - 1].time);
            expect(chip.history[i].value).toBe(1 - chip.history[i - 1].value);
        }

        // Resumable: further calls make further progress and eventually do reach `now`.
        let t = reached;
        for (let i = 0; i < 5 && t < 3_000_000; i++) t = chip.backfillHistory(3_000_000);
        expect(t).toBe(3_000_000);
    });

    // Regression coverage for the KNOWN GAP this file's backfillHistory()/currentValue() used to
    // have: a chip asleep with currentOutputEvent resting on (or, mid-walk, wrapping onto) a
    // nested SUBCYCLE_MASK placeholder - the exact shape a self-resetting counter's irregular
    // period compiles to (see chip.ts's Chip.currentValue() and BackfillPos's own docstrings).
    describe("nested sub-cycles", () => {
        it("backfillHistory() descends into and out of nested sub-cycles correctly", () => {
            const chip = asleepNestedCounterChip();
            const expected = expectedNestedSequence(20);
            chip.backfillHistory(expected[expected.length - 1].time);
            expect(chip.history).toEqual(expected);
        });

        it("currentValue() matches at every point along the way, without mutating backfillHistory()'s own cursor", () => {
            const chip = asleepNestedCounterChip();
            const expected = expectedNestedSequence(20);
            for (const { time, value } of expected) {
                (chip.circuit as any).globalTime = time;
                expect(chip.currentValue()).toBe(value);
            }
            // currentValue() never wrote back to the shared cursor - backfillHistory() from
            // scratch still walks (and records) the exact same full sequence.
            chip.backfillHistory(expected[expected.length - 1].time);
            expect(chip.history).toEqual(expected);
        });

        it("is resumable across many small, irregularly-spaced calls (as ScopePlot really drives it) - regression for a real bug where a call that climbed out of a sub-cycle but landed short of `now` lost track of how much of the sub-cycle's span it had already consumed, corrupting the next call's result", () => {
            const chip = asleepNestedCounterChip();
            const expected = expectedNestedSequence(30);
            const finalTime = expected[expected.length - 1].time;

            let t = chip.sleepTime;
            let step = 733; // deliberately not a multiple of 1998, like an unrelated render rate
            while (t < finalTime) {
                t += step;
                step = (step * 7 + 91) % 3000 + 500; // keep the spacing irregular call to call
                chip.backfillHistory(t < finalTime ? t : finalTime);
            }

            expect(chip.history).toEqual(expected);
        });
    });
});
