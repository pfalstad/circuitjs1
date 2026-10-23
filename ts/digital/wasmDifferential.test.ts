// Runs small synthetic circuits on both the TypeScript and the WASM engine (via
// benchHarness.ts) and requires identical state, event counts and histories. Covers what the
// exported-netlist runs (scripts/bench-wasm.ts) can't: custom cells with no native kind, which
// the WASM engine runs as JS callbacks - here StopTriggerElm and a plain custom sink - alongside
// every native kind.
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { chipStart, customChipStart } from "./chip_desc";
import type { ChipDesc, CustomLogic } from "./chip_desc";
import { serializeDigitalCircuit } from "./DigitalGraphBuilder";
import { runBench, DEFAULT_BENCH_OPTIONS } from "./benchHarness";
import { loadWasmEngine } from "./wasmEngine";
import { clockCell, sourceCell, sramBitCell, monostableQCell, monostableExpCell, type MonostableShared } from "./nativeKinds";
import { setTimescale } from "./constants";
import { StopTriggerElm } from "../StopTriggerElm";
import { CircuitElm } from "../CircuitElm";
import { connect } from "./testWiring";

const TS = 1e-6;
let stops = 0;

beforeAll(async () => { await loadWasmEngine(); });
beforeEach(() => {
    setTimescale(TS);
    stops = 0;
    CircuitElm.sim = { t: 0, maxTimeStep: TS, digitalTickEpoch: 0 } as any;
    CircuitElm.app = { setSimRunning: (s: boolean) => { if (!s) stops++; } } as any;
});

// A duck-typed element: one ChipDesc[] plus its post -> pin map.
function elm(desc: ChipDesc[], pins: [number, number][]) {
    return { nodes: [] as any[], digitalSynthesis: () => ({ desc, pinMap: new Map(pins) }) };
}

const ticks = (n: number) => n * TS;

// Toggles on each falling edge of pin 1.
const tff = () => elm([chipStart((pin, prev, ev) => { pin[2] = (pin[1] === 0 && ev[1]) ? prev[2] ^ 1 : prev[2]; })
    .inputPins(1).eventPins(1).outputPin(2).prevOutputPin(2).outputDelayS(ticks(2), ticks(3))], [[0, 1], [1, 2]]);

const and2 = () => elm([chipStart((pin) => { pin[3] = pin[1] & pin[2]; }).inputPins(1, 2).outputPin(3)
    .outputDelayS(ticks(1), ticks(1))], [[0, 1], [1, 2], [2, 3]]);

/** A clock driving a 7-stage ripple counter, with an SRAM bit, a monostable, a stop trigger and
 * a custom sink hanging off it. Built fresh per engine: the stop trigger's state lives in the
 * element, so the two runs must not share one. */
function buildCircuit(trigger: { count: number; delay: number }) {
    const clk = elm([clockCell(3).outputDelayS(ticks(5), ticks(7)).outputPin(1)], [[0, 1]]);
    const en = elm([sourceCell(() => true).outputPin(1)], [[0, 1]]);
    const stages = Array.from({ length: 7 }, tff);
    connect({ elm: clk, num: 0 }, { elm: stages[0], num: 0 });
    for (let k = 1; k < stages.length; k++) connect({ elm: stages[k - 1], num: 1 }, { elm: stages[k], num: 0 });

    // One SRAM data bit: /WE = q0, /OE = !en (tied low via the source being high -> invert below),
    // address = q3 q4, data in = q1.
    const words = [0, 0, 0, 0];
    const mem = { read: (a: number) => words[a] ?? 0, write: (a: number, v: number) => { words[a] = v; } };
    const ram = elm([sramBitCell(mem, 2, 1, 0).inputPins(1, 2, 3, 4, 5).outputPin(6)
        .outputDelayS(ticks(2), ticks(2))], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]]);
    const gnd = elm([chipStart((pin) => { pin[1] = 0; }).outputPin(1)], [[0, 1]]);
    connect({ elm: stages[0], num: 1 }, { elm: ram, num: 0 });
    connect({ elm: gnd, num: 0 }, { elm: ram, num: 1 });
    connect({ elm: stages[3], num: 1 }, { elm: ram, num: 2 });
    connect({ elm: stages[4], num: 1 }, { elm: ram, num: 3 });
    connect({ elm: stages[1], num: 1 }, { elm: ram, num: 4 });

    // Monostable triggered by q2, 40 ticks, retriggerable.
    const shared: MonostableShared = { expireChip: null, lastT: false };
    const mono = elm([
        monostableQCell(shared, 0, () => 40, () => true).inputPins(1, 25).outputPin(2),
        monostableExpCell(shared, () => 40).inputPins(2).outputPin(25),
    ], [[0, 1], [1, 2]]);
    connect({ elm: stages[2], num: 1 }, { elm: mono, num: 0 });

    // Stop trigger on q5 & q6 & en; a custom sink on the monostable's output.
    const gate = and2();
    connect({ elm: stages[5], num: 1 }, { elm: gate, num: 0 });
    connect({ elm: stages[6], num: 1 }, { elm: gate, num: 1 });
    const gate2 = and2();
    connect({ elm: gate, num: 2 }, { elm: gate2, num: 0 });
    connect({ elm: en, num: 0 }, { elm: gate2, num: 1 });
    const trig = Object.create(StopTriggerElm.prototype) as StopTriggerElm;
    trig.nodes = [];
    trig.type = 0;
    trig.triggerVoltage = 1;
    trig.delay = trigger.delay * TS;
    trig.count = trigger.count;
    (trig as any).highVoltage = 5;
    trig.reset();
    connect({ elm: gate2, num: 2 }, { elm: trig, num: 0 });
    let sinkCalls = 0;
    const sink = elm([customChipStart(() => { sinkCalls++; }).inputPins(1)], [[0, 1]]);
    connect({ elm: mono, num: 1 }, { elm: sink, num: 0 });
    connect({ elm: ram, num: 5 }, { elm: and2(), num: 0 });

    return { elms: [clk, en, ...stages, gnd, ram, mono, gate, gate2, trig, sink], trig, sinkCalls: () => sinkCalls };
}

describe("WASM engine matches the TypeScript engine", () => {
    for (const t of [{ count: 1, delay: 0 }, { count: 3, delay: 25 }]) {
        it(`on a counter with every cell kind (stop trigger count ${t.count}, delay ${t.delay})`, async () => {
            const a = buildCircuit(t), b = buildCircuit(t);
            const jsA: CustomLogic[] = [], jsB: CustomLogic[] = [];
            const sd = serializeDigitalCircuit(a.elms, jsA);
            serializeDigitalCircuit(b.elms, jsB);
            expect(jsA.length).toBe(3); // the stop trigger's two cells and the sink

            const log: string[] = [];
            const ok = await runBench(sd, {
                ...DEFAULT_BENCH_OPTIONS, seconds: 1, fps: 2000, checkEvery: 20, watch: 1,
            }, (s) => log.push(s), { ts: jsA, wasm: jsB });
            expect(ok, log.join("\n")).toBe(true);

            // The JS cells really ran, the same way on both engines.
            expect(stops).toBeGreaterThan(1);
            expect(stops % 2).toBe(0);
            expect(a.trig.triggerCount).toBe(b.trig.triggerCount);
            expect(a.sinkCalls()).toBeGreaterThan(0);
            expect(a.sinkCalls()).toBe(b.sinkCalls());
        });
    }
});
