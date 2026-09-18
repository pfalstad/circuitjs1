// Covers ROMElm.digitalSynthesis()/isTriStateOutput() (added to ROMElm directly, see its own
// docstring): unlike SRAM, a ROM has no WE pin, so its data pins are ALWAYS outputs - no
// readback/write-capture cell needed, just one AND(OE active, stored bit) cell per data bit,
// exactly TriStateElm's own shape (see digital/TriStateElm.test.ts). Same
// Object.create()-based construction and tieSource/probe/connect helpers as
// DigitalSynthesisPhase3.test.ts (see its header comment for why).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit, syncDigitalToNodesNew } from "./DigitalGraphBuilder";
import type { Chip } from "./chip";
import { ROMElm } from "../ROMElm";
import { CircuitElm } from "../CircuitElm";
import { connect } from "./testWiring";

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

function makeRom(addressBits: number, dataBits: number, map: [number, number][]): any {
    const rom = Object.create(ROMElm.prototype) as any;
    rom.addressBits = addressBits;
    rom.dataBits = dataBits;
    rom.addressNodes = 1;
    rom.dataNodes = 1 + addressBits;
    rom.map = new Map(map);
    rom.nodes = [];
    return rom;
}

describe("ROMElm.digitalSynthesis()", () => {
    it("marks its data posts as tri-state outputs, not just its address/OE posts", () => {
        const rom = makeRom(2, 1, [[0, 0], [1, 1]]);
        expect(rom.isTriStateOutput(rom.dataNodes)).toBe(true); // the one data bit
        expect(rom.isTriStateOutput(0)).toBe(false); // OE
        expect(rom.isTriStateOutput(1)).toBe(false); // address bit
    });

    it("reads back the table combinationally while OE is tied permanently low", () => {
        const rom = makeRom(2, 1, [[0, 0], [1, 1]]);
        const oe = tieSource("GND"); // permanently enabled
        const addrHi = tieSource("GND"); // MSB always 0
        const addrLo = manualSource(0); // LSB, toggled below
        const dataSink = probe();
        connect({ elm: oe, num: 0 }, { elm: rom, num: 0 });
        connect({ elm: addrHi, num: 0 }, { elm: rom, num: 1 });
        connect({ elm: addrLo, num: 0 }, { elm: rom, num: 2 });
        connect({ elm: rom, num: 3 }, { elm: dataSink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([oe, addrHi, addrLo, rom, dataSink]);
        addrLo.chip = chipsByElm.get(addrLo)![0];
        circuit.run(20);
        expect(chipAt(rom, 3, chipsByElm).output).toBe(0); // address 0 -> map[0]

        addrLo.set(1);
        circuit.run(20);
        expect(chipAt(rom, 3, chipsByElm).output).toBe(1); // address 1 -> map[1]
    });

    it("tri-states its output (reads 0) while OE is deasserted, without needing OE tied off", () => {
        const rom = makeRom(1, 1, [[0, 0], [1, 1]]);
        const oe = manualSource(1); // OE high = disabled (active low)
        const addr = tieSource("VCC"); // address 1 -> map[1] = 1
        const dataSink = probe();
        connect({ elm: oe, num: 0 }, { elm: rom, num: 0 });
        connect({ elm: addr, num: 0 }, { elm: rom, num: 1 });
        connect({ elm: rom, num: 2 }, { elm: dataSink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([oe, addr, rom, dataSink]);
        oe.chip = chipsByElm.get(oe)![0];
        circuit.run(20);
        expect(chipAt(rom, 2, chipsByElm).output).toBe(0); // disabled -> reads 0, not map[1]

        oe.set(0); // assert OE
        circuit.run(20);
        expect(chipAt(rom, 2, chipsByElm).output).toBe(1); // now drives map[1]
    });

    // Regression: DigitalGraph.triStateChipByNode used to resolve EVERY tri-state node of a
    // multi-cell entry to that entry's FIRST chip (chips[0]) regardless of which cell/pin the
    // node actually belonged to - so a >1-bit ROM (or a busWidth>1 TriStateElm) had every one of
    // its data posts silently show bit 0's value. Exercises the real bug report's shape: a 4-bit
    // ROM with each data post on its OWN separate node (no merge needed - this is the plain
    // per-node singleton path, which was still broken).
    it("gives each data post its own value, not entry.chips[0]'s value, for a >1-bit ROM", () => {
        const rom = makeRom(4, 4, [[5, 0b1010]]);
        rom.highVoltage = 5;
        const oe = tieSource("GND");
        // address = 0b0101 = 5, MSB first (post addressNodes+k carries bit (addressBits-1-k))
        const addr = [tieSource("GND"), tieSource("VCC"), tieSource("GND"), tieSource("VCC")];
        const sinks = [probe(), probe(), probe(), probe()];

        connect({ elm: oe, num: 0 }, { elm: rom, num: 0 });
        for (let k = 0; k < 4; k++) connect({ elm: addr[k], num: 0 }, { elm: rom, num: rom.addressNodes + k });
        for (let i = 0; i < 4; i++) connect({ elm: rom, num: rom.dataNodes + i }, { elm: sinks[i], num: 0 });
        for (let i = 0; i < 4; i++) rom.nodes[rom.dataNodes + i] = { v: 0, links: rom.nodes[rom.dataNodes + i].links };

        const elmList = [oe, ...addr, rom, ...sinks];
        const graph = buildDigitalCircuit(elmList);
        graph.circuit.run(20);
        syncDigitalToNodesNew(elmList, graph);

        // stored = 0b1010: bit i (MSB first) for i=0..3 is 1,0,1,0.
        expect([0, 1, 2, 3].map(i => (rom.nodes[rom.dataNodes + i] as any).v)).toEqual([5, 0, 5, 0]);
    });

    it("OR-merges with another tri-state driver sharing its data bus", () => {
        const warn = vi.spyOn(console, "log").mockImplementation(() => {});
        const rom = makeRom(1, 1, [[0, 0], [1, 1]]);
        const romOe = manualSource(1); // disabled
        const romAddr = tieSource("VCC");

        const other = {
            nodes: [] as { links: { num: number; elm: any }[] }[],
            isTriStateOutput: () => true,
            digitalSynthesis: () => ({
                desc: [customChipStart((chip: Chip) => {
                    if (chip.output !== 1) chip.pendingEvent = chip.circuit.queuePush(chip, 0);
                }).outputPin(1)],
                pinMap: new Map([[0, 1]]),
            }),
        };
        const sink = probe();

        connect({ elm: romOe, num: 0 }, { elm: rom, num: 0 });
        connect({ elm: romAddr, num: 0 }, { elm: rom, num: 1 });
        connect({ elm: rom, num: 2 }, { elm: other, num: 0 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([romOe, romAddr, rom, other, sink]);
        romOe.chip = chipsByElm.get(romOe)![0];
        circuit.run(20);

        // ROM disabled (contributes 0); `other` always drives 1 -> merged bus reads 1.
        expect(warn).not.toHaveBeenCalled();
        expect(chipsByElm.get(sink)![0].inputLinks[0].chip.output).toBe(1);
        warn.mockRestore();
    });
});
