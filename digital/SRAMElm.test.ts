// Covers SRAMElm.digitalSynthesis()/isTriStateOutput()/digitalTriStateReadbackPin() (see their
// own docstrings): one CUSTOM_CHIP per data bit, matching dice-ts's own bipolar-RAM catalog
// entries (chips/82S16.cpp, chips/8225.cpp), except SRAMElm's data pins are genuinely
// bidirectional (same pin drives while reading, receives while writing) where those real chips
// have separate Din/Dout pins - so a write must capture the RESOLVED bus value via the readback
// pin, not this element's own (forced-to-0-while-writing) output. Same Object.create()-based
// construction and manualSource()/probe()/connect() helpers as DigitalSynthesisPhase3.test.ts
// (see its header comment for why).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import type { Chip } from "./chip";
import { SRAMElm } from "../SRAMElm";
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

// An external tri-state bus driver (data & enable), so a write test can put a real value onto
// SRAM's shared data node - see isTriStateOutput's own "AND(enable, data)" convention.
function triStateSource(data: 0 | 1, enable: 0 | 1) {
    const src = {
        nodes: [] as { links: { num: number; elm: any }[] }[],
        data, enable,
        chip: null as Chip | null,
        isTriStateOutput: () => true,
        digitalSynthesis: () => ({
            desc: [customChipStart((chip: Chip) => {
                const out = (src.data && src.enable) ? 1 : 0;
                if (out !== chip.output) chip.pendingEvent = chip.circuit.queuePush(chip, 0n);
            }).outputPin(1)],
            pinMap: new Map([[0, 1]]),
        }),
        poke() {
            const out = (src.data && src.enable) ? 1 : 0;
            if (src.chip && out !== src.chip.output) src.chip.pendingEvent = src.chip.circuit.queuePush(src.chip, 0n);
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

function makeSram(addressBits: number, dataBits: number, map: [number, number][] = []): any {
    const sram = Object.create(SRAMElm.prototype) as any;
    sram.addressBits = addressBits;
    sram.dataBits = dataBits;
    sram.addressNodes = 2;
    sram.dataNodes = 2 + addressBits;
    sram.map = new Map(map);
    sram.nodes = [];
    return sram;
}

describe("SRAMElm.digitalSynthesis() - read", () => {
    it("reads back the stored word when WE is deasserted and OE is asserted", () => {
        const sram = makeSram(1, 2, [[1, 0b10]]);
        const we = tieSource("VCC"); // WE deasserted (active low)
        const oe = tieSource("GND"); // OE asserted
        const addr = tieSource("VCC"); // address 1
        const sinks = [probe(), probe()];

        connect({ elm: we, num: 0 }, { elm: sram, num: 0 });
        connect({ elm: oe, num: 0 }, { elm: sram, num: 1 });
        connect({ elm: addr, num: 0 }, { elm: sram, num: 2 });
        connect({ elm: sram, num: 3 }, { elm: sinks[0], num: 0 });
        connect({ elm: sram, num: 4 }, { elm: sinks[1], num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([we, oe, addr, sram, ...sinks]);
        circuit.run(20n);

        expect(chipAt(sram, 3, chipsByElm).output).toBe(1); // bit0 of 0b10
        expect(chipAt(sram, 4, chipsByElm).output).toBe(0); // bit1 of 0b10
    });

    it("tri-states its outputs (reads 0) while OE is deasserted", () => {
        const sram = makeSram(1, 1, [[1, 1]]);
        const we = tieSource("VCC");
        const oe = manualSource(1); // OE deasserted (active low, 1 = high = disabled)
        const addr = tieSource("VCC");
        const sink = probe();

        connect({ elm: we, num: 0 }, { elm: sram, num: 0 });
        connect({ elm: oe, num: 0 }, { elm: sram, num: 1 });
        connect({ elm: addr, num: 0 }, { elm: sram, num: 2 });
        connect({ elm: sram, num: 3 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([we, oe, addr, sram, sink]);
        oe.chip = chipsByElm.get(oe)![0];
        circuit.run(20n);
        expect(chipAt(sram, 3, chipsByElm).output).toBe(0);

        oe.set(0);
        circuit.run(20n);
        expect(chipAt(sram, 3, chipsByElm).output).toBe(1);
    });
});

describe("SRAMElm.digitalSynthesis() - write (via digitalTriStateReadbackPin)", () => {
    it("captures an external tri-state writer's value onto the shared data bus", () => {
        const warn = vi.spyOn(console, "log").mockImplementation(() => { });
        const sram = makeSram(1, 2);
        const we = manualSource(1); // deasserted initially
        const oe = tieSource("VCC"); // permanently deasserted - SRAM never drives here
        const addr = tieSource("VCC"); // address 1
        const writers = [triStateSource(0, 0), triStateSource(0, 0)];

        connect({ elm: we, num: 0 }, { elm: sram, num: 0 });
        connect({ elm: oe, num: 0 }, { elm: sram, num: 1 });
        connect({ elm: addr, num: 0 }, { elm: sram, num: 2 });
        connect({ elm: sram, num: 3 }, { elm: writers[0], num: 0 });
        connect({ elm: sram, num: 4 }, { elm: writers[1], num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([we, oe, addr, sram, ...writers]);
        we.chip = chipsByElm.get(we)![0];
        writers[0].chip = chipsByElm.get(writers[0])![0];
        writers[1].chip = chipsByElm.get(writers[1])![0];
        circuit.run(20n);
        expect(warn).not.toHaveBeenCalled(); // both writers + SRAM are tri-state -> clean OR-merge

        // drive data = 0b10 onto the bus, then assert WE.
        writers[0].data = 1; writers[0].enable = 1; writers[0].poke();
        writers[1].data = 0; writers[1].enable = 1; writers[1].poke();
        we.set(0);
        circuit.run(20n);

        expect(sram.map.get(1)).toBe(0b10);
        warn.mockRestore();
    });

    it("never drives its own output while WE is asserted, regardless of OE", () => {
        const sram = makeSram(1, 1, [[1, 1]]);
        const we = tieSource("GND"); // asserted
        const oe = tieSource("GND"); // asserted too - should still not drive while writing
        const addr = tieSource("VCC");
        const writer = triStateSource(1, 1);
        const sink = probe();

        connect({ elm: we, num: 0 }, { elm: sram, num: 0 });
        connect({ elm: oe, num: 0 }, { elm: sram, num: 1 });
        connect({ elm: addr, num: 0 }, { elm: sram, num: 2 });
        connect({ elm: sram, num: 3 }, { elm: writer, num: 0 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([we, oe, addr, sram, writer, sink]);
        writer.chip = chipsByElm.get(writer)![0];
        circuit.run(20n);

        expect(chipAt(sram, 3, chipsByElm).output).toBe(0); // SRAM's own contribution stays 0
        expect(chipsByElm.get(sink)![0].inputLinks[0].chip.output).toBe(1); // bus shows writer's 1
        expect(sram.map.get(1)).toBe(1); // and it got captured
    });
});
