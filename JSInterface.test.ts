import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSInterface } from "./JSInterface";
import { buildDigitalCircuit, setCurrentDigitalGraph } from "./digital/DigitalGraphBuilder";
import { chipStart, customChipStart } from "./digital/chip_desc";
import type { ChipDesc } from "./digital/chip_desc";
import { connect } from "./digital/testWiring";

// Same fakeElm()/connect() convention as ScopePlot.test.ts - a single-output digital-capable
// element shaped exactly like what digitalSynthesis()-based resolution looks for, plus getName()
// so JSInterface.findElmByName() can find it by the same name watchSignal() is given.
function outputDesc(): ChipDesc[] {
    return [chipStart(() => { }).outputPin(1)];
}
function sinkDesc(): ChipDesc[] {
    return [customChipStart(() => { }).inputPins(1)];
}
function fakeElm(name: string) {
    return {
        digitalSynthesis: () => ({ desc: outputDesc(), pinMap: new Map([[0, 1]]) }),
        nodes: [] as { links: { num: number; elm: any }[] }[],
        highVoltage: 5,
        getName: () => name,
    };
}

function fakeApp(elmList: any[], digitalTickEpoch: number = 0) {
    return {
        elmList,
        getElm: (i: number) => elmList[i],
        sim: { maxTimeStep: 1e-5, digitalTickEpoch },
    };
}

beforeEach(() => { (globalThis as any).window = {}; });
afterEach(() => { setCurrentDigitalGraph(null); delete (globalThis as any).window; });

describe("JSInterface signal watching", () => {
    it("reports the chip's current value as of attachment on the first poll, then only new transitions, and stops after unwatchSignal", () => {
        const elm = fakeElm("sig");
        const sink = { digitalSynthesis: () => ({ desc: sinkDesc(), pinMap: new Map([[0, 1]]) }), nodes: [] as any[] };
        connect({ elm, num: 0 }, { elm: sink, num: 0 });
        const graph = buildDigitalCircuit([elm, sink]);
        setCurrentDigitalGraph(graph);
        const chip = graph.chipsByElm.get(elm)![0];

        const js = new JSInterface(fakeApp([elm]));
        js.setupJSInterface();
        const api = (window as any).CircuitJS1;
        const updates: any[] = [];
        api.onsignalupdate = (_api: any, signals: any) => updates.push(signals);

        api.watchSignal("sig");

        // Cold start: chip.output is still its untouched default (0) since nothing has run the
        // simulation yet - the watch should report that starting level even though `history` is
        // empty (no transition has ever been recorded).
        js.callUpdateHook();
        expect(updates.length).toBe(1);
        expect(updates[0].sig.changes).toEqual([{ tick: 0, value: 0 }]);

        // Nothing changed since the last poll - no hook call at all.
        js.callUpdateHook();
        expect(updates.length).toBe(1);

        // Simulate a real transition landing in the chip's own history (as live simulation
        // would append it via the `output` setter once historyWatched is true).
        chip.historyWatched = true;
        (chip.circuit as any).globalTime = 50;
        chip.history.push({ time: 50, value: 1 });
        // A transition exactly AT the new `now` is deferred to a later poll (half-open range,
        // same as ScopePlot2d.fillDigitalRaster()) rather than reported early - so this poll
        // sees `now` advance but has nothing yet to report.
        js.callUpdateHook();
        expect(updates.length).toBe(1);

        // Once `now` has moved past tick 50, the deferred transition is picked up.
        (chip.circuit as any).globalTime = 100;
        chip.history.push({ time: 100, value: 0 });
        js.callUpdateHook();
        expect(updates.length).toBe(2);
        expect(updates[1].sig.changes).toEqual([{ tick: 50, value: 1 }]);
        expect(updates[1].sig.now).toBe(100);

        api.unwatchSignal("sig");
        (chip.circuit as any).globalTime = 150;
        chip.history.push({ time: 150, value: 1 });
        js.callUpdateHook();
        expect(updates.length).toBe(2); // unwatched - no further reports
    });

    // A circuit edit rebuilds the digital graph, restarting Circuit.globalTime at 0 while sim
    // time keeps running - SimulationManager.digitalTickEpoch (see its own comment) is what keeps
    // the ticks JS sees on one continuous timebase across that, so a JS-side consumer anchored on
    // absolute tick time (e.g. a JS-drawn raster scope's frame phase) doesn't jump backwards.
    it("reports ticks on an absolute timebase, offset by the graph's tick epoch", () => {
        const elm = fakeElm("sig");
        const sink = { digitalSynthesis: () => ({ desc: sinkDesc(), pinMap: new Map([[0, 1]]) }), nodes: [] as any[] };
        connect({ elm, num: 0 }, { elm: sink, num: 0 });
        const graph = buildDigitalCircuit([elm, sink]);
        setCurrentDigitalGraph(graph);
        const chip = graph.chipsByElm.get(elm)![0];

        // 10000 ticks had already elapsed when this graph was built (i.e. the circuit was edited
        // 10000 ticks into the run), so its globalTime 0 is absolute tick 10000.
        const js = new JSInterface(fakeApp([elm], 10000));
        js.setupJSInterface();
        const api = (window as any).CircuitJS1;
        const updates: any[] = [];
        api.onsignalupdate = (_api: any, signals: any) => updates.push(signals);

        api.watchSignal("sig");
        js.callUpdateHook();
        expect(updates[0].sig.changes).toEqual([{ tick: 10000, value: 0 }]);

        chip.historyWatched = true;
        (chip.circuit as any).globalTime = 100;
        chip.history.push({ time: 50, value: 1 });
        js.callUpdateHook();
        expect(updates[1].sig.changes).toEqual([{ tick: 10050, value: 1 }]);
        expect(updates[1].sig.now).toBe(10100);
    });

    it("does nothing (no hook call, no crash) for a watched name that never resolves to a chip", () => {
        const js = new JSInterface(fakeApp([]));
        js.setupJSInterface();
        const api = (window as any).CircuitJS1;
        const updates: any[] = [];
        api.onsignalupdate = (_api: any, signals: any) => updates.push(signals);

        api.watchSignal("nonexistent");
        js.callUpdateHook();
        expect(updates.length).toBe(0);
    });
});
