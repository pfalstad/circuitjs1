// Regression test for a real scope-display bug (reported as "big white streaks"/"missing detail"
// in the 2-D raster scope, worse the faster the sim runs): `history` (chip.ts's append-only
// scope-plot trace - see its own field comment) can end up different depending on nothing but how
// often it's polled, for the exact same underlying circuit run over the exact same tick range.
//
// Confirmed mechanism (via a ground-truth `optimizationDisabled` baseline - see the second test
// below): large-step polling mostly DROPS genuine transitions, plus occasionally records a
// handful of extra ones at times the real signal never actually transitions at. Both trace back
// to the same root cause. A sleeping chip's real wake (wakeUp()/updateOutput()'s ASLEEP branch)
// only ever fast-forwards `this.output` through at most one (possibly partial) trailing period -
// `time = (globalTime - sleepTime) % cycleTime` - because that's all live simulation correctness
// needs (the value only has to be right by the time something real reads it again); any whole
// periods elapsed before that trailing one are never visited, so their `this.output`-setter-
// triggered writes into `history` simply never happen (the dropped majority of the gap), and the
// ONE transition this cheap replay does compute and write can itself land on a time/value the
// verified-correct granular walk (backfillHistory()'s own advanceBackfillPos(), which does visit
// every period) would NOT have produced for that same span (the occasional spurious extra entry -
// `this.output`/`currentValue()` still converges back to correct once a subsequent real input
// event forces a fresh, fully-informed re-promotion; only the momentary value recorded into
// `history` before that point can be wrong). The ONLY thing that ever records the intermediate
// transitions correctly is backfillHistory()'s own granular walk - and (before the fix below) that
// walk was skipped on wake whenever nobody had polled `backfillHistory()` during that SPECIFIC
// sleep episode (chip.ts's old `catchUpHistoryBeforeWake()` guard: `backfillAbsTime <=
// sleepTime`), leaving the cheap/unreliable replay as `history`'s only writer for that episode.
// Small-step ("slow") polling calls `backfillHistory()` often enough to almost always catch each
// sleep episode mid-flight; large-step ("fast") polling - or, more precisely, ANY gap between
// polls wide enough to let a whole sleep-wake-resleep cycle complete unpolled - hits this every
// time instead. This gets worse the faster the sim runs (more ticks, hence more whole sleep
// episodes, elapse per Scope.draw()) - matching the reported symptom ("white streaks" from the
// drops, occasional wrong-colored pixels from the rarer spurious entries).
//
// Fix: chip.ts's `historyWatched` flag (set by ScopePlot.setDigitalChip() the first time a Scope
// resolves its digitalChip to a given Chip) makes `catchUpHistoryBeforeWake()` do the granular
// walk on EVERY wake for a watched chip, regardless of whether that specific episode got polled
// first - closing the gap for any chip an actual Scope can display, while leaving unwatched chips
// (the common case - most chips in a circuit have no Scope attached) on the old cheap path.
import { describe, it, expect, beforeEach } from "vitest";
import { ChipState } from "./chip";
import type { Chip } from "./chip";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import { CounterElm } from "../CounterElm";
import { DFlipFlopElm } from "../DFlipFlopElm";
import { JKFlipFlopElm } from "../JKFlipFlopElm";
import { NandGateElm, AndGateElm } from "../GateElm";
import { RailElm } from "../RailElm";
import { VoltageElm } from "../VoltageElm";
import { CircuitElm } from "../CircuitElm";
import { TIMESCALE } from "./constants";

beforeEach(() => { CircuitElm.sim = { t: 0, maxTimeStep: 1e-6 } as any; });

const DELAY_S = 2 * TIMESCALE;

