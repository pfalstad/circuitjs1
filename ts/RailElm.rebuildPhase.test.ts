import { describe, it, expect, afterEach } from "vitest";
import { RailElm } from "./RailElm";
import { VoltageElm } from "./VoltageElm";
import { CircuitElm } from "./CircuitElm";
import { buildDigitalCircuit, setCurrentDigitalGraph, seedInitialDigitalState } from "./digital/DigitalGraphBuilder";
import { customChipStart } from "./digital/chip_desc";
import { setTimescale } from "./digital/constants";

// A circuit edit rebuilds the whole digital graph mid-run (SimulationManager.initDigitalCircuit()),
// which re-primes every clock rail from scratch. A rail that doesn't come back on exactly the
// waveform it was already running - same edges, same absolute times, same level in between - shifts
// everything clocked off it, and since edits accumulate so does the shift: the symptom is a video
// circuit's picture creeping across the screen a little further with every edit made while it runs.
//
// Two distinct ways that used to go wrong, both covered below: the rail's phase being re-derived as
// though the rebuild instant were t=0, and the rail being born low when it was really mid-high-phase
// (which simply deletes the fall that was still due - invisible to rising-edge logic, one lost count
// per edit for every falling-edge consumer).

afterEach(() => setCurrentDigitalGraph(null));

type Edge = { t: number, v: number };

function harness(freq: number, ts: number) {
    (CircuitElm as any).sim = { maxTimeStep: ts, digitalTickEpoch: 0 };
    (CircuitElm as any).app = { developerMode: false };
    setTimescale(ts);

    const clk: any = new RailElm(0, 0, VoltageElm.WF_SQUARE);
    clk.frequency = freq;
    clk.maxVoltage = 2.5;
    clk.bias = 2.5;
    clk.nodes = [];
    const sink: any = {
        digitalSynthesis: () => ({ desc: [customChipStart(() => { }).inputPins(1)], pinMap: new Map([[0, 1]]) }),
        nodes: [] as any[],
    };
    const node = { links: [{ num: 0, elm: clk }, { num: 0, elm: sink }] };
    clk.nodes[0] = node;
    sink.nodes[0] = node;
    const elms = [clk, sink];

    // Same sequence SimulationManager.initDigitalCircuit() performs on every re-analyze.
    const build = (epochTicks: number) => {
        (CircuitElm as any).sim.digitalTickEpoch = epochTicks;
        const graph = buildDigitalCircuit(elms);
        setCurrentDigitalGraph(graph);
        graph.circuit.drainZeroDelayEvents();
        seedInitialDigitalState(elms, graph.chipsByElm);
        const chip = graph.chipsByElm.get(clk)![0];
        chip.historyWatched = true;
        return { graph, chip };
    };
    // Edge times reported in ABSOLUTE ticks, so runs either side of a rebuild are comparable.
    const run = (graph: any, chip: any, ticks: number, epochTicks: number): Edge[] => {
        const before = chip.history.length;
        graph.circuit.runWithDeadline(ticks); // clamps at exactly `ticks` (run() would overshoot)
        return chip.history.slice(before).map((h: any) => ({ t: Number(h.time) + epochTicks, v: h.value }));
    };

    const uninterrupted = (ticks: number): Edge[] => {
        const { graph, chip } = build(0);
        return run(graph, chip, ticks, 0);
    };
    const rebuiltAt = (cut: number, ticks: number): Edge[] => {
        let r = build(0);
        const before = run(r.graph, r.chip, cut, 0);
        r = build(cut);
        return before.concat(run(r.graph, r.chip, ticks - cut, cut));
    };
    return { uninterrupted, rebuiltAt };
}

describe("clock rail re-primed by a mid-run circuit edit", () => {
    // 7.159MHz at a 50ps timestep is what newdigital/score-new.txt runs at; the others check that
    // nothing here depends on the period landing neatly on the tick grid.
    for (const [freq, ts, label] of [[7159000, 5e-11, "7.159MHz @ 50ps"],
                                     [14318180, 1e-8, "14.318MHz @ 10ns"],
                                     [1000, 1e-6, "1kHz @ 1us"]] as [number, number, string][]) {
        it(`reproduces the uninterrupted waveform exactly, whatever the rebuild instant (${label})`, () => {
            const { uninterrupted, rebuiltAt } = harness(freq, ts);
            const TOTAL = 400000;
            const ref = uninterrupted(TOTAL);
            expect(ref.length).toBeGreaterThan(10); // the comparison below is only worth anything with real edges in it

            // Walk the rebuild instant through the clock's whole cycle - a step coprime-ish with
            // the period, so cuts land in the high phase, the low phase and on the edges alike.
            for (let off = 0; off < 60; off++) {
                const cut = 100000 + off * 37;
                expect({ cut, edges: rebuiltAt(cut, TOTAL) }).toEqual({ cut, edges: ref });
            }
        });
    }

    it("is born at the level the rail is really at, so a rebuild mid-high-phase keeps its fall", () => {
        const { uninterrupted, rebuiltAt } = harness(7159000, 5e-11);
        const TOTAL = 400000;
        const ref = uninterrupted(TOTAL);
        // 200000 ticks in, this rail is partway through a high phase (period is 2794 ticks, high
        // starts at 1397 into each; 200000 % 2794 === 1626), with its fall still to come.
        const rebuilt = rebuiltAt(200000, TOTAL);
        const fallsAfterCut = (e: Edge[]) => e.filter(x => x.v === 0 && x.t >= 200000).length;
        expect(fallsAfterCut(rebuilt)).toBe(fallsAfterCut(ref));
        expect(rebuilt.find(e => e.t >= 200000)).toEqual({ t: 201168, v: 0 });
    });
});
