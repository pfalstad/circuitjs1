// Phase 5 (see noble-stirring-rabin.md): tests the sync/scope-source helpers added to
// DigitalGraphBuilder.ts (digitalOutputPosts/digitalOutputChip/digitalOutputChipAt/
// findDigitalDriver/syncDigitalToNodesNew/digitalStateTextNew/digitalScopeSourceNew), which
// replace digital/CircuitWiring.ts's isGateLike/isChipLike/isRailSourceLike-based equivalents
// against the new dice-ts engine. Same fakeElm/connect() shape as DigitalGraphBuilder.test.ts.
import { describe, it, expect, beforeEach } from "vitest";
import { chipStart, customChipStart } from "./chip_desc";
import type { ChipDesc } from "./chip_desc";
import {
    buildDigitalCircuit, digitalOutputPosts, digitalOutputChip, digitalOutputChipAt,
    digitalStateTextNew, syncDigitalToNodesNew, digitalScopeSourceNew,
    setCurrentDigitalGraph, getCurrentDigitalGraph,
} from "./DigitalGraphBuilder";

function fakeElm(desc: ChipDesc[], pinMap: [number, number][], extra: Record<string, unknown> = {}) {
    return {
        digitalSynthesis: () => ({ desc, pinMap: new Map(pinMap) }),
        nodes: [] as { links: { num: number; elm: any }[] }[],
        ...extra,
    };
}

function tieElm(tie: "VCC" | "GND") {
    return { digitalTie: () => tie, nodes: [] as { links: { num: number; elm: any }[] }[] };
}

function connect(...posts: { elm: any; num: number }[]): void {
    const node = { links: posts.map(p => ({ num: p.num, elm: p.elm })) };
    for (const p of posts) p.elm.nodes[p.num] = node;
}

// Buffer: pin 1 in, pin 2 out (out = in) - matches DigitalGraphBuilder.test.ts's bufDesc().
function bufDesc(): ChipDesc[] {
    return [chipStart((pin) => { pin[2] = pin[1]; }).inputPins(1).outputPin(2)];
}
// Always-high, zero-input source: pin 1 out.
function highDesc(): ChipDesc[] {
    return [chipStart((pin) => { pin[1] = 1; }).outputPin(1)];
}
// Two-output "chip": pin1 in, pin2/pin3 both outputs (out2=in, out3=!in) - stands in for a
// multi-output element like CounterElm/DFlipFlopElm.
function twoOutDesc(): ChipDesc[] {
    return [
        chipStart((pin) => { pin[2] = pin[1]; }).inputPins(1).outputPin(2),
        chipStart((pin) => { pin[3] = pin[1] ^ 1; }).inputPins(1).outputPin(3),
    ];
}
function sinkDesc(): ChipDesc[] {
    return [customChipStart(() => { }).inputPins(1)];
}

describe("digitalOutputPosts / digitalOutputChip / digitalOutputChipAt", () => {
    it("resolves a single-output element's one output post to its Chip", () => {
        const src = fakeElm(highDesc(), [[0, 1]]);
        const sink = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: src, num: 0 }, { elm: sink, num: 0 });
        const { chipsByElm } = buildDigitalCircuit([src, sink]);

        expect(digitalOutputPosts(src)).toEqual([0]);
        expect(digitalOutputPosts(sink)).toEqual([]); // sink's post 0 is an input, not an output
        const chip = digitalOutputChip(src, 0, chipsByElm);
        expect(chip).not.toBeNull();
        expect(chip!.output).toBe(1);
    });

    it("resolves each output post of a multi-output element independently and in post order", () => {
        const inSrc = fakeElm(highDesc(), [[0, 1]]);
        const chip2 = fakeElm(twoOutDesc(), [[0, 1], [1, 2], [2, 3]]);
        const sinkA = fakeElm(sinkDesc(), [[0, 1]]);
        const sinkB = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: inSrc, num: 0 }, { elm: chip2, num: 0 });
        connect({ elm: chip2, num: 1 }, { elm: sinkA, num: 0 });
        connect({ elm: chip2, num: 2 }, { elm: sinkB, num: 0 });
        const { chipsByElm } = buildDigitalCircuit([inSrc, chip2, sinkA, sinkB]);

        expect(digitalOutputPosts(chip2)).toEqual([1, 2]);
        expect(digitalOutputChipAt(chip2, 0, chipsByElm)!.output).toBe(1); // post 1: out = in = 1
        expect(digitalOutputChipAt(chip2, 1, chipsByElm)!.output).toBe(0); // post 2: out = !in = 0
        expect(digitalOutputChipAt(chip2, 2, chipsByElm)).toBeNull(); // no third output post
    });

    it("resolves a tie source's single output post (post 0) to the shared _VCC/_GND chip", () => {
        const vcc = tieElm("VCC");
        const sink = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: vcc, num: 0 }, { elm: sink, num: 0 });
        const { circuit, chipsByElm } = buildDigitalCircuit([vcc, sink]);

        expect(digitalOutputPosts(vcc)).toEqual([0]);
        const chip = digitalOutputChip(vcc, 0, chipsByElm);
        expect(chip).toBe(circuit.chips[0]);
        expect(chip!.output).toBe(1);
    });

    it("returns null/[] for a non-digital-capable element", () => {
        const plain = { nodes: [] as any[] };
        expect(digitalOutputPosts(plain)).toEqual([]);
        expect(digitalOutputChip(plain, 0, new Map())).toBeNull();
    });
});

