// Regression coverage for Counter2Elm.digitalSynthesisRipple() (the modulus===0 fast path added
// alongside the pre-existing digitalSynthesisWholeRegister(), mirroring
// CounterElm.digitalSynthesisRipple() - see that file's docstring for why a whole-register design
// structurally blocks ChipState.ASLEEP). Same methodology as CounterElm.test.ts: compares the
// optimized ripple synthesis against dice-ts's own "always-correct baseline"
// (Chip.optimizationDisabled -> Chip.updateInputsSimple()) bit-for-bit (and RCO-for-RCO) over many
// clock cycles.
//
// LOAD and CLR are deliberately held constant in that comparison rather than driven by their own
// independent free-running clocks: two independent square waves on this engine's integer tick
// grid are edge sequences in arithmetic progression, which are guaranteed to land an edge on the
// exact same tick periodically - the same "same-instant race, arbitrary resolution order" case
// chip.ts's 1-tick delay floor comment documents as unresolved in general (it only fixes an
// output racing its OWN input, not two unrelated inputs racing each other). That's a property of
// the engine, not of this synthesis, so it's exercised separately below with LOAD/CLR pulses
// placed well clear of any CLK edge instead of against an independent oscillator.
import { describe, it, expect, beforeEach } from "vitest";
import { ChipState } from "./chip";
import type { Chip } from "./chip";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit, seedInitialDigitalState } from "./DigitalGraphBuilder";
import { Counter2Elm } from "../Counter2Elm";
import { RailElm } from "../RailElm";
import { VoltageElm } from "../VoltageElm";
import { CircuitElm } from "../CircuitElm";
import { LogicInputElm } from "../LogicInputElm";
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

// A real LogicInputElm, for placing a LOAD or CLR pulse at an exact, hand-picked tick clear of
// any CLK edge - see buildRippleCounter()'s own comment on why an independent oscillator can't be
// used for this instead. Unlike a DigitalTieSource (RailElm's DC tie, baked into the netlist as a
// hardwired constant at synthesis time - see DigitalGraphBuilder's own comment), a LogicInputElm
// gets its own live CUSTOM_CHIP whose value can still be pushed after the circuit is built, via
// toggle() once digitalChip is wired up below.
function manualPin(initial: "VCC" | "GND") {
    const elm = Object.create(LogicInputElm.prototype) as LogicInputElm;
    (elm as any).position = initial === "VCC" ? 1 : 0;
    (elm as any).posCount = 2;
    (elm as any).momentary = false;
    (elm as any).label = null;
    (elm as any).flags = 0;
    (elm as any).hiV = 5;
    (elm as any).loV = 0;
    elm.digitalChip = null;
    elm.nodes = [];
    return elm;
}

function setPin(elm: LogicInputElm, value: "VCC" | "GND"): void {
    const wantHigh = value === "VCC";
    if (((elm as any).position !== 0) !== wantHigh) elm.toggle();
}

