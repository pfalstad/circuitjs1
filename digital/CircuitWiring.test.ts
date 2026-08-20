import { describe, it, expect, beforeEach, vi } from "vitest";
import { Scheduler } from "./Scheduler";
import { DigitalElm, DigitalConst, GroupPin } from "./DigitalElm";
import { wireDigitalCircuit, digitalScopeSource } from "./CircuitWiring";
import { NandGateElm } from "../GateElm";
import { CounterElm } from "../CounterElm";

/** A minimal fake gate: shaped exactly like what CircuitWiring's
 * isGateLike()/resolveOutput() duck-typing looks for (inputCount +
 * addInput()), without needing a real CircuitElm (which can't be
 * constructed headlessly - see ChipGroupLogic.test.ts). Its own output
 * post is always index `inputCount`, matching GateElm's real convention. */
function fakeGate(inputCount: number) {
    return {
        inputCount,
        inputs: [] as unknown[],
        liveOutputs: [] as unknown[],
        addInput(...els: unknown[]) { this.inputs.push(...els); },
        nodes: [] as { links: { num: number; elm: any }[] }[],
    };
}

/** Wires a shared CircuitNode-like object across several (elm, post) pairs,
 * exactly like SimulationManager.makeNodeList() would after wire closure
 * has merged everything onto one node. */
function connect(...posts: { elm: any; num: number }[]): void {
    const node = { links: posts.map(p => ({ num: p.num, elm: p.elm })) };
    for (const p of posts) p.elm.nodes[p.num] = node;
}

/** A minimal fake wire-equivalent passthrough (LabeledNodeElm, WireElm, ...):
 * a single post, no digital identity of its own. */
function fakeWireElm() {
    return {
        isWireEquivalent: () => true,
        nodes: [] as { links: { num: number; elm: any }[] }[],
    };
}

let scheduler: Scheduler;
beforeEach(() => {
    scheduler = new Scheduler();
    DigitalElm.current = scheduler;
});

