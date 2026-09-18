// Phase 4 (see noble-stirring-rabin.md): tests the real digitalSynthesis() implementation added
// to DelayBufferElm, exercised through DigitalGraphBuilder against a real dice-ts-engine Circuit -
// same manualSource()/probe()/connect()/chipAt() harness as DigitalSynthesisPhase3.test.ts. Unlike
// the old digital/DigitalElm.ts-based tests this replaces, there's no debouncedValueAt() left to
// unit-test directly: the delay/glitch-filter behavior is entirely the dice-ts Chip engine's own
// outputDelayS()/pending-event-cancel-on-revert machinery, so these tests just confirm
// digitalSynthesis() wires that machinery up with the right delay.
import { describe, it, expect, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import type { Chip } from "./chip";
import { DelayBufferElm } from "../DelayBufferElm";
import { CircuitElm } from "../CircuitElm";
import { TIMESCALE } from "./constants";
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

/** A live-pushable digital source - see DigitalSynthesisPhase3.test.ts's identical helper. */
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

describe("DelayBufferElm.digitalSynthesis()", () => {
    it("passes a sustained input change through after exactly `delay` ticks", () => {
        const buf = Object.create(DelayBufferElm.prototype) as any;
        buf.delay = 5 * TIMESCALE;
        buf.threshold = 2.5;
        buf.nodes = [];

        const src = manualSource(0);
        const sink = probe(); // pure leaf cell - needs an external sink to survive dead-code elimination
        connect({ elm: src, num: 0 }, { elm: buf, num: 0 });
        connect({ elm: buf, num: 1 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([src, buf, sink]);
        src.chip = chipsByElm.get(src)![0];
        circuit.run(1);

        const edgeTime = circuit.globalTime;
        src.set(1);
        // runWithDeadline(N) clamps at globalTime+N (unlike run(), which always drains
        // through to the next queued event regardless of the requested budget) - so a
        // 1-tick call here flushes only src's own 0-delay self-event (which notifies
        // buf and schedules ITS real event 5 ticks out), without reaching that event.
        circuit.runWithDeadline(1);
        expect(chipAt(buf, 1, chipsByElm).output).toBe(0); // not yet - delay hasn't elapsed

        circuit.runWithDeadline(3); // total 4 ticks since the edge
        expect(chipAt(buf, 1, chipsByElm).output).toBe(0); // one tick short of the delay

        circuit.runWithDeadline(1); // total 5 ticks since the edge
        expect(chipAt(buf, 1, chipsByElm).output).toBe(1); // delay elapsed, transition committed
        expect(circuit.globalTime - edgeTime).toBe(5);
    });

    it("filters a glitch shorter than `delay` (engine's own event-cancel-on-revert)", () => {
        const buf = Object.create(DelayBufferElm.prototype) as any;
        buf.delay = 10 * TIMESCALE;
        buf.threshold = 2.5;
        buf.nodes = [];

        const src = manualSource(0);
        const sink = probe();
        connect({ elm: src, num: 0 }, { elm: buf, num: 0 });
        connect({ elm: buf, num: 1 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([src, buf, sink]);
        src.chip = chipsByElm.get(src)![0];
        circuit.run(1);

        src.set(1);
        circuit.runWithDeadline(1); // src rises, buf schedules a pending event 10 ticks out
        src.set(0);
        circuit.runWithDeadline(1); // src falls back immediately - cancels the pending event

        circuit.run(100); // run well past the original delay window
        expect(chipAt(buf, 1, chipsByElm).output).toBe(0); // glitch never reached the output
    });
});
