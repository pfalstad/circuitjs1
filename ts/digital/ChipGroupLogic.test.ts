// Ports the truth-table CASES from the old digital/DigitalElm.ts-based ChipGroupLogic.test.ts
// (see noble-stirring-rabin.md's Testing section: "Port ChipGroupLogic.test.ts's truth-table
// cases directly - they test pure input->output logic, independent of the engine") against the
// real digitalSynthesis() implementations, exercised through a real dice-ts Circuit - same
// manualSource()/probe()/connect()/chipAt() harness as DigitalSynthesisPhase3.test.ts. The old
// file's alwaysDemoteOn() assertions don't port: promotion decisions are entirely internal to
// dice-ts's own Chip state machine now, not exposed per-input the way the old evaluate()-based
// engine required.
import { describe, it, expect, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import type { Chip } from "./chip";
import { DFlipFlopElm } from "../DFlipFlopElm";
import { JKFlipFlopElm } from "../JKFlipFlopElm";
import { CounterElm } from "../CounterElm";
import { CircuitElm } from "../CircuitElm";
import { connect } from "./testWiring";

beforeEach(() => {
    CircuitElm.sim = { t: 0, maxTimeStep: 1e-6 } as any;
});

function probe() {
    return {
        digitalSynthesis: () => ({ desc: [customChipStart(() => { }).inputPins(1)], pinMap: new Map([[0, 1]]) }),
        nodes: [] as { links: { num: number; elm: any }[] }[],
    };
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

describe("DFlipFlopElm truth table", () => {
    it("set/reset both asserted at once reproduces the same forbidden state (Q and /Q both true) real hardware would", () => {
        const chip = Object.create(DFlipFlopElm.prototype) as any;
        chip.flags = DFlipFlopElm.FLAG_RESET | DFlipFlopElm.FLAG_SET;
        chip.propagationDelay = 0;
        chip.nodes = [];

        const d = manualSource(0);
        const clk = manualSource(0);
        const r = manualSource(0);
        const s = manualSource(0);
        const notQSink = probe(); // notQ is a pure leaf cell - needs an external sink to survive dead-code elimination
        connect({ elm: d, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: clk, num: 0 }, { elm: chip, num: 3 });
        connect({ elm: r, num: 0 }, { elm: chip, num: 4 });
        connect({ elm: s, num: 0 }, { elm: chip, num: 5 });
        connect({ elm: chip, num: 2 }, { elm: notQSink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([d, clk, r, s, chip, notQSink]);
        r.chip = chipsByElm.get(r)![0];
        s.chip = chipsByElm.get(s)![0];
        circuit.run(20);

        s.set(1);
        circuit.run(20);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(1); // isSet only
        expect(chipAt(chip, 2, chipsByElm).output).toBe(0);

        s.set(0);
        r.set(1);
        circuit.run(20);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(0); // isReset only
        expect(chipAt(chip, 2, chipsByElm).output).toBe(1);

        s.set(1); // both asserted at once
        circuit.run(20);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(1); // Q
        expect(chipAt(chip, 2, chipsByElm).output).toBe(1); // /Q - forbidden state, not simply !Q
    });
});

describe("JKFlipFlopElm truth table", () => {
    it("negative-edge triggering and async reset", () => {
        const chip = Object.create(JKFlipFlopElm.prototype) as any;
        chip.flags = JKFlipFlopElm.FLAG_RESET; // negative edge (no FLAG_POSITIVE_EDGE)
        chip.propagationDelay = 0;
        chip.nodes = [];

        const j = manualSource(1);
        const clk = manualSource(1); // start high so the first edge (falling) is a real transition
        const k = manualSource(0);
        const r = manualSource(0);
        const qSink = probe(); // Q is only otherwise consumed by notQ - needs an external sink to survive dead-code elimination
        connect({ elm: j, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: clk, num: 0 }, { elm: chip, num: 1 });
        connect({ elm: k, num: 0 }, { elm: chip, num: 2 });
        connect({ elm: r, num: 0 }, { elm: chip, num: 5 });
        connect({ elm: chip, num: 3 }, { elm: qSink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([j, clk, k, r, chip, qSink]);
        clk.chip = chipsByElm.get(clk)![0];
        r.chip = chipsByElm.get(r)![0];
        circuit.run(20);

        clk.set(0); // falling edge
        circuit.run(20);
        expect(chipAt(chip, 3, chipsByElm).output).toBe(1); // J=1,K=0 -> set

        r.set(1);
        circuit.run(20);
        expect(chipAt(chip, 3, chipsByElm).output).toBe(0); // async reset overrides immediately, no edge needed
    });
});

describe("CounterElm truth table", () => {
    it("respects modulus, the up/down pin, and a mid-run reset", () => {
        const chip = Object.create(CounterElm.prototype) as any;
        chip.bits = 4;
        chip.modulus = 5;
        chip.invertreset = false;
        chip.flags = CounterElm.FLAG_UP_DOWN;
        chip.propagationDelay = 0;
        chip.nodes = [];

        const clk = manualSource(0);
        const reset = manualSource(0);
        const updown = manualSource(1); // count down
        connect({ elm: clk, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: reset, num: 0 }, { elm: chip, num: 1 });
        connect({ elm: updown, num: 0 }, { elm: chip, num: 6 });

        const { circuit, chipsByElm } = buildDigitalCircuit([clk, reset, updown, chip]);
        clk.chip = chipsByElm.get(clk)![0];
        reset.chip = chipsByElm.get(reset)![0];
        updown.chip = chipsByElm.get(updown)![0];
        circuit.run(20);

        const readValue = () => {
            let v = 0;
            for (let k = 0; k < 4; k++) v |= chipAt(chip, 2 + k, chipsByElm).output << (3 - k);
            return v;
        };
        const tick = () => {
            clk.set(1);
            circuit.run(20);
            const v = readValue();
            clk.set(0);
            circuit.run(20);
            return v;
        };

        // starts at 0, counting down with modulus 5: wraps to 4.
        expect(tick()).toBe(4);
        expect(tick()).toBe(3);

        reset.set(1);
        circuit.run(20);
        expect(readValue()).toBe(0);
    });
});