// A genuine constant (RailElm-style DC tie) - fine for VCC/GND/ENP/ENT since those never change
// mid-run in these tests, unlike LOAD/CLR above.
function tie(value: "VCC" | "GND") {
    return { digitalTie: () => value, nodes: [] as { links: { num: number; elm: any }[] }[] };
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

/** Builds a fresh modulus-0 (plain binary, realmod=16) 4-bit Counter2Elm graph: a real RailElm
 * square-wave clock (period 20 ticks) drives CLK; LOAD and CLR are manualPin()s (VCC/inactive by
 * default, since both are active-low) so a test can either leave them alone for a clean
 * free-running comparison or flip them once at a specific tick. ENP/ENT are tied active; the I
 * pins are tied to a fixed 1010 pattern so a LOAD pulse is observable. */
function buildRippleCounter(savedQ?: boolean[]) {
    const clock = fakeRail(VoltageElm.WF_SQUARE, { frequency: clockFrequencyForPeriodTicks(20) });
    const vcc = tie("VCC");
    const gnd = tie("GND");
    const load = manualPin("VCC"); // inactive (active-low)
    const clr = manualPin("VCC");  // inactive (active-low)

    const counter = Object.create(Counter2Elm.prototype) as any;
    counter.bits = 4;
    counter.modulus = 0;
    counter.flags = 0;
    counter.nodes = [];
    // Only needed by the digitalInitialState() seeding test below - digitalInitialState() reads
    // this.pins[post].value directly (see its own docstring), same as ChipElm.undumpXml()-restored
    // state would after a real reimport. Left unset otherwise, matching every other test in this
    // file (which never seeds, so never touches counter.pins at all).
    if (savedQ) counter.pins = Array.from({ length: counter.getPostCount() }, (_, i) => ({ value: savedQ[i] ?? false }));

    // pin layout for bits=4 (see Counter2Elm.setupPins()): Q0-3 @ 0-3, I0-3 @ 4-7, clk=8, clr=9,
    // enp=10, rco=11, load=12, ent=13.
    connect({ elm: clock, num: 0 }, { elm: counter, num: 8 });
    connect({ elm: clr, num: 0 }, { elm: counter, num: 9 });
    connect({ elm: vcc, num: 0 }, { elm: counter, num: 10 }); // ENP
    connect({ elm: load, num: 0 }, { elm: counter, num: 12 });
    connect({ elm: vcc, num: 0 }, { elm: counter, num: 13 }); // ENT
    connect({ elm: vcc, num: 0 }, { elm: counter, num: 4 }); // I0 = 1
    connect({ elm: gnd, num: 0 }, { elm: counter, num: 5 }); // I1 = 0
    connect({ elm: vcc, num: 0 }, { elm: counter, num: 6 }); // I2 = 1
    connect({ elm: gnd, num: 0 }, { elm: counter, num: 7 }); // I3 = 0

    const bitSinks = Array.from({ length: 4 }, () => probe());
    bitSinks.forEach((sink, k) => connect({ elm: counter, num: k }, { elm: sink, num: 0 }));
    const rcoSink = probe();
    connect({ elm: counter, num: 11 }, { elm: rcoSink, num: 0 });

    const { circuit, chipsByElm } = buildDigitalCircuit([clock, vcc, gnd, load, clr, counter, ...bitSinks, rcoSink]);
    load.digitalChip = chipsByElm.get(load)![0];
    clr.digitalChip = chipsByElm.get(clr)![0];
    const { pinMap, desc } = counter.digitalSynthesis();
    const chipFor = (post: number): Chip => {
        const pin = pinMap.get(post)!;
        const idx = desc.findIndex((d: any) => d.outPin === pin);
        return chipsByElm.get(counter)![idx];
    };
    const bitChips: Chip[] = bitSinks.map((_, k) => chipFor(k));
    const rcoChip = chipFor(11);
    return { circuit, bitChips, rcoChip, load, clr, counter, chipsByElm };
}

function currentValue(bitChips: Chip[]): number {
    let value = 0;
    for (let w = 0; w < bitChips.length; w++) if (bitChips[w].currentValue()) value |= 1 << w;
    return value;
}

describe("Counter2Elm modulus===0 ripple synthesis", () => {
    it("matches the always-correct baseline over many free-running clock cycles", () => {
        const runTicks = 500_000n;

        const base = buildRippleCounter();
        // `history` only records for a historyWatched chip (see chip.ts's `output` setter) - both
        // circuits' chips need it marked directly (standing in for a Scope having attached) since
        // this test reads `.history` straight off them as ground truth.
        for (const chip of base.circuit.chips) { chip.optimizationDisabled = true; chip.historyWatched = true; }
        base.circuit.run(runTicks);

        const opt = buildRippleCounter();
        for (const chip of opt.circuit.chips) chip.historyWatched = true;
        opt.circuit.run(runTicks);

        const baseChips = [...base.bitChips, base.rcoChip];
        const optChips = [...opt.bitChips, opt.rcoChip];
        const labels = ["bit 0", "bit 1", "bit 2", "bit 3", "RCO"];

        for (let k = 0; k < baseChips.length; k++) {
            const baseHist = baseChips[k].history;
            const optChip = optChips[k];
            if (optChip.state === ChipState.ASLEEP) optChip.backfillHistory(opt.circuit.globalTime);
            const optHist = optChip.history.filter(h => h.time <= runTicks);

            expect(optHist, `${labels[k]} transition count`).toHaveLength(baseHist.length);
            for (let i = 0; i < baseHist.length; i++)
                expect(optHist[i], `${labels[k]} transition ${i}`).toEqual(baseHist[i]);
        }
    });

    it("settles every bit and its gating cells to ASLEEP shortly after a clock edge (the actual point of the ripple rewrite)", () => {
        const { circuit, bitChips } = buildRippleCounter();
        for (const chip of circuit.chips) chip.historyWatched = true;
        circuit.run(50_003n); // clear of the tick-50000 clock edge (period 20), giving it time to resettle

        for (const chip of bitChips)
            expect(chip.state, `${chip.debugName} should be ASLEEP long after its last clock edge`).toBe(ChipState.ASLEEP);
    });

    // LOAD and CLR are checked against the same always-correct-baseline methodology as the first
    // test above (rather than hand-computed expected bit patterns, which would just be prone to
    // the same off-by-one-tick mistakes as the engine itself guards against) - both circuits get
    // the identical LOAD/CLR pulses at the identical ticks, and their resulting Q/RCO patterns
    // must agree at every checkpoint.
    it("LOAD and CLR pulses match the always-correct baseline", () => {
        const base = buildRippleCounter();
        for (const chip of base.circuit.chips) chip.optimizationDisabled = true;
        const opt = buildRippleCounter();

        // Circuit.run() advances by a duration from wherever it currently is, not to an absolute
        // time - runUntil() converts the absolute ticks used below into the right deltas for both
        // circuits (which always advance in lockstep here).
        let now = 0n;
        const runUntil = (absoluteTick: bigint) => {
            const delta = absoluteTick - now;
            base.circuit.run(delta);
            opt.circuit.run(delta);
            now = absoluteTick;
        };
        const bothSetLoad = (v: "VCC" | "GND") => { setPin(base.load, v); setPin(opt.load, v); };
        const bothSetClr = (v: "VCC" | "GND") => { setPin(base.clr, v); setPin(opt.clr, v); };
        const expectMatch = (label: string) => {
            expect(currentValue(opt.bitChips), label).toBe(currentValue(base.bitChips));
            expect(opt.rcoChip.currentValue(), `${label} RCO`).toBe(base.rcoChip.currentValue());
        };

        runUntil(103n); // clear of any CLK edge (period 20)
        bothSetLoad("GND"); // assert LOAD (active-low)
        runUntil(115n); // still clear of the next edge
        expectMatch("LOAD asserted, before next edge");

        runUntil(125n); // cross one CLK edge with LOAD asserted (I pins = 1010 = 5)
        expectMatch("after LOAD edge");
        bothSetLoad("VCC"); // release LOAD so counting resumes

        runUntil(300n); // several more free-running edges
        expectMatch("counting resumed after LOAD");

        bothSetClr("GND"); // assert CLR (active-low) - takes effect immediately, no clock edge needed
        runUntil(301n);
        expectMatch("CLR asserted");
        expect(currentValue(opt.bitChips), "CLR asserted").toBe(0);

        bothSetClr("VCC");
        runUntil(340n); // a couple of clean edges after release
        expectMatch("counting resumed after CLR");
    });
});

// Regression test for a digitalInitialState() bug: modulus===0's ripple synthesis holds its real
// state on an internal-only pin (intPin(w)), buffered out to the external Q post by a separate,
// memoryless cell (see digitalSynthesisRipple()'s own comments). digitalInitialState() used to
// name the buffer's own outPin instead of the state cell's - seedInitialDigitalState() would seed
// that buffer's `.output` directly, but the buffer recomputes as `pin[out] = pin[internal]` on its
// very next tick, silently overwriting the seed with the still-cold (0) internal pin - so a
// reimported counter's restored count got discarded before the very first real clock edge, and
// that edge then counted up from 0 instead of from the saved value (reported as the count
// "skipping backwards" after save/reimport).
// currentValue() above reads post k as bit weight k, which happens to be backwards from the real
// hardware weight order digitalSynthesisRipple() actually counts in (bit 0/LSB - the one clocked
// directly off cntPin - lands on post bits-1, per that function's own qPin(w) = bits-w and
// Counter2Elm.execute()'s identical pins[lastBit-i] convention). That reversal is harmless for the
// other tests above (they only ever compare base vs. opt under the same convention), but a test
// asserting a real arithmetic count needs the actual hardware order.
function hardwareValue(bitChips: Chip[]): number {
    const bits = bitChips.length;
    let value = 0;
    for (let w = 0; w < bits; w++) if (bitChips[bits - 1 - w].currentValue()) value |= 1 << w;
    return value;
}

describe("Counter2Elm modulus===0 ripple synthesis - digitalInitialState seeding", () => {
    it("resumes counting from a restored (reimported) count instead of restarting from 0", () => {
        // pins[post].value for post 0..3, MSB-first per execute()'s pins[lastBit-i] convention -
        // encodes a saved count of 5 (0b0101).
        const savedQ = [false, true, false, true];
        const { circuit, bitChips, rcoChip, counter, chipsByElm } = buildRippleCounter(savedQ);
        seedInitialDigitalState([counter], chipsByElm);

        expect(hardwareValue(bitChips), "seeded value before any clock edge").toBe(5);

        circuit.run(20n); // one full clock period -> exactly one counting edge
        expect(hardwareValue(bitChips), "value after first real clock edge").toBe(6);
        expect(rcoChip.currentValue(), "RCO").toBe(0);
    });
});
