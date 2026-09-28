// Regression test for a seedInitialDigitalState() bug (see DigitalGraphBuilder.ts): an inverted
// Set/Reset DFlipFlopElm cold-starts its state cell to Q=1 (S/R both floating 0 at construction
// reads as "both active" once XORed with invertBit), then seedInitialDigitalState() corrects that
// back down to the real saved value (0, for a freshly-placed flip-flop with no saved "v1"). The
// correction used to only patch consumers' cached view of the state cell's value when the NEW
// value was 1 (`if (chip.output) ...`), silently skipping the 1->0 direction - leaving notQ/qBuf
// permanently reading a stale, stuck internalQ despite the state cell's own `.output` now being
// correct. This exercises the exact path SimulationManager.initDigitalCircuit() uses
// (buildDigitalCircuit() + seedInitialDigitalState()), unlike DigitalSynthesisPhase3.test.ts's
// coverage, which only calls buildDigitalCircuit() and so never touches this bug.
import { describe, it, expect, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit, seedInitialDigitalState } from "./DigitalGraphBuilder";
import type { Chip } from "./chip";
import { DFlipFlopElm } from "../DFlipFlopElm";
import { CircuitElm } from "../CircuitElm";
import { connect } from "./testWiring";

beforeEach(() => {
    CircuitElm.sim = { t: 0, maxTimeStep: 1e-6 } as any;
});

function tieSource(tie: "VCC" | "GND") {
    return { digitalTie: () => tie, nodes: [] as { links: { num: number; elm: any }[] }[] };
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

describe("DFlipFlopElm inverted Set/Reset - fresh (unsaved) construction", () => {
    it("Set still forces Q high once the flip-flop has settled from its cold-start", () => {
        const chip = Object.create(DFlipFlopElm.prototype) as any;
        chip.flags = DFlipFlopElm.FLAG_RESET | DFlipFlopElm.FLAG_SET | DFlipFlopElm.FLAG_INVERT_SET_RESET;
        chip.propagationDelay = 0;
        chip.nodes = [];
        // Matches a freshly-placed (or freshly-XML-loaded-with-no-v1-attr) flip-flop: Q defaults
        // false, same as ChipElm.undumpXml()'s "v1" default of 0.
        chip.pins = [{ value: false }, { value: false }, { value: false }, { value: false }, { value: false }, { value: false }];

        const d = tieSource("GND");
        const clk = manualSource(0);
        // Both start high (inactive, active-low) - exactly digitalinvertsetreset.txt's saved
        // p="1" LogicInputElms, matching the real repro circuit. Since both floated at 0
        // (invalid "both asserted") at cold-start before these push their real values, releasing
        // them is itself a real, order-dependent SR-latch race whose outcome isn't asserted on
        // below - only that Set correctly overrides it afterward.
        const r = manualSource(1);
        const s = manualSource(1);
        connect({ elm: d, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: clk, num: 0 }, { elm: chip, num: 3 });
        connect({ elm: r, num: 0 }, { elm: chip, num: 4 });
        connect({ elm: s, num: 0 }, { elm: chip, num: 5 });

        // The exact sequence SimulationManager.initDigitalCircuit() runs: build, THEN seed.
        const { circuit, chipsByElm } = buildDigitalCircuit([d, clk, r, s, chip]);
        seedInitialDigitalState([d, clk, r, s, chip], chipsByElm);
        clk.chip = chipsByElm.get(clk)![0];
        r.chip = chipsByElm.get(r)![0];
        s.chip = chipsByElm.get(s)![0];
        circuit.run(20); // let the cold-start race settle before testing anything

        s.set(0); // assert Set (active-low)
        circuit.run(20);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(1); // Q forced high
        expect(chipAt(chip, 2, chipsByElm).output).toBe(0); // /Q agrees

        s.set(1);
        r.set(0); // assert Reset (active-low)
        circuit.run(20);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(0); // Q forced low
        expect(chipAt(chip, 2, chipsByElm).output).toBe(1); // /Q agrees
    });
});
