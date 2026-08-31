// Phase 3 (see noble-stirring-rabin.md): tests the real digitalSynthesis() implementations added
// to DFlipFlopElm/JKFlipFlopElm/CounterElm/MultiplexerElm/SevenSegDecoderElm, exercised through
// DigitalGraphBuilder against real dice-ts-engine Circuits - same approach as
// DigitalSynthesis.test.ts's Phase 2 gate/rail/logic-input coverage, extended with a
// manualSource() helper (a live-pushable CUSTOM_CHIP, mirroring LogicInputElm's own
// pushDigitalValue() pattern) for driving clock/select edges at runtime, and a chipAt() helper
// for reading a specific real post's synthesized Chip out of chipsByElm (which is keyed per
// element, not per post).
//
// Real CircuitElm construction touches CircuitElm.app deep inside setPoints()/setSize(), not
// available outside the running app - Object.create() bypasses the constructor while still
// exercising each class's real methods, same pattern as DigitalSynthesis.test.ts.
import { describe, it, expect, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import type { Chip } from "./chip";
import { DFlipFlopElm } from "../DFlipFlopElm";
import { JKFlipFlopElm } from "../JKFlipFlopElm";
import { CounterElm } from "../CounterElm";
import { MultiplexerElm } from "../MultiplexerElm";
import { SevenSegDecoderElm } from "../SevenSegDecoderElm";
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

/** A live-pushable digital source, for driving a clock/select input at runtime - see
 * LogicInputElm.pushDigitalValue()'s identical "only schedule a 0-delay self-event when the
 * desired value actually differs" pattern. `chip` is filled in after buildDigitalCircuit() (see
 * each test below), same as LogicInputElm.digitalChip. */
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

/** Looks up the real Chip backing `elm`'s post `post`, out of chipsByElm's per-element Chip[]
 * (positionally indexed to match elm.digitalSynthesis().desc, which createChip() preserves - see
 * DigitalGraphBuilder.buildDigitalCircuit()). Calling digitalSynthesis() again here is safe (it's
 * a pure function of the element's current fields) as long as nothing mutates those fields
 * between the build and this lookup, true for every test below. */
function chipAt(elm: any, post: number, chipsByElm: Map<any, Chip[]>): Chip {
    const { pinMap, desc } = elm.digitalSynthesis();
    const pin = pinMap.get(post)!;
    const idx = desc.findIndex((d: any) => d.outPin === pin);
    return chipsByElm.get(elm)![idx];
}

describe("DFlipFlopElm.digitalSynthesis()", () => {
    it("captures D on the rising clock edge, holds otherwise", () => {
        const chip = Object.create(DFlipFlopElm.prototype) as any;
        chip.flags = 0;
        chip.propagationDelay = 0;
        chip.nodes = [];

        const d = tieSource("VCC");
        const clk = manualSource(0);
        const qSink = probe();
        const notQSink = probe(); // notQ is a pure leaf cell - needs an external sink to survive dead-code elimination
        connect({ elm: d, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: clk, num: 0 }, { elm: chip, num: 3 });
        connect({ elm: chip, num: 1 }, { elm: qSink, num: 0 });
        connect({ elm: chip, num: 2 }, { elm: notQSink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([d, clk, chip, qSink, notQSink]);
        clk.chip = chipsByElm.get(clk)![0];
        circuit.run(1n);

        expect(chipAt(chip, 1, chipsByElm).output).toBe(0); // no edge yet
        clk.set(1);
        circuit.run(1n);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(1); // captured D=1
        expect(chipAt(chip, 2, chipsByElm).output).toBe(0); // /Q

        clk.set(0);
        circuit.run(1n);
        clk.set(1); // a second rising edge with D still high changes nothing observable
        circuit.run(1n);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(1);
    });

    it("set/reset force Q and /Q independently", () => {
        const chip = Object.create(DFlipFlopElm.prototype) as any;
        chip.flags = DFlipFlopElm.FLAG_RESET | DFlipFlopElm.FLAG_SET;
        chip.propagationDelay = 0;
        chip.nodes = [];

        const d = tieSource("GND");
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
        clk.chip = chipsByElm.get(clk)![0];
        r.chip = chipsByElm.get(r)![0];
        s.chip = chipsByElm.get(s)![0];
        circuit.run(1n);

        s.set(1);
        circuit.run(1n);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(1); // Q
        expect(chipAt(chip, 2, chipsByElm).output).toBe(0); // /Q

        s.set(0);
        r.set(1);
        circuit.run(1n);
        expect(chipAt(chip, 1, chipsByElm).output).toBe(0);
        expect(chipAt(chip, 2, chipsByElm).output).toBe(1);
    });
});

describe("JKFlipFlopElm.digitalSynthesis()", () => {
    it("J=1,K=0 sets; J=0,K=1 resets; J=K=1 toggles; J=K=0 holds", () => {
        const chip = Object.create(JKFlipFlopElm.prototype) as any;
        chip.flags = JKFlipFlopElm.FLAG_POSITIVE_EDGE;
        chip.propagationDelay = 0;
        chip.nodes = [];

        const j = manualSource(1);
        const clk = manualSource(0);
        const k = manualSource(0);
        const notQSink = probe(); // notQ is a pure leaf cell - needs an external sink to survive dead-code elimination
        connect({ elm: j, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: clk, num: 0 }, { elm: chip, num: 1 });
        connect({ elm: k, num: 0 }, { elm: chip, num: 2 });
        connect({ elm: chip, num: 4 }, { elm: notQSink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([j, clk, k, chip, notQSink]);
        j.chip = chipsByElm.get(j)![0];
        clk.chip = chipsByElm.get(clk)![0];
        k.chip = chipsByElm.get(k)![0];
        circuit.run(1n);

        // clk.set() must run alone, after J/K have already settled - setting J/K and clk in the
        // same circuit.run() would race two independently-scheduled 0-delay events through the
        // queue in unspecified order, risking the clock edge sampling J/K before their own
        // just-queued change has actually propagated.
        const pulse = () => { clk.set(1); circuit.run(1n); clk.set(0); circuit.run(1n); };

        pulse();
        expect(chipAt(chip, 3, chipsByElm).output).toBe(1); // set

        j.set(0); k.set(0); circuit.run(1n);
        pulse();
        expect(chipAt(chip, 3, chipsByElm).output).toBe(1); // hold

        j.set(1); k.set(1); circuit.run(1n);
        pulse();
        expect(chipAt(chip, 3, chipsByElm).output).toBe(0); // toggle from 1
        pulse();
        expect(chipAt(chip, 3, chipsByElm).output).toBe(1); // toggle again

        j.set(0); k.set(1); circuit.run(1n);
        pulse();
        expect(chipAt(chip, 3, chipsByElm).output).toBe(0); // reset
        expect(chipAt(chip, 4, chipsByElm).output).toBe(1); // /Q
    });
});

describe("CounterElm.digitalSynthesis()", () => {
    it("increments on the configured edge and wraps at the bit width", () => {
        const chip = Object.create(CounterElm.prototype) as any;
        chip.bits = 3;
        chip.modulus = 0;
        chip.invertreset = false;
        chip.flags = 0;
        chip.propagationDelay = 0;
        chip.nodes = [];

        const clk = manualSource(0);
        const reset = tieSource("GND");
        connect({ elm: clk, num: 0 }, { elm: chip, num: 0 });
        connect({ elm: reset, num: 0 }, { elm: chip, num: 1 });

        const { circuit, chipsByElm } = buildDigitalCircuit([clk, reset, chip]);
        clk.chip = chipsByElm.get(clk)![0];
        circuit.run(1n);

        const readValue = () => {
            let v = 0;
            for (let k = 0; k < 3; k++) v |= chipAt(chip, 2 + k, chipsByElm).output << (2 - k);
            return v;
        };
        const tick = () => {
            clk.set(1);
            circuit.run(1n);
            const v = readValue();
            clk.set(0);
            circuit.run(1n);
            return v;
        };

        expect(tick()).toBe(1);
        expect(tick()).toBe(2);
        expect(tick()).toBe(3);
        for (let i = 0; i < 4; i++) tick(); // 4,5,6,7
        expect(tick()).toBe(0); // wraps at 2^3
    });

    it("respects modulus, the up/down pin, and reset", () => {
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
        circuit.run(1n);

        const readValue = () => {
            let v = 0;
            for (let k = 0; k < 4; k++) v |= chipAt(chip, 2 + k, chipsByElm).output << (3 - k);
            return v;
        };
        const tick = () => {
            clk.set(1);
            circuit.run(1n);
            const v = readValue();
            clk.set(0);
            circuit.run(1n);
            return v;
        };

        expect(tick()).toBe(4); // starts at 0, counting down with modulus 5 -> wraps to 4
        expect(tick()).toBe(3);

        reset.set(1);
        circuit.run(1n);
        expect(readValue()).toBe(0);
    });
});

describe("MultiplexerElm.digitalSynthesis()", () => {
    it("selects the data channel addressed by the select pins", () => {
        const chip = Object.create(MultiplexerElm.prototype) as any;
        chip.selectBitCount = 2;
        chip.outputCount = 4;
        chip.inputMode = MultiplexerElm.INPUT_MODE_INDIVIDUAL;
        chip.dataBusWidth = 4;
        chip.flags = 0;
        chip.strobe = -1;
        chip.selectPin = 4;
        chip.outputPin = 6;
        chip.nodes = [];

        const data = [0, 1, 0, 1] as const;
        const sources = data.map(v => tieSource(v ? "VCC" : "GND"));
        sources.forEach((src, i) => connect({ elm: src, num: 0 }, { elm: chip, num: i }));

        const sel0 = manualSource(0), sel1 = manualSource(0);
        const outSink = probe(); // output is a pure leaf cell - needs an external sink to survive dead-code elimination
        connect({ elm: sel0, num: 0 }, { elm: chip, num: 4 });
        connect({ elm: sel1, num: 0 }, { elm: chip, num: 5 });
        connect({ elm: chip, num: 6 }, { elm: outSink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([...sources, sel0, sel1, chip, outSink]);
        sel0.chip = chipsByElm.get(sel0)![0];
        sel1.chip = chipsByElm.get(sel1)![0];
        circuit.run(1n);

        expect(chipAt(chip, 6, chipsByElm).output).toBe(0); // channel 0

        sel0.set(1);
        circuit.run(1n);
        expect(chipAt(chip, 6, chipsByElm).output).toBe(1); // channel 1

        sel0.set(0); sel1.set(1);
        circuit.run(1n);
        expect(chipAt(chip, 6, chipsByElm).output).toBe(0); // channel 2

        sel0.set(1);
        circuit.run(1n);
        expect(chipAt(chip, 6, chipsByElm).output).toBe(1); // channel 3
    });
});

describe("SevenSegDecoderElm.digitalSynthesis()", () => {
    it("decodes BCD input 3 to the '3' segment pattern", () => {
        const chip = Object.create(SevenSegDecoderElm.prototype) as any;
        chip.segmentType = 0; // 7-seg
        chip.flags = 0; // no blank pin
        chip.nodes = [];

        // BCD 3 = 0011 -> I3=0,I2=0,I1=1,I0=1 (posts segCount+0..3)
        const bits = [0, 0, 1, 1] as const;
        const sources = bits.map(v => tieSource(v ? "VCC" : "GND"));
        sources.forEach((src, i) => connect({ elm: src, num: 0 }, { elm: chip, num: 7 + i }));

        // Each segment output is a pure leaf cell - needs an external sink to survive dead-code
        // elimination (see DigitalGraphBuilder's makeAllConnections()).
        const segSinks = Array.from({ length: 7 }, () => probe());
        segSinks.forEach((sink, seg) => connect({ elm: chip, num: seg }, { elm: sink, num: 0 }));

        const { chipsByElm } = buildDigitalCircuit([...sources, chip, ...segSinks]);

        // "3": [true,true,true,true,false,false,true] (a,b,c,d,e,f,g)
        const expected = [1, 1, 1, 1, 0, 0, 1];
        for (let seg = 0; seg < 7; seg++)
            expect(chipAt(chip, seg, chipsByElm).output).toBe(expected[seg]);
    });
});