describe("digitalStateTextNew", () => {
    it("labels a zero-input chip 'Constant' rather than 'Passive'", () => {
        const src = fakeElm(highDesc(), [[0, 1]]);
        const sink = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: src, num: 0 }, { elm: sink, num: 0 });
        const { chipsByElm } = buildDigitalCircuit([src, sink]);
        expect(digitalStateTextNew(digitalOutputChip(src, 0, chipsByElm))).toBe("Constant");
    });

    it("labels null 'not wired'", () => {
        expect(digitalStateTextNew(null)).toBe("not wired");
    });
});

describe("syncDigitalToNodesNew", () => {
    it("writes highVoltage/0 back to nodes[post].v for a highVoltage-style element", () => {
        const src = fakeElm(highDesc(), [[0, 1]], { highVoltage: 5 });
        const sink = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: src, num: 0 }, { elm: sink, num: 0 });
        src.nodes[0] = { v: 0, links: src.nodes[0].links } as any;
        const { chipsByElm } = buildDigitalCircuit([src, sink]);

        syncDigitalToNodesNew([src, sink], chipsByElm);
        expect((src.nodes[0] as any).v).toBe(5);
    });

    it("writes via getDigitalVoltage() instead when the element exposes one (a rail/logic-input-style source)", () => {
        const src = fakeElm(highDesc(), [[0, 1]], { getDigitalVoltage: (v: boolean) => v ? 3.3 : -1 });
        const sink = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: src, num: 0 }, { elm: sink, num: 0 });
        src.nodes[0] = { v: 0, links: src.nodes[0].links } as any;
        const { chipsByElm } = buildDigitalCircuit([src, sink]);

        syncDigitalToNodesNew([src, sink], chipsByElm);
        expect((src.nodes[0] as any).v).toBe(3.3);
    });

    it("writes every output post of a multi-output element", () => {
        const inSrc = fakeElm(highDesc(), [[0, 1]]);
        const chip2 = fakeElm(twoOutDesc(), [[0, 1], [1, 2], [2, 3]], { highVoltage: 5 });
        const sinkA = fakeElm(sinkDesc(), [[0, 1]]);
        const sinkB = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: inSrc, num: 0 }, { elm: chip2, num: 0 });
        connect({ elm: chip2, num: 1 }, { elm: sinkA, num: 0 });
        connect({ elm: chip2, num: 2 }, { elm: sinkB, num: 0 });
        chip2.nodes[1] = { v: 0, links: chip2.nodes[1].links } as any;
        chip2.nodes[2] = { v: 0, links: chip2.nodes[2].links } as any;
        const { chipsByElm } = buildDigitalCircuit([inSrc, chip2, sinkA, sinkB]);

        syncDigitalToNodesNew([inSrc, chip2, sinkA, sinkB], chipsByElm);
        expect((chip2.nodes[1] as any).v).toBe(5); // out = in = 1
        expect((chip2.nodes[2] as any).v).toBe(0); // out = !in = 0
    });
});

describe("digitalScopeSourceNew (via the currentGraph singleton)", () => {
    beforeEach(() => setCurrentDigitalGraph(null));

    it("returns null when no graph has been built yet", () => {
        expect(digitalScopeSourceNew(fakeElm(highDesc(), [[0, 1]]))).toBeNull();
    });

    it("resolves a single-output element directly", () => {
        const src = fakeElm(highDesc(), [[0, 1]]);
        const sink = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: src, num: 0 }, { elm: sink, num: 0 });
        const graph = buildDigitalCircuit([src, sink]);
        setCurrentDigitalGraph(graph);

        expect(digitalScopeSourceNew(src)).toBe(graph.chipsByElm.get(src)![0]);
    });

    it("returns null for a multi-output element (known gap, matches the old engine's own scope)", () => {
        const inSrc = fakeElm(highDesc(), [[0, 1]]);
        const chip2 = fakeElm(twoOutDesc(), [[0, 1], [1, 2], [2, 3]]);
        const sinkA = fakeElm(sinkDesc(), [[0, 1]]);
        const sinkB = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: inSrc, num: 0 }, { elm: chip2, num: 0 });
        connect({ elm: chip2, num: 1 }, { elm: sinkA, num: 0 });
        connect({ elm: chip2, num: 2 }, { elm: sinkB, num: 0 });
        setCurrentDigitalGraph(buildDigitalCircuit([inSrc, chip2, sinkA, sinkB]));

        expect(digitalScopeSourceNew(chip2)).toBeNull();
    });

    it("resolves a wire-equivalent passthrough back to its real driver", () => {
        const src = fakeElm(highDesc(), [[0, 1]]);
        const passthrough = { nodes: [] as any[], isWireEquivalent: () => true };
        const sink = fakeElm(sinkDesc(), [[0, 1]]);
        connect({ elm: src, num: 0 }, { elm: passthrough, num: 0 }, { elm: sink, num: 0 });
        const graph = buildDigitalCircuit([src, sink]); // passthrough contributes no chip of its own
        setCurrentDigitalGraph(graph);

        expect(digitalScopeSourceNew(passthrough)).toBe(graph.chipsByElm.get(src)![0]);
    });
});

describe("getCurrentDigitalGraph/setCurrentDigitalGraph", () => {
    it("round-trips whatever was last set", () => {
        setCurrentDigitalGraph(null);
        expect(getCurrentDigitalGraph()).toBeNull();
        const graph = buildDigitalCircuit([]);
        setCurrentDigitalGraph(graph);
        expect(getCurrentDigitalGraph()).toBe(graph);
        setCurrentDigitalGraph(null);
    });
});
