// Rewritten against the new dice-ts-based engine (see noble-stirring-rabin.md's Testing
// section). Same real bug this test originally guarded: a CounterElm with a non-power-of-2
// modulus (a "count to N then reset" line/frame counter, not plain binary overflow) has an
// IRREGULAR multi-transition pattern within its true period (modulus * clockPeriod). The new
// engine doesn't have the old empirical-promotion heuristic that could lock onto a wrong period,
// but this test still earns its keep as a correctness check on CounterElm.digitalSynthesis()
// itself against dice-ts's own "always-correct baseline" path (Chip.optimizationDisabled ->
// Chip.updateInputsSimple()) over many full modulus cycles, exactly the methodology the old
// digital/DigitalElm.ts-based test used (promotionEnabled=false vs true), just against the new
// engine's own optimization mechanism instead.
import { describe, it, expect, beforeEach } from "vitest";
import { ChipState } from "./chip";
import type { Chip } from "./chip";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import { CounterElm } from "../CounterElm";
import { RailElm } from "../RailElm";
import { VoltageElm } from "../VoltageElm";
import { CircuitElm } from "../CircuitElm";
import { TIMESCALE } from "./constants";

beforeEach(() => {
    CircuitElm.sim = { t: 0, maxTimeStep: 1e-6 } as any;
});

function fakeRail(waveform: number, opts: { maxVoltage?: number; bias?: number; frequency?: number; flags?: number } = {}) {
    const r = Object.create(RailElm.prototype) as RailElm;
    (r as any).waveform = waveform;
    (r as any).maxVoltage = opts.maxVoltage ?? 5;
    (r as any).bias = opts.bias ?? 0;
    (r as any).frequency = opts.frequency ?? 1000;
    (r as any).FLAG_CLOCK = 1;
    (r as any).flags = opts.flags ?? 1;
    r.nodes = [];
    return r;
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

// periodTicks*TIMESCALE seconds total period -> frequency such that halfPeriodTicks rounds
// exactly to periodTicks/2 (see RailElm.digitalSynthesis()).
function clockFrequencyForPeriodTicks(periodTicks: number): number {
    return 1 / (periodTicks * TIMESCALE);
}

/** Builds a fresh modulus-13 4-bit CounterElm graph: a real RailElm square-wave clock (period 20
 * ticks, matching the old ClockElm(20)) feeding a real CounterElm(bits=4, modulus=13,
 * invertreset=true) whose reset is tied inactive (VCC, since invertreset=true -> active-low). */
function buildModulusCounter() {
    const clock = fakeRail(VoltageElm.WF_SQUARE, { frequency: clockFrequencyForPeriodTicks(20) });
    const resetInactive = { digitalTie: () => "VCC" as const, nodes: [] as { links: { num: number; elm: any }[] }[] };

    const counter = Object.create(CounterElm.prototype) as any;
    counter.bits = 4;
    counter.modulus = 13; // non-power-of-2 - the case that exposed the original bug
    counter.invertreset = true;
    counter.flags = 0;
    counter.propagationDelay = 0;
    counter.nodes = [];

    connect({ elm: clock, num: 0 }, { elm: counter, num: 0 });
    connect({ elm: resetInactive, num: 0 }, { elm: counter, num: 1 });
    const bitSinks = Array.from({ length: 4 }, () => probe());
    bitSinks.forEach((sink, k) => connect({ elm: counter, num: 2 + k }, { elm: sink, num: 0 }));

    const { circuit, chipsByElm } = buildDigitalCircuit([clock, resetInactive, counter, ...bitSinks]);
    const bitChips: Chip[] = bitSinks.map((_, k) => {
        const { pinMap, desc } = counter.digitalSynthesis();
        const pin = pinMap.get(2 + k)!;
        const idx = desc.findIndex((d: any) => d.outPin === pin);
        return chipsByElm.get(counter)![idx];
    });
    return { circuit, bitChips };
}

describe("CounterElm modulus promotion", () => {
    it("matches the always-correct baseline over many full modulus cycles", () => {
        const runTicks = 500_000n;

        const base = buildModulusCounter();
        for (const chip of base.circuit.chips) chip.optimizationDisabled = true;
        base.circuit.run(runTicks);

        const opt = buildModulusCounter();
        opt.circuit.run(runTicks);

        for (let k = 0; k < 4; k++) {
            const baseHist = base.bitChips[k].history;
            const optChip = opt.bitChips[k];
            if (optChip.state === ChipState.ASLEEP) optChip.backfillHistory(opt.circuit.globalTime);
            const optHist = optChip.history.filter(h => h.time <= runTicks);

            expect(optHist, `bit ${k} transition count`).toHaveLength(baseHist.length);
            for (let i = 0; i < baseHist.length; i++)
                expect(optHist[i], `bit ${k} transition ${i}`).toEqual(baseHist[i]);
        }
    });
});
