import { describe, it, expect } from "vitest";
import { Scheduler } from "./Scheduler";
import { DigitalElm, DigitalConst, GroupPin, State } from "./DigitalElm";
import { CounterElm } from "../CounterElm";

// A real bug found live: a CounterElm with a non-power-of-2 modulus (a
// "count to N then reset" line/frame counter, like a real video timing
// generator uses - not plain binary overflow) has an IRREGULAR
// multi-transition pattern within its true period (modulus * clockPeriod) -
// not derivable from any input's own cycleTime, since the modulus is
// internal configuration invisible to tryPromote()'s generic engine. Left to
// empirical guessing alone, a short, purely coincidental period could match
// two (or even three) windows well before the wraparound irregularity was
// ever observed even once, locking in a badly wrong period forever with
// compounding drift on every recurrence. Fixed via CounterElm's own
// extraPromotionCandidates() (an analytically exact modulus*clockPeriod
// candidate) plus tryPromote() waiting for that trusted candidate to have
// enough history before falling back to a weaker guess.

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
    evaluate(): boolean { throw new Error("clock always active"); }
}

function buildModulusCounter(scheduler: Scheduler) {
    DigitalElm.current = scheduler;
    const clock = new ClockElm(20);
    const resetInactive = new DigitalConst(true); // invertreset=true -> true = inactive

    const counter = Object.create(CounterElm.prototype) as any;
    counter.invertreset = true;
    counter.modulus = 13; // non-power-of-2 - the case that exposed the bug
    counter.flags = 0;
    counter.bits = 4;
    counter.inputs = [clock, resetInactive];
    counter.digitalPins = Array.from({ length: 4 }, (_, k) => new GroupPin(counter, k));
    for (const p of counter.digitalPins) p.addInput(...counter.inputs);
    for (const p of counter.digitalPins) if (p.state === State.Passive) p.inputUpdated(null);

    return { scheduler, counter };
}

describe("CounterElm modulus promotion", () => {
    it("promotes each bit to the true modulus*clockPeriod, not a coincidentally-matching shorter guess", () => {
        const { scheduler, counter } = buildModulusCounter(new Scheduler());
        DigitalElm.promotionEnabled = true;
        scheduler.runUntil(50_000);

        const truePeriod = 13 * 20; // modulus * clock period
        for (const pin of counter.digitalPins) {
            expect(pin.state, "should have promoted").not.toBe(State.Passive);
            expect(pin.cycleTime).toBe(truePeriod);
        }
    });

    it("matches the always-correct baseline over many full modulus cycles", () => {
        DigitalElm.promotionEnabled = false;
        const base = buildModulusCounter(new Scheduler());
        base.scheduler.runUntil(500_000);

        DigitalElm.promotionEnabled = true;
        const opt = buildModulusCounter(new Scheduler());
        opt.scheduler.runUntil(500_000);

        for (let k = 0; k < 4; k++) {
            const baseHist = base.counter.digitalPins[k].history;
            const optPin = opt.counter.digitalPins[k];
            if (optPin.state === State.Asleep) optPin._backfillHistory(500_000);
            const optHist = optPin.history.filter(([t]: [number, boolean]) => t <= 500_000);

            expect(optHist, `bit ${k} transition count`).toHaveLength(baseHist.length);
            for (let i = 0; i < baseHist.length; i++)
                expect(optHist[i], `bit ${k} transition ${i}`).toEqual(baseHist[i]);
        }
    });
});
