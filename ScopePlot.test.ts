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
// real built DigitalGraph). backfillReturn defaults to nowTicks (a call that fully catches up,
// same as the real Chip.backfillHistory() does whenever its own per-call work budget isn't
// exceeded) - pass a smaller value to simulate a call that only made partial progress.
function fakeChip(history: { time: number; value: number }[], nowTicks: number, state = ChipState.PASSIVE, backfillReturn?: number) {
    return {
        circuit: { globalTime: nowTicks },
        state,
        history,
        output: history.length ? history[history.length - 1].value : 0,
        backfillHistory: vi.fn(() => backfillReturn ?? nowTicks),
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

// Builds a fresh plot cold-started directly at `nowTicks` over the full `history` - the
// ground truth an incremental (steady-state) call is supposed to match exactly, since it's
// only ever supposed to fold in what changed, never produce a different answer than rebuilding
// from scratch would. spc/sp match the "fills columns..." test above (8 columns, 10 ticks each).
function coldRebuild(elm: any, history: { time: number; value: number }[], nowTicks: number) {
    const plot = new ScopePlot(elm, UNITS_V, VAL_VOLTAGE, 1);
    plot.digitalChip = fakeChip(history, nowTicks);
    plot.scopePointCount = 8;
    plot.scopePlotSpeed = 10;
    plot.minValues = new Array(8).fill(0);
    plot.maxValues = new Array(8).fill(0);
    plot.fillFromDigitalHistory();
    return plot;
}

// Reads minValues/maxValues out in oldest-to-newest order via the same (ptr - i) & mask
// convention startIndex()/Scope.ts's readers use - the only way to compare two plots whose
// `ptr` may have wrapped a different number of times (a circular buffer's raw array order is
// an implementation detail, not something callers - or this test - should compare directly).
function orderedValues(plot: ScopePlot): { min: number[]; max: number[] } {
    const spc = plot.scopePointCount;
    const min: number[] = [], max: number[] = [];
    for (let i = spc - 1; i >= 0; i--) {
        const idx = (plot.ptr - i) & (spc - 1);
        min.push(plot.minValues[idx]);
        max.push(plot.maxValues[idx]);
    }
    return { min, max };
}

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
        plot.digitalChip = fakeChip([{ time: 0, value: 1 }, { time: 25, value: 0 }, { time: 50, value: 1 }], 100);
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
        const chip = fakeChip([{ time: 0, value: 0 }], 100, ChipState.ASLEEP);
        plot.digitalChip = chip;
        plot.scopePointCount = 4;
        plot.scopePlotSpeed = 10;
        plot.minValues = new Array(4).fill(0);
        plot.maxValues = new Array(4).fill(0);

        plot.fillFromDigitalHistory();

        expect(chip.backfillHistory).toHaveBeenCalledWith(100);
    });

    it("clamps to what backfillHistory() actually reached rather than assuming it caught up to `now` (regression: a chip with a large backlog - e.g. the sim running fast enough that globalTime jumps far ahead each draw - must not have the un-backfilled gap treated as already-painted, which would freeze the trailing edge on a stale value and, for ScopePlot2d's raster, permanently skip the real transitions still to be backfilled)", () => {
        const elm = fakeElm();
        const plot = new ScopePlot(elm as any, UNITS_V, VAL_VOLTAGE, 1);
        // backfillHistory(100) only actually reaches t=30 this call (its own per-call work
        // budget ran out - see Chip.backfillHistory()'s docstring) - `history` has nothing past 25.
        const chip = fakeChip([{ time: 0, value: 1 }, { time: 25, value: 0 }], 100, ChipState.ASLEEP, 30);
        plot.digitalChip = chip;
        plot.scopePointCount = 4;
        plot.scopePlotSpeed = 10;
        plot.minValues = new Array(4).fill(0);
        plot.maxValues = new Array(4).fill(0);

        plot.fillFromDigitalHistory();

        // Must record the clamped 30, not the requested 100 - otherwise a later call, once
        // backfillHistory() has made more real progress, would be short-circuited by the
        // "already caught up" check (this.lastDigitalFillTick === now) and never rebuild.
        expect((plot as any).lastDigitalFillTick).toBe(30);
    });

    it("does not rebuild twice for the same tick", () => {
        const elm = fakeElm();
        const plot = new ScopePlot(elm as any, UNITS_V, VAL_VOLTAGE, 1);
        plot.digitalChip = fakeChip([{ time: 0, value: 1 }], 50);
        plot.scopePointCount = 4;
        plot.scopePlotSpeed = 10;
        plot.minValues = new Array(4).fill(0);
        plot.maxValues = new Array(4).fill(0);

        plot.fillFromDigitalHistory();
        plot.minValues[0] = 999; // sentinel - a second rebuild would overwrite this
        plot.fillFromDigitalHistory();
        expect(plot.minValues[0]).toBe(999);
    });

    describe("steady-state (incremental) calls", () => {
        // Same shape as the "fills columns..." test above, but exercised across TWO calls (a
        // cold start, then one incremental step covering several more columns and transitions,
        // including one landing exactly on a column boundary at t=110 and one landing exactly at
        // the new `now` boundary at t=150) rather than one - the incremental path must land on
        // exactly the same answer coldRebuild() (a from-scratch rebuild at the same final `now`)
        // produces, since it's only ever supposed to fold in what's new, never compute a
        // different trace. This is also a regression test for a real bug caught while writing
        // it: closing a column and advancing `ptr` to a fresh, still-empty one whenever a column
        // boundary happened to coincide exactly with `now` - one real (fully populated) column
        // short of what a from-scratch rebuild at that same `now` has.
        it("folding in several new columns/transitions matches a from-scratch rebuild at the same `now`", () => {
            const elm = fakeElm();
            const history = [{ time: 0, value: 1 }, { time: 25, value: 0 }, { time: 50, value: 1 }];
            const plot = new ScopePlot(elm as any, UNITS_V, VAL_VOLTAGE, 1);
            plot.digitalChip = fakeChip(history, 100);
            plot.scopePointCount = 8;
            plot.scopePlotSpeed = 10;
            plot.minValues = new Array(8).fill(0);
            plot.maxValues = new Array(8).fill(0);
            plot.fillFromDigitalHistory(); // cold start through t=100

            history.push({ time: 105, value: 0 }, { time: 110, value: 1 }, { time: 135, value: 0 });
            (plot.digitalChip as any).circuit.globalTime = 150;
            plot.fillFromDigitalHistory(); // incremental: folds in only what's new since t=100

            const rebuilt = coldRebuild(elm, history, 150);
            expect(orderedValues(plot)).toEqual(orderedValues(rebuilt));
            expect(plot.lastValue).toBe(rebuilt.lastValue);
        });

        it("several calls in a row, each advancing by less than one column, still matches a from-scratch rebuild", () => {
            const elm = fakeElm();
            const history = [{ time: 0, value: 1 }, { time: 25, value: 0 }, { time: 50, value: 1 }];
            const plot = new ScopePlot(elm as any, UNITS_V, VAL_VOLTAGE, 1);
            plot.digitalChip = fakeChip(history, 100);
            plot.scopePointCount = 8;
            plot.scopePlotSpeed = 10;
            plot.minValues = new Array(8).fill(0);
            plot.maxValues = new Array(8).fill(0);
            plot.fillFromDigitalHistory(); // cold start through t=100

            // Small, irregular steps (like ScopePlot really gets driven - see
            // chip.backfillHistory.test.ts's identical irregular-step regression) - several
            // land mid-column, several exactly on a column boundary (multiples of 10 past 100).
            const steps = [3, 2, 5, 5, 5, 10, 15, 5];
            let t = 100;
            for (const step of steps) {
                t += step;
                (plot.digitalChip as any).circuit.globalTime = t;
                plot.fillFromDigitalHistory();
            }
            expect(t).toBe(150);

            const rebuilt = coldRebuild(elm, history, 150);
            expect(orderedValues(plot)).toEqual(orderedValues(rebuilt));
            expect(plot.lastValue).toBe(rebuilt.lastValue);
        });

        it("a call that advances `now` without crossing any column boundary just extends the current column", () => {
            const elm = fakeElm();
            const history = [{ time: 0, value: 1 }, { time: 25, value: 0 }, { time: 50, value: 1 }];
            const plot = new ScopePlot(elm as any, UNITS_V, VAL_VOLTAGE, 1);
            plot.digitalChip = fakeChip(history, 100);
            plot.scopePointCount = 8;
            plot.scopePlotSpeed = 10;
            plot.minValues = new Array(8).fill(0);
            plot.maxValues = new Array(8).fill(0);
            plot.fillFromDigitalHistory();

            history.push({ time: 103, value: 0 });
            (plot.digitalChip as any).circuit.globalTime = 105; // still within the same 10-tick column
            plot.fillFromDigitalHistory();

            const rebuilt = coldRebuild(elm, history, 105);
            expect(orderedValues(plot)).toEqual(orderedValues(rebuilt));
        });
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
