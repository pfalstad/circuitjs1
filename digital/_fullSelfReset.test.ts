// Rewritten against the new dice-ts-based engine (see noble-stirring-rabin.md's Testing
// section: "Keep _fullSelfReset.test.ts's long-run integration test as the end-to-end regression
// gate for the whole rewrite"). Same circuit structure as the old digital/DigitalElm.ts-based
// version, built from REAL element classes (CounterElm, DFlipFlopElm, JKFlipFlopElm,
// NandGateElm) via digitalSynthesis() + a real dice-ts Circuit instead of hand-rolled
// GroupPin/DigitalElm wiring:
//   H: 9-bit self-resetting counter (bits -> nand5 -> hresetFF -> Q=HRESET feeds back into H's
//      OWN reset pin).
//   V: two 4-bit ripple-cascaded counters + a JK 9th bit, ALL clocked ultimately from HRESET
//      (vChip1 directly, vChip2/vJK via ripple carry), and ALL reset by VRESET (vChip1/vChip2
//      directly, vJK via its own invert-reset flag) - VRESET generated the same way as HRESET:
//      V's own bits -> nand3 -> vresetFF -> Q=VRESET, feeding back into V's OWN reset pins.
import { describe, it, expect, beforeEach } from "vitest";
import { ChipState } from "./chip";
import type { Chip } from "./chip";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import { CounterElm } from "../CounterElm";
import { DFlipFlopElm } from "../DFlipFlopElm";
import { JKFlipFlopElm } from "../JKFlipFlopElm";
import { NandGateElm } from "../GateElm";
import { RailElm } from "../RailElm";
import { VoltageElm } from "../VoltageElm";
import { CircuitElm } from "../CircuitElm";
import { TIMESCALE } from "./constants";

beforeEach(() => {
    CircuitElm.sim = { t: 0, maxTimeStep: 1e-6 } as any;
});

// Uniform 2-tick propagation delay on every gate/chip, matching the old test's DELAY_TICKS=2.
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

function clockFrequencyForPeriodTicks(periodTicks: number): number {
    return 1 / (periodTicks * TIMESCALE);
}

function tieSource(tie: "VCC" | "GND") {
    return { digitalTie: () => tie, nodes: [] as { links: { num: number; elm: any }[] }[] };
}

function probe() {
    return {
        digitalSynthesis: () => ({ desc: [customChipStart(() => { }).inputPins(1)], pinMap: new Map([[0, 1]]) }),
        nodes: [] as { links: { num: number; elm: any }[] }[],
    };
}

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

/** Real post index of a CounterElm's bit of the given power-of-2 `weight` - posts 2..bits+1 are
 * the bits MSB-first (post2 = weight 2^(bits-1), post bits+1 = weight 2^0). */
function bitPost(bits: number, weight: number): number {
    return 2 + (bits - 1 - Math.log2(weight));
}

function dff() {
    const f = Object.create(DFlipFlopElm.prototype) as any;
    f.flags = 0;
    f.propagationDelay = DELAY_S;
    f.nodes = [];
    return f;
}

function nand(inputCount: number) {
    const g = Object.create(NandGateElm.prototype) as any;
    g.inputCount = inputCount;
    g.flags = 0;
    g.propagationDelay = DELAY_S;
    g.nodes = [];
    return g;
}

const NEG = CounterElm.FLAG_NEGATIVE_EDGE;

/** Builds one fresh instance of the full H+V self-resetting structure. Returns every element plus
 * the full elmList to hand to buildDigitalCircuit(), and hbit()/vbit() weight-indexed accessors
 * mirroring the old test's helpers. */