function fakeRail(frequency: number) {
    const r = Object.create(RailElm.prototype) as RailElm;
    (r as any).waveform = VoltageElm.WF_SQUARE;
    (r as any).maxVoltage = 5;
    (r as any).bias = 0;
    (r as any).frequency = frequency;
    (r as any).FLAG_CLOCK = 1;
    (r as any).flags = 1;
    r.nodes = [];
    return r;
}
function clockFrequencyForPeriodTicks(periodTicks: number): number { return 1 / (periodTicks * TIMESCALE); }
function tieSource(tie: "VCC" | "GND") { return { digitalTie: () => tie, nodes: [] as { links: { num: number; elm: any }[] }[] }; }
function connect(...posts: { elm: any; num: number }[]): void {
    const node = { links: posts.map(p => ({ num: p.num, elm: p.elm })) };
    for (const p of posts) p.elm.nodes[p.num] = node;
}
function counterElm(bits: number, flags: number) {
    const c = Object.create(CounterElm.prototype) as any;
    c.bits = bits;
    c.modulus = 0;
    c.invertreset = true; // active-low reset
    c.flags = flags;
    c.propagationDelay = DELAY_S;
    c.nodes = [];
    return c;
}
function bitPost(bits: number, weight: number): number { return 2 + (bits - 1 - Math.log2(weight)); }
function dff() {
    const f = Object.create(DFlipFlopElm.prototype) as any;
    f.flags = 0; f.propagationDelay = DELAY_S; f.nodes = [];
    return f;
}
function nand(inputCount: number) {
    const g = Object.create(NandGateElm.prototype) as any;
    g.inputCount = inputCount; g.flags = 0; g.propagationDelay = DELAY_S; g.nodes = [];
    return g;
}
function andGate() {
    const g = Object.create(AndGateElm.prototype) as any;
    g.inputCount = 2; g.flags = 0; g.propagationDelay = DELAY_S; g.nodes = [];
    return g;
}
const NEG = CounterElm.FLAG_NEGATIVE_EDGE;

/** Same self-resetting H+V counter shape as _fullSelfReset.test.ts's buildCircuit() (see its own
 * comment), plus one extra AND gate combining "16H" and "16V" - matching scopebug.txt/
 * scopebug2.txt's real repro circuits ("16H AND 16V" / "64H AND 64V" feeding the raster scope's
 * brightness input) - the shape whose promoted schedule sleeps and re-wakes often enough, with
 * short-enough periods relative to a "fast" step, to make the dropped-transitions gap (see this
 * file's header comment) show up reliably. `optDisabled`, when true, forces every chip's
 * optimizationDisabled (real per-tick simulation, no promotion/sleep at all) for the
 * always-correct ground-truth baseline the third test below compares against. */
function buildCircuit(clockPeriodTicks: number, optDisabled = false) {
    const clock = fakeRail(clockFrequencyForPeriodTicks(clockPeriodTicks));

    const hCounter = counterElm(9, NEG);
    const nand5 = nand(5);
    const hresetFF = dff();
    connect({ elm: nand5, num: 5 }, { elm: hresetFF, num: 0 });
    connect({ elm: clock, num: 0 }, { elm: hresetFF, num: 3 });
    const HRESET = { elm: hresetFF, num: 1 };

    connect({ elm: clock, num: 0 }, { elm: hCounter, num: 0 });
    connect(HRESET, { elm: hCounter, num: 1 });
    for (let k = 0; k < 5; k++) {
        const weight = [2, 4, 64, 128, 256][k];
        connect({ elm: hCounter, num: bitPost(9, weight) }, { elm: nand5, num: k });
    }

    const nand3 = nand(3);
    const vresetFF = dff();
    connect({ elm: nand3, num: 3 }, { elm: vresetFF, num: 0 });
    connect({ elm: clock, num: 0 }, { elm: vresetFF, num: 3 });
    const VRESET = { elm: vresetFF, num: 1 };

    const vChip1 = counterElm(4, NEG);
    connect(HRESET, { elm: vChip1, num: 0 });
    connect(VRESET, { elm: vChip1, num: 1 });
    const vChip1MSB = { elm: vChip1, num: bitPost(4, 8) };

    const vChip2 = counterElm(4, NEG);
    connect(vChip1MSB, { elm: vChip2, num: 0 });
    connect(VRESET, { elm: vChip2, num: 1 });
    const vChip2MSB = { elm: vChip2, num: bitPost(4, 8) };

    const vJK = Object.create(JKFlipFlopElm.prototype) as any;
    vJK.flags = JKFlipFlopElm.FLAG_RESET | JKFlipFlopElm.FLAG_INVERT_RESET;
    vJK.propagationDelay = DELAY_S;
    vJK.nodes = [];
    const vcc = tieSource("VCC");
    connect({ elm: vcc, num: 0 }, { elm: vJK, num: 0 });
    connect(vChip2MSB, { elm: vJK, num: 1 });
    connect({ elm: vcc, num: 0 }, { elm: vJK, num: 2 });
    connect(VRESET, { elm: vJK, num: 5 });

    const vbitPost = (weight: number): { elm: any; num: number } => {
        if (weight === 256) return { elm: vJK, num: 3 };
        if (weight >= 16) return { elm: vChip2, num: bitPost(4, weight / 16) };
        return { elm: vChip1, num: bitPost(4, weight) };
    };
    for (const [k, weight] of [1, 4, 256].entries())
        connect(vbitPost(weight), { elm: nand3, num: k });

    const and = andGate();
    connect({ elm: hCounter, num: bitPost(9, 16) }, { elm: and, num: 0 }); // 16H
    connect(vbitPost(16), { elm: and, num: 1 }); // 16V

    const elmList = [clock, vcc, hCounter, nand5, hresetFF, nand3, vresetFF, vChip1, vChip2, vJK, and];
    const { circuit, chipsByElm } = buildDigitalCircuit(elmList);
    if (optDisabled) for (const chip of circuit.chips) chip.optimizationDisabled = true;

    const andChip = chipsByElm.get(and)![0];
    return { circuit, andChip };
}

