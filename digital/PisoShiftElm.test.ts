// Tests PisoShiftElm.digitalSynthesis(), which models execute()'s circular data[]/dataIndex
// buffer as a genuine multi-stage shift chain (see its own docstring for why the two are
// equivalent) - exercised through DigitalGraphBuilder against real dice-ts-engine Circuits, same
// approach as LatchElm.test.ts.
import { describe, it, expect, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import type { Chip } from "./chip";
import { PisoShiftElm } from "../PisoShiftElm";
import { CircuitElm } from "../CircuitElm";

beforeEach(() => {
    CircuitElm.sim = { t: 0, maxTimeStep: 1e-6 } as any;
});

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
                if (src.value !== chip.output) chip.pendingEvent = chip.circuit.queuePush(chip, 0n);
            }).outputPin(1)],
            pinMap: new Map([[0, 1]]),
        }),
        set(v: 0 | 1) {
            src.value = v;
            if (src.chip && v !== src.chip.output) src.chip.pendingEvent = src.chip.circuit.queuePush(src.chip, 0n);
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

/** Object.create(PisoShiftElm.prototype), with the instance fields setupPins()/the constructor
 * would normally have set poked on directly - FLAG_NEW_BEHAVIOR is a (non-static) instance field
 * on the real class, so a bypassed instance needs it set explicitly before hasNewBhvr() works. */
function makePiso(bits: number, newBhvr: boolean) {
    const chip = Object.create(PisoShiftElm.prototype) as any;
    chip.FLAG_NEW_BEHAVIOR = 2;
    chip.bits = bits;
    chip.flags = newBhvr ? chip.FLAG_NEW_BEHAVIOR : 0;
    chip.dataPinIndex = newBhvr ? 4 : 3;
    chip.nodes = [];
    return chip;
}

describe("PisoShiftElm.digitalSynthesis() - new behavior (with SER pin)", () => {
    it("loads MSB-first onto Q, then shifts down through the parallel data, then in the serial data", () => {
        // bits=3: posts LD=0,CLK=1,Q=2,SER=3,D2=4,D1=5,D0=6 -> pins 1,2,3,4,5,6,7
        const chip = makePiso(3, true);
        const ld = manualSource(0), clk = manualSource(0), ser = manualSource(1);
        const d2 = manualSource(1), d1 = manualSource(0), d0 = manualSource(0);
        const qSink = probe();
        connect({ elm: ld, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: clk, num: 0 }, { elm: chip, num: 1 });
        connect({ elm: chip, num: 2 }, { elm: qSink, num: 0 });
        connect({ elm: ser, num: 0 }, { elm: chip, num: 3 });
        connect({ elm: d2, num: 0 }, { elm: chip, num: 4 });
        connect({ elm: d1, num: 0 }, { elm: chip, num: 5 });
        connect({ elm: d0, num: 0 }, { elm: chip, num: 6 });

        const elms = [ld, clk, ser, d2, d1, d0, chip, qSink];
        const { circuit, chipsByElm } = buildDigitalCircuit(elms);
        for (const src of [ld, clk, ser, d2, d1, d0]) src.chip = chipsByElm.get(src)![0];
        circuit.run(20n);

        ld.set(1); circuit.run(20n);
        expect(chipAt(chip, 2, chipsByElm).output).toBe(1); // Q = D2 (MSB), loaded async of any clock

        ld.set(0); circuit.run(20n);
        clk.set(1); circuit.run(20n);
        expect(chipAt(chip, 2, chipsByElm).output).toBe(0); // Q = D1

        clk.set(0); circuit.run(20n);
        clk.set(1); circuit.run(20n);
        expect(chipAt(chip, 2, chipsByElm).output).toBe(0); // Q = D0

        clk.set(0); circuit.run(20n);
        clk.set(1); circuit.run(20n);
        expect(chipAt(chip, 2, chipsByElm).output).toBe(1); // Q = SER, as sampled on the very first CLK edge
    });
});

describe("PisoShiftElm.digitalSynthesis() - legacy behavior (no SER pin)", () => {
    it("shifts in a constant 0 once the loaded data has fully shifted out", () => {
        // bits=2: posts LD=0,CLK=1,Q=2,D1=3,D0=4 -> pins 1,2,3,4,5
        const chip = makePiso(2, false);
        const ld = manualSource(0), clk = manualSource(0);
        const d1 = manualSource(1), d0 = manualSource(1);
        const qSink = probe();
        connect({ elm: ld, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: clk, num: 0 }, { elm: chip, num: 1 });
        connect({ elm: chip, num: 2 }, { elm: qSink, num: 0 });
        connect({ elm: d1, num: 0 }, { elm: chip, num: 3 });
        connect({ elm: d0, num: 0 }, { elm: chip, num: 4 });

        const elms = [ld, clk, d1, d0, chip, qSink];
        const { circuit, chipsByElm } = buildDigitalCircuit(elms);
        for (const src of [ld, clk, d1, d0]) src.chip = chipsByElm.get(src)![0];
        circuit.run(20n);

        ld.set(1); circuit.run(20n);
        expect(chipAt(chip, 2, chipsByElm).output).toBe(1); // Q = D1 (MSB)

        ld.set(0); circuit.run(20n);
        clk.set(1); circuit.run(20n);
        expect(chipAt(chip, 2, chipsByElm).output).toBe(1); // Q = D0

        clk.set(0); circuit.run(20n);
        clk.set(1); circuit.run(20n);
        expect(chipAt(chip, 2, chipsByElm).output).toBe(0); // Q = serial-in, fixed at 0 with no SER pin
    });
});