function buildCircuit() {
    const clock = fakeRail(clockFrequencyForPeriodTicks(4));

    // H: self-resetting.
    const hCounter = counterElm(9, NEG);
    const nand5 = nand(5);
    const hresetFF = dff();
    connect({ elm: nand5, num: 5 }, { elm: hresetFF, num: 0 }); // D
    connect({ elm: clock, num: 0 }, { elm: hresetFF, num: 3 }); // clk
    const HRESET = { elm: hresetFF, num: 1 }; // Q

    connect({ elm: clock, num: 0 }, { elm: hCounter, num: 0 }); // clk
    connect(HRESET, { elm: hCounter, num: 1 }); // reset
    for (let k = 0; k < 5; k++) {
        const weight = [2, 4, 64, 128, 256][k];
        connect({ elm: hCounter, num: bitPost(9, weight) }, { elm: nand5, num: k });
    }

    // V: self-resetting via its OWN nand3/vresetFF, reset pins wired to VRESET (vJK included).
    const nand3 = nand(3);
    const vresetFF = dff();
    connect({ elm: nand3, num: 3 }, { elm: vresetFF, num: 0 }); // D
    connect({ elm: clock, num: 0 }, { elm: vresetFF, num: 3 }); // clk
    const VRESET = { elm: vresetFF, num: 1 }; // Q

    const vChip1 = counterElm(4, NEG);
    connect(HRESET, { elm: vChip1, num: 0 }); // clk
    connect(VRESET, { elm: vChip1, num: 1 }); // reset
    const vChip1MSB = { elm: vChip1, num: bitPost(4, 8) };

    const vChip2 = counterElm(4, NEG);
    connect(vChip1MSB, { elm: vChip2, num: 0 }); // clk
    connect(VRESET, { elm: vChip2, num: 1 }); // reset
    const vChip2MSB = { elm: vChip2, num: bitPost(4, 8) };

    const vJK = Object.create(JKFlipFlopElm.prototype) as any;
    vJK.flags = JKFlipFlopElm.FLAG_RESET | JKFlipFlopElm.FLAG_INVERT_RESET;
    vJK.propagationDelay = DELAY_S;
    vJK.nodes = [];
    const vcc = tieSource("VCC");
    connect({ elm: vcc, num: 0 }, { elm: vJK, num: 0 }); // J
    connect(vChip2MSB, { elm: vJK, num: 1 }); // clk
    connect({ elm: vcc, num: 0 }, { elm: vJK, num: 2 }); // K
    connect(VRESET, { elm: vJK, num: 5 }); // reset

    const vbitPost = (weight: number): { elm: any; num: number } => {
        if (weight === 256) return { elm: vJK, num: 3 }; // Q
        if (weight >= 16) return { elm: vChip2, num: bitPost(4, weight / 16) };
        return { elm: vChip1, num: bitPost(4, weight) };
    };
    for (const [k, weight] of [1, 4, 256].entries())
        connect(vbitPost(weight), { elm: nand3, num: k });

    // Every element whose output isn't otherwise consumed within the feedback loops needs an
    // external sink to survive circuit.ts's dead-code elimination: notQ of every D/JK flip-flop,
    // and any V bit not already read by nand3.
    const sinks: any[] = [];
    const keepAlive = (elm: any, num: number) => {
        const sink = probe();
        connect({ elm, num }, { elm: sink, num: 0 });
        sinks.push(sink);
    };
    keepAlive(hresetFF, 2); // notQ
    keepAlive(vresetFF, 2); // notQ
    keepAlive(vJK, 4); // notQ
    for (const weight of [1, 2, 4, 8, 16, 32, 64, 128, 256]) keepAlive(hCounter, bitPost(9, weight));
    for (const weight of [1, 2, 4, 8]) { keepAlive(vChip1, bitPost(4, weight)); keepAlive(vChip2, bitPost(4, weight)); }

    const elmList = [clock, vcc, hCounter, nand5, hresetFF, nand3, vresetFF, vChip1, vChip2, vJK, ...sinks];
    const { circuit, chipsByElm } = buildDigitalCircuit(elmList);

    const chipAt = (elm: any, post: number): Chip => {
        const { pinMap, desc } = elm.digitalSynthesis();
        const pin = pinMap.get(post)!;
        const idx = desc.findIndex((d: any) => d.outPin === pin);
        return chipsByElm.get(elm)![idx];
    };

    const hbit = (weight: number) => chipAt(hCounter, bitPost(9, weight));
    const vbit = (weight: number) => {
        const p = vbitPost(weight);
        return chipAt(p.elm, p.num);
    };

    return { circuit, hCounter, nand5, hresetFF, vChip1, vChip2, vJK, nand3, vresetFF, hbit, vbit };
}

/** Simpler self-resetting circuit than buildCircuit() above: a 4-bit counter (1H,2H,4H,8H)
 * driven directly by the clock, whose MSB (8H) clocks a second 4-bit counter (16H,32H,64H,128H).
 * A single 3-input NAND on 2H, 4H, 16H feeds a D flip-flop clocked by the SAME clock as the first
 * counter; its Q output resets both counters. Q (not /Q) is correct here: NAND(2H,4H,16H) is 0
 * only once the target count is reached, and D=0 latched into Q=0 is exactly the "reset asserted"
 * level counterElm.invertreset expects - using /Q instead inverts that, asserting reset whenever
 * the target ISN'T yet reached and releasing it only once it is, which permanently deadlocks both
 * counters at 0 the first time it triggers (NAND(0,0,0)=1 forever after, keeping D=1, keeping
 * /Q=0 asserted forever). See ../dice-ts/src/games/pong.ts for the equivalent real-chip circuit
 * this was modeled on. */
