// AnalogSwitchElm/AnalogSwitch2Elm on the digital engine: pass switches, resolved by
// DigitalGraphBuilder's resolvePassGroups() so whatever drives either side shows on both.
import { describe, it, expect, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import type { Chip } from "./chip";
import { AnalogSwitchElm } from "../AnalogSwitchElm";
import { AnalogSwitch2Elm } from "../AnalogSwitch2Elm";
import { CircuitElm } from "../CircuitElm";
import { TriStateElm } from "../TriStateElm";
import { connect } from "./testWiring";

beforeEach(() => {
    CircuitElm.sim = { t: 0, maxTimeStep: 1e-6 } as any;
});

function probe() {
    return {
        digitalSynthesis: () => ({ desc: [customChipStart(() => { }).inputPins(1)], pinMap: new Map([[0, 1]]) }),
        nodes: [] as any[],
    };
}

function source(initial: 0 | 1) {
    const src = {
        nodes: [] as any[],
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

function spst(normallyClosed = false): any {
    const sw = new AnalogSwitchElm(0, 0) as any;
    if (normallyClosed) sw.flags |= sw.FLAG_INVERT;
    sw.nodes = [];
    return sw;
}

function spdt(): any {
    const sw = new AnalogSwitch2Elm(0, 0) as any;
    sw.nodes = [];
    return sw;
}

function run(elms: any[], sources: ReturnType<typeof source>[]) {
    const graph = buildDigitalCircuit(elms);
    for (const s of sources) s.chip = graph.chipsByElm.get(s)![0];
    graph.circuit.run(1000);
    return graph;
}

const read = (graph: any, sink: any) => graph.chipsByElm.get(sink)![0].inputLinks[0].chip.output;

describe("AnalogSwitchElm (SPST) on the digital engine", () => {
    for (const reversed of [false, true]) {
        it(`passes the driven side's value while closed${reversed ? " (driven from post 1)" : ""}`, () => {
            const data = source(1), ctl = source(1), sw = spst(), sink = probe();
            const [inPost, outPost] = reversed ? [1, 0] : [0, 1];
            connect({ elm: data, num: 0 }, { elm: sw, num: inPost });
            connect({ elm: ctl, num: 0 }, { elm: sw, num: 2 });
            connect({ elm: sw, num: outPost }, { elm: sink, num: 0 });
            const graph = run([sink, sw, data, ctl], [data, ctl]);
            expect(read(graph, sink)).toBe(1);

            data.set(0); graph.circuit.run(1000);
            expect(read(graph, sink)).toBe(0);

            data.set(1); ctl.set(0); graph.circuit.run(1000);
            expect(read(graph, sink)).toBe(0); // open reads 0
        });
    }

    it("resolves a chain of switches from its driven end", () => {
        const data = source(1), ctl = source(1), a = spst(), b = spst(), sink = probe();
        // data -> b.post1, b.post0 -> a.post1, a.post0 -> sink: both reversed
        connect({ elm: data, num: 0 }, { elm: b, num: 1 });
        connect({ elm: b, num: 0 }, { elm: a, num: 1 });
        connect({ elm: a, num: 0 }, { elm: sink, num: 0 });
        connect({ elm: ctl, num: 0 }, { elm: a, num: 2 }, { elm: b, num: 2 });
        const graph = run([sink, a, b, data, ctl], [data, ctl]);
        expect(read(graph, sink)).toBe(1);
    });

    it("honors Normally closed", () => {
        const data = source(1), ctl = source(0), sw = spst(true), sink = probe();
        connect({ elm: data, num: 0 }, { elm: sw, num: 0 });
        connect({ elm: ctl, num: 0 }, { elm: sw, num: 2 });
        connect({ elm: sw, num: 1 }, { elm: sink, num: 0 });
        const graph = run([data, ctl, sw, sink], [data, ctl]);
        expect(read(graph, sink)).toBe(1);
        ctl.set(1); graph.circuit.run(1000);
        expect(read(graph, sink)).toBe(0);
    });
});

describe("AnalogSwitch2Elm (SPDT) on the digital engine", () => {
    it("routes the common to the selected throw (demux)", () => {
        const data = source(1), ctl = source(1), sw = spdt(), s1 = probe(), s2 = probe();
        connect({ elm: data, num: 0 }, { elm: sw, num: 0 });
        connect({ elm: ctl, num: 0 }, { elm: sw, num: 3 });
        connect({ elm: sw, num: 1 }, { elm: s1, num: 0 });
        connect({ elm: sw, num: 2 }, { elm: s2, num: 0 });
        const graph = run([data, ctl, sw, s1, s2], [data, ctl]);
        expect([read(graph, s1), read(graph, s2)]).toEqual([1, 0]); // control high: post 1
        ctl.set(0); graph.circuit.run(1000);
        expect([read(graph, s1), read(graph, s2)]).toEqual([0, 1]);
    });

    it("selects a throw onto the common (mux)", () => {
        const d1 = source(1), d2 = source(0), ctl = source(1), sw = spdt(), sink = probe();
        connect({ elm: d1, num: 0 }, { elm: sw, num: 1 });
        connect({ elm: d2, num: 0 }, { elm: sw, num: 2 });
        connect({ elm: ctl, num: 0 }, { elm: sw, num: 3 });
        connect({ elm: sw, num: 0 }, { elm: sink, num: 0 });
        const graph = run([sw, sink, d1, d2, ctl], [d1, d2, ctl]);
        expect(read(graph, sink)).toBe(1);
        ctl.set(0); graph.circuit.run(1000);
        expect(read(graph, sink)).toBe(0);
        d2.set(1); graph.circuit.run(1000);
        expect(read(graph, sink)).toBe(1);
    });
});

function triState(): any {
    const ts = Object.create(TriStateElm.prototype) as any;
    ts.busWidth = 1;
    ts.highVoltage = 5;
    ts.nodes = [];
    return ts;
}

describe("pass switches carry signals both ways", () => {
    // A side: tri-state A drives it, sinkA reads it. B side likewise. Switch between.
    function bus(withCap = false) {
        const dA = source(0), eA = source(0), tA = triState(), sinkA = probe();
        const dB = source(0), eB = source(0), tB = triState(), sinkB = probe();
        const ctl = source(1), sw = spst();
        connect({ elm: dA, num: 0 }, { elm: tA, num: 0 });
        connect({ elm: eA, num: 0 }, { elm: tA, num: 2 });
        connect({ elm: dB, num: 0 }, { elm: tB, num: 0 });
        connect({ elm: eB, num: 0 }, { elm: tB, num: 2 });
        connect({ elm: ctl, num: 0 }, { elm: sw, num: 2 });
        const a = [{ elm: tA, num: 1 }, { elm: sinkA, num: 0 }, { elm: sw, num: 0 }];
        if (withCap) a.push({ elm: { nodes: [], digitalHoldsCharge: () => true }, num: 0 });
        connect(...a);
        connect({ elm: tB, num: 1 }, { elm: sinkB, num: 0 }, { elm: sw, num: 1 });
        const srcs = [dA, eA, dB, eB, ctl];
        const graph = run([sinkA, sinkB, sw, tA, tB, ...srcs], srcs);
        const both = () => [read(graph, sinkA), read(graph, sinkB)];
        const step = () => graph.circuit.run(1000);
        return { dA, eA, dB, eB, ctl, both, step };
    }

    it("either side's driver shows on both while closed, and only its own side while open", () => {
        const { dA, eA, dB, eB, ctl, both, step } = bus();
        eA.set(1); dA.set(1); step();
        expect(both()).toEqual([1, 1]);          // A drives B
        dA.set(0); step();
        expect(both()).toEqual([0, 0]);

        eA.set(0); eB.set(1); dB.set(1); step();
        expect(both()).toEqual([1, 1]);          // B drives A
        dB.set(0); step();
        expect(both()).toEqual([0, 0]);
        dB.set(1); step();

        ctl.set(0); step();
        expect(both()).toEqual([0, 1]);          // open: A undriven
    });

    it("holds a stored bit and reads it out through a closed switch", () => {
        const { dA, eA, ctl, both, step } = bus(true);
        ctl.set(0); eA.set(1); dA.set(1); step();
        eA.set(0); step();
        expect(both()).toEqual([1, 0]);          // A holds its charge, switch open
        ctl.set(1); step();
        expect(both()).toEqual([1, 1]);          // closed: stored bit shows on B
        ctl.set(0); step();
        expect(both()).toEqual([1, 0]);
    });
});