/** Runs to `totalTicks`, calling backfillHistory() after every run() step, with `step` (roughly)
 * ticks advanced per call - the same shape ScopePlot really drives this in (once per draw(), with
 * however many ticks happen to have elapsed since the last draw - see SimulationManager.runCircuit()).
 * A small `step` models a slow-running sim (few ticks accumulate per draw); a large `step` models a
 * fast one (many ticks accumulate per draw, well past a single ASLEEP episode in one jump).
 * `watched`, when true, mirrors ScopePlot.setDigitalChip() marking the chip historyWatched - the
 * fix under test. */
function runWithStep(totalTicks: bigint, step: bigint, watched = false): { time: bigint; value: number }[] {
    const { circuit, andChip } = buildCircuit(4);
    if (watched) andChip.historyWatched = true;
    let t = 0n;
    while (t < totalTicks) {
        t += step;
        if (t > totalTicks) t = totalTicks;
        circuit.run(t - circuit.globalTime);
        if (andChip.state === ChipState.ASLEEP) andChip.backfillHistory(circuit.globalTime);
    }
    return andChip.history.slice();
}

describe("Chip.history depends on backfillHistory() polling granularity", () => {
    it("small-step ('slow') polling and large-step ('fast') polling record different history for the same circuit run", () => {
        const totalTicks = 40_000n;

        // A modest ~50x gap, not an extreme one - doesn't require the fast run to leap clean over
        // a whole raster frame, just to take bigger bites between polls than the slow run does.
        const slow = runWithStep(totalTicks, 100n);
        const fast = runWithStep(totalTicks, 5_000n);

        // Documents that an UNWATCHED chip's `history` still depends on polling cadence - that's
        // the deliberate, cheap-by-default tradeoff (see this file's header comment): nothing
        // reads `history` for a chip no Scope has ever resolved its digitalChip to, so there's no
        // reason to pay for a gapless one. The next two tests pin down, against a ground-truth
        // baseline, that (a) this cadence-dependence really is large-step polling DROPPING real
        // transitions rather than small-step polling inventing fictional ones, and (b) marking
        // the chip historyWatched (what ScopePlot.setDigitalChip() does) fixes it.
        console.log("slow (step=100) history length:", slow.length);
        console.log("fast (step=5000) history length:", fast.length);

        expect(slow).not.toEqual(fast);
    }, 60000);

    it("large-step ('fast') polling both drops and misrecords transitions relative to an always-correct baseline", () => {
        const totalTicks = 40_000n;

        const base = buildCircuit(4, true);
        base.circuit.run(totalTicks);
        const baseHist = base.andChip.history.filter(h => h.time <= totalTicks);
        const baseline = new Set(baseHist.map(h => `${h.time}:${h.value}`));

        const fast = runWithStep(totalTicks, 5_000n).filter(h => h.time <= totalTicks);

        console.log("baseline length:", baseHist.length, "fast length:", fast.length);

        // Mostly missing detail: substantially fewer entries than the ground truth.
        expect(fast.length).toBeLessThan(baseHist.length * 0.8);

        // ...plus at least one entry the real signal never actually produced - see this file's
        // header comment on why the cheap wake-time replay can occasionally get this wrong too,
        // not just drop entries.
        const spurious = fast.filter(h => !baseline.has(`${h.time}:${h.value}`));
        expect(spurious.length).toBeGreaterThan(0);
    }, 60000);

    it("historyWatched=true makes large-step ('fast') polling match the always-correct baseline", () => {
        const totalTicks = 40_000n;

        const base = buildCircuit(4, true);
        base.circuit.run(totalTicks);
        const baseline = base.andChip.history.filter(h => h.time <= totalTicks);

        const fastWatched = runWithStep(totalTicks, 5_000n, true).filter(h => h.time <= totalTicks);

        expect(fastWatched).toEqual(baseline);
    }, 60000);
});