function buildSimpleCircuit() {
    const clock = fakeRail(clockFrequencyForPeriodTicks(4));

    const counter1 = counterElm(4, NEG);
    connect({ elm: clock, num: 0 }, { elm: counter1, num: 0 }); // clk
    const counter1MSB = { elm: counter1, num: bitPost(4, 8) };

    const counter2 = counterElm(4, NEG);
    connect(counter1MSB, { elm: counter2, num: 0 }); // clk

    const nand3 = nand(3);
    connect({ elm: counter1, num: bitPost(4, 2) }, { elm: nand3, num: 0 }); // 2H
    connect({ elm: counter1, num: bitPost(4, 4) }, { elm: nand3, num: 1 }); // 4H
    connect({ elm: counter2, num: bitPost(4, 1) }, { elm: nand3, num: 2 }); // 16H

    const ff = dff();
    connect({ elm: nand3, num: 3 }, { elm: ff, num: 0 }); // D
    connect({ elm: clock, num: 0 }, { elm: ff, num: 3 }); // clk - same clock as counter1
    const RESET = { elm: ff, num: 1 }; // Q

    connect(RESET, { elm: counter1, num: 1 }); // reset
    connect(RESET, { elm: counter2, num: 1 }); // reset

    // Every output not otherwise consumed needs an external sink so circuit.ts's dead-code
    // elimination doesn't drop it: /Q of the flip-flop, and any counter bit not read by nand3.
    const sinks: any[] = [];
    const keepAlive = (elm: any, num: number) => {
        const sink = probe();
        connect({ elm, num }, { elm: sink, num: 0 });
        sinks.push(sink);
    };
    keepAlive(ff, 2); // /Q
    for (const weight of [1, 8]) keepAlive(counter1, bitPost(4, weight));
    for (const weight of [2, 4, 8]) keepAlive(counter2, bitPost(4, weight));

    const elmList = [clock, counter1, counter2, nand3, ff, ...sinks];
    const { circuit, chipsByElm } = buildDigitalCircuit(elmList);

    const chipAt = (elm: any, post: number): Chip => {
        const { pinMap, desc } = elm.digitalSynthesis();
        const pin = pinMap.get(post)!;
        const idx = desc.findIndex((d: any) => d.outPin === pin);
        return chipsByElm.get(elm)![idx];
    };

    return {
        circuit, counter1, counter2, nand3, ff, chipAt,
        bit1: (weight: number) => chipAt(counter1, bitPost(4, weight)),
        bit2: (weight: number) => chipAt(counter2, bitPost(4, weight / 16)), // weight is external (16..128)
    };
}

describe("simplified self-resetting counter pair (single reset domain)", () => {
    it("settles after a long run", () => {
        const c = buildSimpleCircuit();
        c.circuit.run(2_000_000n);
        const report = (label: string, chip: Chip) =>
            console.log(`${label}: state=${ChipState[chip.state]} cycleTime=${chip.cycleTime} historyLen=${chip.history.length}`);
        for (const w of [1, 2, 4, 8]) report(`counter1 bit${w}`, c.bit1(w));
        for (const w of [16, 32, 64, 128]) report(`counter2 bit${w}`, c.bit2(w));

        for (const w of [1, 2, 4, 8])
            expect(c.bit1(w).state, `counter1 bit${w} should settle to ASLEEP`).toBe(ChipState.ASLEEP);
        for (const w of [16, 32, 64, 128])
            expect(c.bit2(w).state, `counter2 bit${w} should settle to ASLEEP`).toBe(ChipState.ASLEEP);
    }, 30000);
});

describe("full self-resetting H+V (corrected structure)", () => {
    it("settles after a long run", () => {
        const c = buildCircuit();
        c.circuit.run(2_000_000n);
        const report = (label: string, chip: Chip) =>
            console.log(`${label}: state=${ChipState[chip.state]} cycleTime=${chip.cycleTime} historyLen=${chip.history.length}`);
        report("nand5", c.hbit(2)); // representative - see per-signal reports below
        for (const w of [1, 4, 16, 64, 256]) report(`V bit${w}`, c.vbit(w));
    }, 30000);

    it("matches an always-correct baseline over 2,000,000 ticks (V bit 256 and 128)", () => {
        const runTicks = 2_000_000n;

        const base = buildCircuit();
        for (const chip of base.circuit.chips) chip.optimizationDisabled = true;
        base.circuit.run(runTicks);

        const opt = buildCircuit();
        opt.circuit.run(runTicks);

        for (const w of [128, 256]) {
            const baseHist = base.vbit(w).history;
            const optChip = opt.vbit(w);
            if (optChip.state === ChipState.ASLEEP) optChip.backfillHistory(opt.circuit.globalTime);
            const optHist = optChip.history.filter(h => h.time <= runTicks);

            expect(optHist, `V bit${w} transition count`).toHaveLength(baseHist.length);
            for (let i = 0; i < baseHist.length; i++)
                expect(optHist[i], `V bit${w} transition ${i}`).toEqual(baseHist[i]);
        }
    }, 60000);
});

