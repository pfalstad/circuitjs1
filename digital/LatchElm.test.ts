// Tests the real digitalSynthesis() implementation added to LatchElm (dual-mode: a
// level-sensitive transparent latch, or - with FLAG_NO_EDGE cleared - an edge-triggered
// register), exercised through DigitalGraphBuilder against real dice-ts-engine Circuits, same
// approach as DigitalSynthesisPhase3.test.ts's DFlipFlopElm/JKFlipFlopElm coverage.
//
// Real CircuitElm construction touches CircuitElm.app deep inside setPoints()/setSize(), not
// available outside the running app - Object.create() bypasses the constructor while still
// exercising each class's real methods, same pattern as those tests. LatchElm's FLAG_* constants
// are plain (non-static) instance fields normally set up by the real constructor, so a
// bypassed instance needs them poked on as own properties before any hasReset()/isEdgeTriggered()
// etc. call - makeLatch() below does that once, matching setupPins()'s own pin-layout order.
import { describe, it, expect, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import type { Chip } from "./chip";
import { LatchElm } from "../LatchElm";
import { CircuitElm } from "../CircuitElm";

beforeEach(() => {
    CircuitElm.sim = { t: 0, maxTimeStep: 1e-6 } as any;
});

function tieSource(tie: "VCC" | "GND") {
    return { digitalTie: () => tie, nodes: [] as { links: { num: number; elm: any }[] }[] };
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

function manualSource(initial: 0 | 1) {
    const src = {
        nodes: [] as { links: { num: number; elm: any }[] }[],
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

function chipAt(elm: any, post: number, chipsByElm: Map<any, Chip[]>): Chip {
    const { pinMap, desc } = elm.digitalSynthesis();
    const pin = pinMap.get(post)!;
    const idx = desc.findIndex((d: any) => d.outPin === pin);
    return chipsByElm.get(elm)![idx];
}

/** Builds an Object.create(LatchElm.prototype) instance with its FLAG_* constants and pin-index
 * fields (loadPin/resetPin/setPin) poked on exactly as the real setupPins() would lay them out
 * (bit0..bitN-1 D pins, then bit0..bitN-1 Q pins, then Ld, then Reset, then Set) - no Set/enable
 * pins are exercised by these tests, so those fields are left unset. */
function makeLatch(bits: number, opts: { edgeTriggered?: boolean; reset?: boolean } = {}) {
    const chip = Object.create(LatchElm.prototype) as any;
    chip.FLAG_STATE = 2;
    chip.FLAG_NO_EDGE = 4;
    chip.FLAG_RESET = 8;
    chip.FLAG_SET = 16;
    chip.FLAG_ENABLE_MASK = 32 | 64;
    chip.FLAG_ENABLE_SHIFT = 5;
    chip.FLAG_RESET_INVERT = 128;

    chip.bits = bits;
    let flags = chip.FLAG_STATE;
    if (!opts.edgeTriggered) flags |= chip.FLAG_NO_EDGE;
    if (opts.reset) flags |= chip.FLAG_RESET;
    chip.flags = flags;

    let pinIndex = bits * 2;
    chip.loadPin = pinIndex++;
    if (opts.reset) chip.resetPin = pinIndex++;
    chip.nodes = [];
    return chip;
}

describe("LatchElm.digitalSynthesis() - transparent latch mode (FLAG_NO_EDGE)", () => {
    it("continuously follows D while enabled, holds the last value once disabled", () => {
        const chip = makeLatch(2); // D0=post0, D1=post1, Q0=post2, Q1=post3, Ld=post4
        const d0 = manualSource(0), d1 = manualSource(0), ld = manualSource(0);
        const q0Sink = probe(), q1Sink = probe();
        connect({ elm: d0, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: d1, num: 0 }, { elm: chip, num: 1 });
        connect({ elm: ld, num: 0 }, { elm: chip, num: 4 });
        connect({ elm: chip, num: 2 }, { elm: q0Sink, num: 0 });
        connect({ elm: chip, num: 3 }, { elm: q1Sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([d0, d1, ld, chip, q0Sink, q1Sink]);
        d0.chip = chipsByElm.get(d0)![0];
        d1.chip = chipsByElm.get(d1)![0];
        ld.chip = chipsByElm.get(ld)![0];
        circuit.run(20);

        expect(chipAt(chip, 2, chipsByElm).output).toBe(0); // disabled at cold-start: holds initial 0
        expect(chipAt(chip, 3, chipsByElm).output).toBe(0);

        ld.set(1); circuit.run(20); // enable - transparent
        d0.set(1); circuit.run(20);
        expect(chipAt(chip, 2, chipsByElm).output).toBe(1); // Q0 follows D0 immediately, no clock edge needed
        d1.set(1); circuit.run(20);
        expect(chipAt(chip, 3, chipsByElm).output).toBe(1);
        d0.set(0); circuit.run(20);
        expect(chipAt(chip, 2, chipsByElm).output).toBe(0); // still transparent - follows back down too

        ld.set(0); circuit.run(20); // disable
        d0.set(1); circuit.run(20); // changing D now must NOT reach Q
        expect(chipAt(chip, 2, chipsByElm).output).toBe(0); // held
        expect(chipAt(chip, 3, chipsByElm).output).toBe(1); // held
    });
});

describe("LatchElm.digitalSynthesis() - edge-triggered register mode (default)", () => {
    it("captures D only on the rising edge of Ld, holds otherwise", () => {
        const chip = makeLatch(1, { edgeTriggered: true }); // D0=post0, Q0=post1, Ld=post2
        const d = tieSource("VCC");
        const clk = manualSource(0);
        const qSink = probe();
        connect({ elm: d, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: clk, num: 0 }, { elm: chip, num: 2 });
        connect({ elm: chip, num: 1 }, { elm: qSink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([d, clk, chip, qSink]);
        clk.chip = chipsByElm.get(clk)![0];
        circuit.run(20);

        expect(chipAt(chip, 1, chipsByElm).output).toBe(0); // no edge yet
        clk.set(1); circuit.run(20);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(1); // captured D=1 on the rising edge

        clk.set(0); circuit.run(20);
        clk.set(1); circuit.run(20); // a second rising edge with D unchanged changes nothing observable
        expect(chipAt(chip, 1, chipsByElm).output).toBe(1);
    });
});

describe("LatchElm.digitalSynthesis() - Reset pin", () => {
    it("forces Q low regardless of Ld/D, then the latch resumes tracking D once released", () => {
        const chip = makeLatch(1, { reset: true }); // D0=post0, Q0=post1, Ld=post2, Reset=post3
        const d = manualSource(1);
        const ld = manualSource(1);
        const r = manualSource(0);
        const qSink = probe();
        connect({ elm: d, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: ld, num: 0 }, { elm: chip, num: 2 });
        connect({ elm: r, num: 0 }, { elm: chip, num: 3 });
        connect({ elm: chip, num: 1 }, { elm: qSink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([d, ld, r, chip, qSink]);
        d.chip = chipsByElm.get(d)![0];
        ld.chip = chipsByElm.get(ld)![0];
        r.chip = chipsByElm.get(r)![0];
        circuit.run(20);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(1); // enabled, transparent: Q follows D=1

        r.set(1); circuit.run(20);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(0); // Reset overrides even though Ld/D are still high

        r.set(0); circuit.run(20);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(1); // released - resumes transparently tracking D
    });
});
