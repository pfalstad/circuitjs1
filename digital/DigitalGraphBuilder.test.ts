import { describe, it, expect, vi } from "vitest";
import { chipStart, customChipStart } from "./chip_desc";
import type { ChipDesc } from "./chip_desc";
import { buildCircuitDesc, buildDigitalCircuit } from "./DigitalGraphBuilder";

/** A minimal fake digital element: shaped exactly like what DigitalGraphBuilder's
 * digitalSynthesis()-based duck-typing looks for, without needing a real CircuitElm. */
function fakeElm(desc: ChipDesc[], pinMap: [number, number][]) {
    return {
        digitalSynthesis: () => ({ desc, pinMap: new Map(pinMap) }),
        nodes: [] as { links: { num: number; elm: any }[] }[],
    };
}

/** Wires a shared CircuitNode-like object across several (elm, post) pairs, exactly like
 * SimulationManager.makeNodeList() would after wire closure has merged everything onto one
 * node. */
function connect(...posts: { elm: any; num: number }[]): void {
    const node = { links: posts.map(p => ({ num: p.num, elm: p.elm })) };
    for (const p of posts) p.elm.nodes[p.num] = node;
}

// A single-input, single-output buffer cell: pin 1 in, pin 2 out, output = input.
function bufDesc(): ChipDesc[] {
    return [chipStart((pin) => { pin[2] = pin[1]; }).inputPins(1).outputPin(2)];
}

// A zero-input, single-output cell that's always high: pin 1 out.
function highDesc(): ChipDesc[] {
    return [chipStart((pin) => { pin[1] = 1; }).outputPin(1)];
}

// A two-input, single-output AND cell: pins 1,2 in, pin 3 out.
function andDesc(): ChipDesc[] {
    return [chipStart((pin) => { pin[3] = pin[1] & pin[2]; }).inputPins(1, 2).outputPin(3)];
}

// A single-input, no-output custom cell - stands in for a real terminal sink (an LED, a scope
// probe) that reads a chip's output without itself driving any further chip input. CUSTOM_CHIP
// so Circuit's dead-code elimination never prunes it (see circuit.ts's makeAllConnections()),
// exactly as a real video/audio/display consumer in dice-ts survives.
function sinkDesc(): ChipDesc[] {
    return [customChipStart(() => { }).inputPins(1)];
}