describe("wireDigitalCircuit - graph algorithm", () => {
    it("connects a gate's inputs to whatever drives each post, in post order", () => {
        const src0 = fakeGate(0); // acts as a constant-ish single-output source
        const src1 = fakeGate(0);
        const sink = fakeGate(2);

        connect({ elm: src0, num: 0 }, { elm: sink, num: 0 });
        connect({ elm: src1, num: 0 }, { elm: sink, num: 1 });

        wireDigitalCircuit([src0, src1, sink]);

        expect(sink.inputs).toEqual([src0, src1]);
    });

    it("falls back to a constant-false DigitalConst when a post has no driver", () => {
        const sink = fakeGate(2);
        const src0 = fakeGate(0);
        connect({ elm: src0, num: 0 }, { elm: sink, num: 0 });
        sink.nodes[1] = { links: [{ num: 1, elm: sink }] }; // post 1: nothing else on this node

        wireDigitalCircuit([src0, sink]);

        expect(sink.inputs[0]).toBe(src0);
        expect(sink.inputs[1]).toBeInstanceOf(DigitalConst);
        expect((sink.inputs[1] as DigitalConst).currentValue()).toBe(false);
    });

    it("warns and picks the first candidate when a node has multiple drivers", () => {
        const warn = vi.spyOn(console, "log").mockImplementation(() => {});
        const srcA = fakeGate(0);
        const srcB = fakeGate(0);
        const sink = fakeGate(1);
        connect({ elm: srcA, num: 0 }, { elm: srcB, num: 0 }, { elm: sink, num: 0 });

        wireDigitalCircuit([srcA, srcB, sink]);

        expect(sink.inputs[0]).toBe(srcA);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it("wires a chip's inputs array from pins[], excluding output pins, in post order", () => {
        const clk = fakeGate(0);
        const reset = fakeGate(0);
        const digitalPins = [{ inputs: [] as unknown[], addInput(...els: unknown[]) { this.inputs.push(...els); } },
                              { inputs: [] as unknown[], addInput(...els: unknown[]) { this.inputs.push(...els); } }];
        const chip = {
            pins: [{ output: false }, { output: false }, { output: true }, { output: true }],
            digitalPins, // 2 output bits
            inputs: [] as unknown[],
            nodes: [] as { links: { num: number; elm: any }[] }[],
        };
        connect({ elm: clk, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: reset, num: 0 }, { elm: chip, num: 1 });
        chip.nodes[2] = { links: [{ num: 2, elm: chip }] };
        chip.nodes[3] = { links: [{ num: 3, elm: chip }] };

        wireDigitalCircuit([clk, reset, chip]);

        expect(chip.inputs).toEqual([clk, reset]);
        // Each digitalPin must go through real addInput() calls too (not
        // just the group's own .inputs bookkeeping) - otherwise clk/reset
        // never learn the pins depend on them, and notifyOutputs() would
        // never reach them when clk/reset actually change.
        expect(digitalPins[0].inputs).toEqual([clk, reset]);
        expect(digitalPins[1].inputs).toEqual([clk, reset]);
    });
});

describe("wireDigitalCircuit - real element classes", () => {
    it("resolves a chip's output post to the matching GroupPin, driving a real gate", () => {
        // A 3-bit CounterElm's bit-1 output feeding a NandGateElm's input,
        // bypassing CircuitElm's constructor (needs the live app - see
        // ChipGroupLogic.test.ts) via Object.create while still exercising
        // the real classes' shapes.
        const counter = Object.create(CounterElm.prototype) as CounterElm;
        counter.bits = 3;
        counter.pins = [
            { output: false } as any, // clk
            { output: false } as any, // reset
            { output: true } as any,  // Q2 (MSB) -> digitalPins[0]
            { output: true } as any,  // Q1      -> digitalPins[1]
            { output: true } as any,  // Q0 (LSB)-> digitalPins[2]
        ];
        counter.digitalPins = [new GroupPin(counter, 0), new GroupPin(counter, 1), new GroupPin(counter, 2)];
        counter.nodes = [];

        const clkSrc = fakeGate(0);
        const resetSrc = fakeGate(0);
        const gate = Object.create(NandGateElm.prototype) as NandGateElm;
        gate.inputCount = 1;
        (gate as any).inputs = [];
        (gate as any).addInput = function (...els: unknown[]) { (this.inputs as unknown[]).push(...els); };
        (gate as any).nodes = [];

        connect({ elm: clkSrc, num: 0 }, { elm: counter, num: 0 });
        connect({ elm: resetSrc, num: 0 }, { elm: counter, num: 1 });
        counter.nodes[2] = { links: [{ num: 2, elm: counter }] } as any;
        counter.nodes[4] = { links: [{ num: 4, elm: counter }] } as any;
        // Q1 (post 3) drives the gate's only input.
        connect({ elm: counter, num: 3 }, { elm: gate, num: 0 });

        wireDigitalCircuit([clkSrc, resetSrc, counter, gate]);

        expect((counter as any).inputs).toEqual([clkSrc, resetSrc]);
        expect((gate as any).inputs).toEqual([counter.digitalPins[1]]);
    });
});

describe("digitalScopeSource", () => {
    it("returns a gate-like element directly", () => {
        const gate = fakeGate(2);
        expect(digitalScopeSource(gate)).toBe(gate);
    });

    it("resolves a wire-equivalent passthrough (e.g. LabeledNodeElm) to whatever actually drives its node", () => {
        const src = fakeGate(0); // acts as the real digital driver
        const label = fakeWireElm();
        connect({ elm: src, num: 0 }, { elm: label, num: 0 });

        expect(digitalScopeSource(label)).toBe(src);
    });

    it("resolves through a chain of wire segments onto one merged node", () => {
        const src = fakeGate(0);
        const wire = fakeWireElm();
        const label = fakeWireElm();
        // all three posts end up on the SAME merged CircuitNode after wire
        // closure, exactly as connect() models it - findDriver() doesn't
        // need to walk the chain itself.
        connect({ elm: src, num: 0 }, { elm: wire, num: 0 }, { elm: label, num: 0 });

        expect(digitalScopeSource(label)).toBe(src);
    });

    it("returns null for a wire-equivalent node with no digital driver", () => {
        const label = fakeWireElm();
        connect({ elm: label, num: 0 });
        expect(digitalScopeSource(label)).toBeNull();
    });

    it("returns null for a plain (non-digital, non-wire) element", () => {
        expect(digitalScopeSource({ nodes: [] })).toBeNull();
    });
});
