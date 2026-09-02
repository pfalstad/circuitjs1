// Regression test for a real scope-display bug (reported as "big white streaks"/"missing detail"
// in the 2-D raster scope, worse the faster the sim runs): `history` (chip.ts's append-only
// scope-plot trace - see its own field comment) can end up different depending on nothing but how
// often it's polled, for the exact same underlying circuit run over the exact same tick range.
//
// Mechanism: a chip's promoted/ASLEEP schedule (activateInputs()'s periodicity proof) is
// sometimes wrong - built from too little evidence, particularly for a chip whose inputs are
// themselves two independently-clocked signals (e.g. an AND of two counter bits with unrelated
// periods - the exact shape of scopebug.txt/scopebug2.txt's "16H AND 16V"/"64H AND 64V"). While
// ASLEEP, `this.output` never actually changes except via wakeUp()'s own replay - backfillHistory()
// (driven once per Scope.draw(), see ScopePlot.fillFromDigitalHistory()/ScopePlot2d.fillDigitalRaster())
// is deliberately non-mutating with respect to `this.output` (see its own docstring), but it DOES
// record into `history` - so a scope polling with small, frequent steps can catch a chip mid-sleep,
// walk its (eventually-falsified) schedule, and permanently record transitions that group up into
// blocks nothing in the real circuit ever produced - while a scope polling with large, infrequent
// steps might jump clean over the same sleep episode without ever seeing it mid-flight, recording
// only the one real transition at the far end. Same circuit, same tick range, different `history` -
// purely a function of how the caller happened to chop up its calls to backfillHistory(). This is
// NOT a promotion-correctness bug (the live simulation - `this.output`/`currentValue()` once the
// chip has actually woken - is unaffected either way); it's specifically about what gets
// permanently written into the scope's own trace.
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
 * brightness input) - the shape that actually triggers the false-period promotion: two
 * independently-clocked counter bits, ANDed, with no other consumer forcing a real correction
 * until one of them happens to toggle again. */
function buildCircuit(clockPeriodTicks: number) {
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

    const andChip = chipsByElm.get(and)![0];
    return { circuit, andChip };
}

/** Runs to `totalTicks`, calling backfillHistory() after every run() step, with `step` (roughly)
 * ticks advanced per call - the same shape ScopePlot really drives this in (once per draw(), with
 * however many ticks happen to have elapsed since the last draw - see SimulationManager.runCircuit()).
 * A small `step` models a slow-running sim (few ticks accumulate per draw); a large `step` models a
 * fast one (many ticks accumulate per draw, well past a single ASLEEP episode in one jump). */
function runWithStep(totalTicks: bigint, step: bigint): { time: bigint; value: number }[] {
    const { circuit, andChip } = buildCircuit(4);
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

        // Not a promotion bug - the live circuit converges to the same real transitions either
        // way (compare only entries each trace agrees are genuine wake-driven transitions, i.e.
        // strip out the disputed span nobody but the granular walk ever claimed). What this
        // documents is that they're NOT identical: `history` itself depends on polling cadence.
        console.log("slow (step=100) history length:", slow.length);
        console.log("fast (step=5000) history length:", fast.length);

        expect(slow).not.toEqual(fast);
    }, 60000);
});
