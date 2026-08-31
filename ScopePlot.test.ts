import { describe, it, expect, vi, afterEach } from "vitest";
import { ScopePlot } from "./ScopePlot";
import { UNITS_V, VAL_VOLTAGE } from "./ScopeConstants";
import { ChipState } from "./digital/chip";
import { chipStart, customChipStart } from "./digital/chip_desc";
import type { ChipDesc } from "./digital/chip_desc";
import { buildDigitalCircuit, setCurrentDigitalGraph } from "./digital/DigitalGraphBuilder";

// A minimal fake Chip - just the surface fillFromDigitalHistory()/canAcCouple() actually read
// (circuit.globalTime, state, history, output, backfillHistory()) - for tests that only need to
// exercise the history-fill math, not real resolution (digitalScopeSourceNew()/DigitalGraph -
// see the "recognizes .../re-resolves ..." tests below, which exercise that separately against a
// real built DigitalGraph).
function fakeChip(history: { time: bigint; value: number }[], nowTicks: number, state = ChipState.PASSIVE) {
    return {
        circuit: { globalTime: BigInt(nowTicks) },
        state,
        history,
        output: history.length ? history[history.length - 1].value : 0,
        backfillHistory: vi.fn(),
    } as any;
}

// A single-output digital-capable element, shaped exactly like what digitalSynthesis()-based
// resolution (digitalOutputPosts/digitalOutputChip - see DigitalGraphBuilder.ts) looks for -
// same fakeElm() convention as DigitalGraphBuilderSync.test.ts.
function highDesc(): ChipDesc[] {
    return [chipStart((pin) => { pin[1] = 1; }).outputPin(1)];
}
function sinkDesc(): ChipDesc[] {
    return [customChipStart(() => { }).inputPins(1)];
}
function fakeElm(highVoltage = 5) {
    return {
        digitalSynthesis: () => ({ desc: highDesc(), pinMap: new Map([[0, 1]]) }),
        nodes: [] as { links: { num: number; elm: any }[] }[],
        highVoltage,
    };
}
function connect(...posts: { elm: any; num: number }[]): void {
    const node = { links: posts.map(p => ({ num: p.num, elm: p.elm })) };
    for (const p of posts) p.elm.nodes[p.num] = node;
}

afterEach(() => setCurrentDigitalGraph(null));

describe("ScopePlot digital history fill", () => {
    it("recognizes a digital-capable element as a digital scope source", () => {
        const elm = fakeElm();
        const sink = { digitalSynthesis: () => ({ desc: sinkDesc(), pinMap: new Map([[0, 1]]) }), nodes: [] as any[] };
        connect({ elm, num: 0 }, { elm: sink, num: 0 });
        const graph = buildDigitalCircuit([elm, sink]);
        setCurrentDigitalGraph(graph);

        const plot = new ScopePlot(elm as any, UNITS_V, VAL_VOLTAGE, 1);
        expect(plot.digitalChip).toBe(graph.chipsByElm.get(elm)![0]);
        expect(plot.canAcCouple()).toBe(false);
    });

    it("leaves a non-voltage plot (e.g. current) with no digitalChip", () => {
        const elm = fakeElm();
        const plot = new ScopePlot(elm as any, 1 /* UNITS_A */, 3 /* VAL_CURRENT */, 1);
        expect(plot.digitalChip).toBeNull();
    });

    it("fills columns from the change-list, marking any column a transition crossed", () => {
        const elm = fakeElm();
        const plot = new ScopePlot(elm as any, UNITS_V, VAL_VOLTAGE, 1);
        plot.digitalChip = fakeChip([{ time: 0n, value: 1 }, { time: 25n, value: 0 }, { time: 50n, value: 1 }], 100);
        plot.scopePointCount = 8; // power of 2, per the ptr-masking convention
        plot.scopePlotSpeed = 10; // ticks per column
        plot.minValues = new Array(8).fill(0);
        plot.maxValues = new Array(8).fill(0);

        plot.fillFromDigitalHistory();

        // window = [20, 100), 10 ticks/column:
        // col0 [20,30): true->false@25   -> 0..5
        // col1 [30,40): steady false     -> 0..0
        // col2 [40,50): steady false     -> 0..0
        // col3 [50,60): false->true@50   -> 0..5
        // col4-7 [60,100): steady true   -> 5..5
        expect(plot.minValues).toEqual([0, 0, 0, 0, 5, 5, 5, 5]);
        expect(plot.maxValues).toEqual([5, 0, 0, 5, 5, 5, 5, 5]);
        expect(plot.ptr).toBe(7);
    });

    it("backfills an Asleep chip's history before reading it", () => {
        const elm = fakeElm();
        const plot = new ScopePlot(elm as any, UNITS_V, VAL_VOLTAGE, 1);
        const chip = fakeChip([{ time: 0n, value: 0 }], 100, ChipState.ASLEEP);
        plot.digitalChip = chip;
        plot.scopePointCount = 4;
        plot.scopePlotSpeed = 10;
        plot.minValues = new Array(4).fill(0);
        plot.maxValues = new Array(4).fill(0);

        plot.fillFromDigitalHistory();

        expect(chip.backfillHistory).toHaveBeenCalledWith(100n);
    });

    it("does not rebuild twice for the same tick", () => {
        const elm = fakeElm();
        const plot = new ScopePlot(elm as any, UNITS_V, VAL_VOLTAGE, 1);
        plot.digitalChip = fakeChip([{ time: 0n, value: 1 }], 50);
        plot.scopePointCount = 4;
        plot.scopePlotSpeed = 10;
        plot.minValues = new Array(4).fill(0);
        plot.maxValues = new Array(4).fill(0);

        plot.fillFromDigitalHistory();
        plot.minValues[0] = 999; // sentinel - a second rebuild would overwrite this
        plot.fillFromDigitalHistory();
        expect(plot.minValues[0]).toBe(999);
    });

    it("re-resolves digitalChip once wiring/the DigitalGraph becomes available (save/reload regression)", () => {
        // Reproduces the ScopeSerializer.undumpXml() ordering bug: a
        // LabeledNodeElm-like wire-equivalent element whose node/links
        // aren't populated yet at ScopePlot construction time (the node
        // graph - and the DigitalGraph itself - are built later, once the
        // whole saved circuit has been read) must not be permanently stuck
        // with digitalChip === null.
        const label: any = { isWireEquivalent: () => true, nodes: [] };
        const plot = new ScopePlot(label, UNITS_V, VAL_VOLTAGE, 1);
        expect(plot.digitalChip).toBeNull(); // nothing to resolve against yet

        // Wiring completes (SimulationManager.makeNodeList()) and the digital graph gets built
        // (SimulationManager.initDigitalCircuit()).
        const driver = fakeElm();
        const sink = { digitalSynthesis: () => ({ desc: sinkDesc(), pinMap: new Map([[0, 1]]) }), nodes: [] as any[] };
        connect({ elm: driver, num: 0 }, { elm: sink, num: 0 });
        const graph = buildDigitalCircuit([driver, sink]);
        setCurrentDigitalGraph(graph);
        // driver's output post is index 0 (its only post - see fakeElm()'s pinMap), matching
        // GateElm's real single-output convention.
        label.nodes = [{ links: [{ num: 0, elm: driver }, { num: 0, elm: label }] }];

        plot.refreshDigitalSource();
        expect(plot.digitalChip).toBe(graph.chipsByElm.get(driver)![0]);
    });
});