describe("buildCircuitDesc - connection resolution", () => {
    it("emits one CHIP entry per digital-capable element, named uniquely", () => {
        const a = fakeElm(highDesc(), [[0, 1]]);
        const b = fakeElm(bufDesc(), [[0, 1], [1, 2]]);
        connect({ elm: a, num: 0 }, { elm: b, num: 0 });

        const desc = buildCircuitDesc([a, b]);

        expect(desc.chips).toHaveLength(2);
        expect(new Set(desc.chips.map(c => c.name)).size).toBe(2);
    });

    it("connects an input post to whatever drives it, translating post index to external pin", () => {
        const a = fakeElm(highDesc(), [[0, 1]]);
        const b = fakeElm(bufDesc(), [[0, 1], [1, 2]]);
        connect({ elm: a, num: 0 }, { elm: b, num: 0 });

        const desc = buildCircuitDesc([a, b]);

        expect(desc.connections).toHaveLength(1);
        const [conn] = desc.connections;
        const aName = desc.chips.find(c => c.desc === a.digitalSynthesis().desc)!.name;
        const bName = desc.chips.find(c => c.desc === b.digitalSynthesis().desc)!.name;
        expect(conn).toEqual({ kind: "connection", name1: aName, pin1: 1, name2: bName, pin2: 1 });
    });

    it("omits the connection entirely when a post has no driver (Circuit grounds it itself)", () => {
        const b = fakeElm(bufDesc(), [[0, 1], [1, 2]]);
        b.nodes[0] = { links: [{ num: 0, elm: b }] }; // nothing else on this node

        const desc = buildCircuitDesc([b]);

        expect(desc.connections).toHaveLength(0);
    });

    it("ignores non-digital-capable elements sharing the same node", () => {
        const a = fakeElm(highDesc(), [[0, 1]]);
        const plain = { nodes: [] as any[] }; // no digitalSynthesis()
        const b = fakeElm(bufDesc(), [[0, 1], [1, 2]]);
        connect({ elm: a, num: 0 }, { elm: plain, num: 0 }, { elm: b, num: 0 });

        const desc = buildCircuitDesc([a, plain, b]);

        expect(desc.chips).toHaveLength(2); // "plain" contributes no chip
        expect(desc.connections).toHaveLength(1); // still resolves through to `a`
    });

    it("warns and picks the first candidate when a node has multiple drivers", () => {
        const warn = vi.spyOn(console, "log").mockImplementation(() => {});
        const a1 = fakeElm(highDesc(), [[0, 1]]);
        const a2 = fakeElm(highDesc(), [[0, 1]]);
        const b = fakeElm(bufDesc(), [[0, 1], [1, 2]]);
        connect({ elm: a1, num: 0 }, { elm: a2, num: 0 }, { elm: b, num: 0 });

        const desc = buildCircuitDesc([a1, a2, b]);

        expect(desc.connections).toHaveLength(1);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it("wires a multi-input element's several posts independently, in post order", () => {
        const a = fakeElm(highDesc(), [[0, 1]]);
        const c = fakeElm(highDesc(), [[0, 1]]);
        const gate = fakeElm(andDesc(), [[0, 1], [1, 2], [2, 3]]);
        connect({ elm: a, num: 0 }, { elm: gate, num: 0 });
        connect({ elm: c, num: 0 }, { elm: gate, num: 1 });

        const desc = buildCircuitDesc([a, c, gate]);

        expect(desc.connections).toHaveLength(2);
        const gateName = desc.chips.find(ch => ch.desc === gate.digitalSynthesis().desc)!.name;
        expect(desc.connections.map(cn => [cn.name2, cn.pin2])).toEqual(
            expect.arrayContaining([[gateName, 1], [gateName, 2]]));
    });
});

describe("buildDigitalCircuit - end to end", () => {
    // Circuit's own dead-code elimination (makeAllConnections()) prunes any non-custom chip
    // whose output feeds no other chip's input - correct for a truly dead gate, but it means
    // every test graph here needs a terminal sink (standing in for a real LED/scope consumer -
    // see sinkDesc() above) or its whole chain gets pruned before it can be observed.
    it("propagates a constant source's initial value through a chain of buffers", () => {
        const src = fakeElm(highDesc(), [[0, 1]]);
        const buf1 = fakeElm(bufDesc(), [[0, 1], [1, 2]]);
        const buf2 = fakeElm(bufDesc(), [[0, 1], [1, 2]]);
        const sink = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: src, num: 0 }, { elm: buf1, num: 0 });
        connect({ elm: buf1, num: 1 }, { elm: buf2, num: 0 });
        connect({ elm: buf2, num: 1 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([src, buf1, buf2, sink]);

        expect(chipsByElm.get(buf2)![0].output).toBe(1);
        // chips[0..2] are the special _VCC/_GND/_DEOPTIMIZER chips; src/buf1/buf2/sink follow
        // in build order.
        const buf2Chip = circuit.chips.find(c => c.debugName === "e2")!;
        expect(buf2Chip.output).toBe(1);
    });

    it("computes a two-input AND cell's initial output from its constant sources", () => {
        const a = fakeElm(highDesc(), [[0, 1]]);
        const zeroDesc: ChipDesc[] = [chipStart((pin) => { pin[1] = 0; }).outputPin(1)];
        const b = fakeElm(zeroDesc, [[0, 1]]);
        const gate = fakeElm(andDesc(), [[0, 1], [1, 2], [2, 3]]);
        const sink = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: a, num: 0 }, { elm: gate, num: 0 });
        connect({ elm: b, num: 0 }, { elm: gate, num: 1 });
        connect({ elm: gate, num: 2 }, { elm: sink, num: 0 });

        const { chipsByElm } = buildDigitalCircuit([a, b, gate, sink]);

        expect(chipsByElm.get(gate)![0].output).toBe(0);
    });
});

describe("digitalTie - constant-source elements bind to Circuit's shared _VCC/_GND", () => {
    function tieElm(tie: "VCC" | "GND") {
        return { digitalTie: () => tie, nodes: [] as { links: { num: number; elm: any }[] }[] };
    }

    it("does not emit its own CHIP entry, and resolves consumers straight to the sentinel", () => {
        const vcc = tieElm("VCC");
        const sink = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: vcc, num: 0 }, { elm: sink, num: 0 });

        const desc = buildCircuitDesc([vcc, sink]);

        expect(desc.chips).toHaveLength(1); // just "e0" (sink) - no chip for the tie itself
        expect(desc.connections).toEqual([{ kind: "connection", name1: "_VCC", pin1: 1, name2: "e0", pin2: 1 }]);
    });

    it("drives a real consumer through Circuit's actual VCC/GND chips, and chipsByElm resolves to them", () => {
        const gnd = tieElm("GND");
        const sink = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: gnd, num: 0 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([gnd, sink]);

        expect(chipsByElm.get(gnd)).toEqual([circuit.chips[1]]); // circuit.chips[1] is the shared _GND chip
        expect(chipsByElm.get(sink)![0].inputLinks[0].chip).toBe(circuit.chips[1]);
    });
});
