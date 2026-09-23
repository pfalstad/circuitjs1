// Correctness coverage for Counter193Elm.digitalSynthesis() (a generalized port of dice-ts's
// chips/74193.ts - see that class's docstring for the derivation). Drives a real bits=4 instance
// through count-up, count-up-carry-and-wrap, count-down-with-borrow, LD (async load) and CLR
// (async reset), checking both the Q bits and the CO/BO (active-low) outputs land where the
// real chip's datasheet says they should.
import { describe, it, expect, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import type { Chip } from "./chip";
import { Counter193Elm } from "../Counter193Elm";
import { CircuitElm } from "../CircuitElm";
import { connect } from "./testWiring";

beforeEach(() => {
    CircuitElm.sim = { t: 0, maxTimeStep: 1e-6 } as any;
});

function manualSource(initial: 0 | 1) {
    const src = {
        nodes: [] as { links: { num: number; elm: any }[] }[],
        value: initial,
        chip: null as Chip | null,
        digitalSynthesis: () => ({
            desc: [customChipStart((chip: Chip) => {
                if (src.value !== chip.output) chip.pendingEvent = chip.circuit.queuePush(chip, 0);
            }).outputPin(1)],
            pinMap: new Map([[0, 1]]),
        }),
        set(v: 0 | 1) {
            src.value = v;
            if (src.chip && v !== src.chip.output) src.chip.pendingEvent = src.chip.circuit.queuePush(src.chip, 0);
        },
    };
    return src;
}

// A plain input-only sink, just to give an output post a real (non-shared) node - CircuitElm's
// allocNodes() fills a fresh nodes[] with the SAME shared CircuitNode.ground singleton for every
// post, so any output post nothing ever connect()s to would otherwise silently alias every OTHER
// unconnected output post onto that one shared node too (see DigitalGraphBuilder's "multiple
// drivers for a shared node" warning) - matches Counter2Elm.test.ts's identical probe() helper.
function probe() {
    return {
        digitalSynthesis: () => ({ desc: [customChipStart(() => { }).inputPins(1)], pinMap: new Map([[0, 1]]) }),
        nodes: [] as { links: { num: number; elm: any }[] }[],
    };
}

function chipAt(elm: any, post: number, chipsByElm: Map<any, Chip[]>): Chip {
    const { pinMap, desc } = elm.digitalSynthesis();
    const pin = pinMap.get(post)!;
    const idx = desc.findIndex((d: any) => d.outPin === pin);
    return chipsByElm.get(elm)![idx];
}

function buildHarness(bits: number, flags: number) {
    const counter = Object.create(Counter193Elm.prototype) as any;
    counter.bits = bits;
    counter.flags = flags;
    counter.propagationDelay = 0;
    counter.nodes = [];
    counter.setupPins(); // computes cpuPost/cpdPost/mrPost/loadPost/tcuPost/tcdPost
    // setupPins()'s allocNodes() fills every post with the SAME shared CircuitNode.ground
    // singleton - undo that so connect() below mints a real, distinct node per post instead
    // of silently merging every unconnected post onto that one shared object.
    counter.nodes = new Array(counter.getPostCount()).fill(null);

    const mr = manualSource(0);   // inactive (active-high)
    const pl = manualSource(1);   // inactive (active-low)
    const cpu = manualSource(0);
    const cpd = manualSource(1);  // held high: idle for up-counting
    const data = Array.from({ length: counter.bits }, () => manualSource(0));

    connect({ elm: mr, num: 0 }, { elm: counter, num: counter.mrPost });
    connect({ elm: pl, num: 0 }, { elm: counter, num: counter.loadPost });
    connect({ elm: cpu, num: 0 }, { elm: counter, num: counter.cpuPost });
    connect({ elm: cpd, num: 0 }, { elm: counter, num: counter.cpdPost });
    data.forEach((d, i) => connect({ elm: d, num: 0 }, { elm: counter, num: counter.dataPost(i) }));

    const qSinks = Array.from({ length: counter.bits }, () => probe());
    qSinks.forEach((sink, i) => connect({ elm: counter, num: counter.qPost(i) }, { elm: sink, num: 0 }));
    const tcuSink = probe(), tcdSink = probe();
    connect({ elm: counter, num: counter.tcuPost }, { elm: tcuSink, num: 0 });
    connect({ elm: counter, num: counter.tcdPost }, { elm: tcdSink, num: 0 });

    const elms = [mr, pl, cpu, cpd, ...data, ...qSinks, tcuSink, tcdSink, counter];
    const { circuit, chipsByElm } = buildDigitalCircuit(elms);
    for (const src of [mr, pl, cpu, cpd, ...data]) src.chip = chipsByElm.get(src)![0];
    circuit.run(20);

    const qChip = (i: number) => chipAt(counter, counter.qPost(i), chipsByElm);
    const readQ = () => {
        let value = 0;
        for (let i = 0; i < counter.bits; i++) if (qChip(i).output) value |= 1 << i;
        return value;
    };
    const tcu = () => chipAt(counter, counter.tcuPost, chipsByElm).output;
    const tcd = () => chipAt(counter, counter.tcdPost, chipsByElm).output;

    return { counter, circuit, mr, pl, cpu, cpd, data, readQ, tcu, tcd };
}

describe("Counter193Elm", () => {
    it("counts up and down with correct CO/BO, and honors LD/CLR", () => {
        const bits = 4;
        const { counter, circuit, mr, pl, cpu, cpd, data, readQ, tcu, tcd } = buildHarness(bits, 0);

        expect(readQ(), "starts at 0").toBe(0);
        expect(tcd(), "BO low: count=0 and CPD idle-high, so BO only trips once CPD itself goes low").toBe(1);

        // Count up 0 -> 15, one CPU pulse per increment.
        for (let n = 1; n <= 15; n++) {
            cpu.set(1); circuit.run(20);
            cpu.set(0); circuit.run(20);
            expect(readQ(), `count after ${n} up-pulses`).toBe(n);
        }
        // CO (carry) is asserted (active low) only while count=15 AND CPU is held low - true
        // right now, since the loop above's last pulse ended with cpu.set(0).
        expect(readQ()).toBe(15);
        expect(tcu(), "CO low: count=15 and CPU low").toBe(0);

        // One more up-pulse wraps 15 -> 0. (Note: CPU's own rising edge is unavoidably the same
        // edge that performs this increment - there's no way to hold "count=15 with CPU high" as
        // a settled state, since raising CPU IS the clock pulse, same as on real hardware.)
        cpu.set(1); circuit.run(20);
        cpu.set(0); circuit.run(20);
        expect(readQ(), "wraps to 0").toBe(0);
        expect(tcu(), "CO back high after wrap").toBe(1);

        // Switch direction: the real 74193 requires bringing the newly-idle clock back LOW
        // before the other one goes high - CPD must drop first here, since CPU rising while CPD
        // is still held high would itself read as a spurious extra up-count pulse (COUNT = CPU
        // AND CPD has no way to distinguish "mode switch" from "a real pulse" - this is genuine,
        // documented 74193 behavior, not a modeling shortcut).
        cpd.set(0); circuit.run(20); // break COUNT before CPU changes
        cpu.set(1); circuit.run(20); // CPU now idle-high for down-counting; no edge yet (CPD low)
        expect(readQ(), "switching direction this (correct) way causes no spurious count").toBe(0);
        expect(tcd(), "BO low: count=0 and CPD held low").toBe(0);

        cpd.set(1); circuit.run(20); // rising edge on CPD -> genuine down-count pulse
        expect(readQ(), "borrows down to 15").toBe(15);
        expect(tcd(), "BO high again once count leaves 0").toBe(1);

        cpd.set(0); circuit.run(20);
        cpd.set(1); circuit.run(20);
        expect(readQ(), "counts down to 14").toBe(14);

        // LD (async, transparent): load 0b0101 while LD is low, independent of any clock edge.
        data[0].set(1); data[1].set(0); data[2].set(1); data[3].set(0);
        pl.set(0); circuit.run(20);
        expect(readQ(), "LD transparently loads the data pins").toBe(0b0101);
        pl.set(1); circuit.run(20);
        expect(readQ(), "value holds once LD goes back inactive").toBe(0b0101);

        // CLR (async, overrides LD/data) forces every Q low.
        pl.set(0); circuit.run(20); // LD active again, but CLR must still win
        mr.set(1); circuit.run(20);
        expect(readQ(), "CLR forces all Q low regardless of LD/data").toBe(0);
        mr.set(0); pl.set(1); circuit.run(20);
        expect(readQ(), "once CLR releases, LD (still active) transparently reloads the data pins").toBe(0b0101);
    });

    it("FLAG_BCD wraps at 9 instead of 15, with CO/BO gated on the decade boundary", () => {
        const { circuit, cpu, cpd, readQ, tcu, tcd } = buildHarness(4, Counter193Elm.FLAG_BCD);

        expect(readQ(), "starts at 0").toBe(0);

        // Count up 0 -> 9, one CPU pulse per increment.
        for (let n = 1; n <= 9; n++) {
            cpu.set(1); circuit.run(20);
            cpu.set(0); circuit.run(20);
            expect(readQ(), `count after ${n} up-pulses`).toBe(n);
        }
        expect(tcu(), "CO low: count=9 and CPU low (unlike the 193, CO doesn't need QB/QC)").toBe(0);

        // One more up-pulse wraps 9 -> 0 (not 15 - this is the decade-specific bit 3 branch).
        cpu.set(1); circuit.run(20);
        cpu.set(0); circuit.run(20);
        expect(readQ(), "wraps to 0 at the decade boundary, not 15").toBe(0);
        expect(tcu(), "CO back high after wrap").toBe(1);

        // Switch direction (same CPD-then-CPU sequencing as the binary test, to avoid a spurious
        // extra up-pulse), then borrow down: should land on 9, not 15.
        cpd.set(0); circuit.run(20);
        cpu.set(1); circuit.run(20);
        expect(readQ(), "no spurious count from switching direction this way").toBe(0);
        expect(tcd(), "BO low: count=0 and CPD held low").toBe(0);

        cpd.set(1); circuit.run(20); // rising edge on CPD -> genuine down-count pulse
        expect(readQ(), "borrows down to 9 at the decade boundary, not 15").toBe(9);
        expect(tcd(), "BO high again once count leaves 0").toBe(1);
    });
});
