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

const fakeCircuit = { globalTime: 0n } as any;

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
function asleepClockChip(d0: bigint, d1: bigint, sleepIdx: number, sleepAbsTime: bigint, sleepValue: number): Chip {
    const chip = bareChip();
    chip.outputEvents.push_back(new Event(0n));
    chip.outputEvents.push_back(new Event(d0));
    chip.cycleTime = d0 + d1;
    chip.firstOutputEvent = chip.outputEvents.begin();
    chip.currentCycle = chip as unknown as Cycle;

    chip.state = ChipState.ASLEEP;
    (chip as any).backfillIdx = sleepIdx;
    (chip as any).backfillAbsTime = sleepAbsTime;
    (chip as any).backfillValue = sleepValue;
    return chip;
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
        const chip = asleepClockChip(3n, 7n, 0, 110n, 0);

        chip.backfillHistory(125n);

        expect(chip.history).toEqual([
            { time: 117n, value: 1 },
            { time: 120n, value: 0 },
        ]);
    });

    it("is resumable: two partial calls land on the same history as one call to the later time", () => {
        const chipTwoStep = asleepClockChip(3n, 7n, 0, 110n, 0);
        chipTwoStep.backfillHistory(118n); // stops mid-way between the 117 and 120 transitions
        chipTwoStep.backfillHistory(125n); // resumes from wherever it left off

        const chipOneStep = asleepClockChip(3n, 7n, 0, 110n, 0);
        chipOneStep.backfillHistory(125n);

        expect(chipTwoStep.history).toEqual(chipOneStep.history);
        expect(chipTwoStep.history).toEqual([
            { time: 117n, value: 1 },
            { time: 120n, value: 0 },
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
        const chip = asleepClockChip(3n, 7n, 0, 100n, 0);
        chip.backfillHistory(145n);

        const expectedTimes = [107n, 110n, 117n, 120n, 127n, 130n, 137n, 140n];
        expect(chip.history.map(h => h.time)).toEqual(expectedTimes);
        // Values alternate strictly (2 flips/period keeps parity across each wrap).
        expect(chip.history.map(h => h.value)).toEqual([1, 0, 1, 0, 1, 0, 1, 0]);
    });

    it("does nothing for a chip that isn't ASLEEP", () => {
        const chip = asleepClockChip(3n, 7n, 0, 110n, 0);
        chip.state = ChipState.ACTIVE;
        chip.backfillHistory(200n);
        expect(chip.history).toEqual([]);
    });

    it("does nothing (rather than mutating anything) once already caught up to `now`", () => {
        const chip = asleepClockChip(3n, 7n, 0, 110n, 0);
        chip.backfillHistory(110n); // now === backfillAbsTime already
        expect(chip.history).toEqual([]);
    });
});
