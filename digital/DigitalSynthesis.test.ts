// Phase 2 (see noble-stirring-rabin.md): tests the real digitalSynthesis()/digitalTie()
// implementations added to GateElm/InverterElm/RailElm/LogicInputElm, exercised through
// DigitalGraphBuilder against real dice-ts-engine Circuits - not a truth-table hand-check
// against calcFunction() (calcFunction() reads this.nodes[]/this.inputs, an entirely different
// input path - see GateElm.getInput()), but the actual thing a synthesized cell needs to get
// right: what a real Circuit computes and propagates.
//
// Real CircuitElm construction touches CircuitElm.app deep inside setPoints()/setSize(), not
// available outside the running app - Object.create() bypasses the constructor while still
// exercising each class's real methods, same pattern as ChipGroupLogic.test.ts/
// CircuitWiring.test.ts.
import { describe, it, expect, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import { AndGateElm, OrGateElm, XorGateElm, NandGateElm, NorGateElm, XnorGateElm, GateElm } from "../GateElm";
import { InverterElm } from "../InverterElm";
import { RailElm } from "../RailElm";
import { LogicInputElm } from "../LogicInputElm";
import { ExtVoltageElm } from "../ExtVoltageElm";
import { VoltageElm } from "../VoltageElm";
import { CircuitElm } from "../CircuitElm";

beforeEach(() => {
    // VoltageElm.getVoltage() unconditionally reads CircuitElm.sim.t before branching on
    // waveform (even for WF_DC, whose result doesn't depend on it) - real app always has
    // CircuitElm.sim set by the time digital wiring runs; headless tests need a stand-in.
    CircuitElm.sim = { t: 0, maxTimeStep: 1e-6 } as any;
});

/** A minimal fake constant source: a real digitalTie()-driven element (see
 * DigitalGraphBuilder's DigitalTieSource), for feeding a fixed 0/1 into a real gate under
 * test without needing a second real CircuitElm. */
function tieSource(tie: "VCC" | "GND") {
    return { digitalTie: () => tie, nodes: [] as { links: { num: number; elm: any }[] }[] };
}

/** A no-op terminal sink (CUSTOM_CHIP, one input pin, no output pin): keeps Circuit's dead-code
 * elimination (see circuit.ts's makeAllConnections()) from pruning the gate under test, whose
 * own output would otherwise feed nothing - see DigitalGraphBuilder.test.ts's identical need. */
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

/** Builds a gate/inverter under test with `inputs` fixed 0/1 values wired to its input posts
 * (each via its own tieSource()), plus a probe() on its output so it survives dead-code
 * pruning, then returns the built graph's chip for the gate. */
function buildGate(gate: any, inputs: (0 | 1)[]): ReturnType<typeof buildDigitalCircuit> {
    gate.nodes = [];
    const sources = inputs.map(v => tieSource(v ? "VCC" : "GND"));
    sources.forEach((src, i) => connect({ elm: src, num: 0 }, { elm: gate, num: i }));
    const sink = probe();
    connect({ elm: gate, num: inputs.length }, { elm: sink, num: 0 });
    return buildDigitalCircuit([...sources, gate, sink]);
}

function gateOutput(gate: any, inputs: (0 | 1)[]): number {
    const { chipsByElm } = buildGate(gate, inputs);
    return chipsByElm.get(gate)![0].output;
}

describe("GateElm.digitalSynthesis()", () => {
    it("AND gate: high only when every input is high", () => {
        const g = Object.create(AndGateElm.prototype) as AndGateElm;
        g.inputCount = 2; g.flags = 0; g.propagationDelay = 0;
        expect(gateOutput(g, [1, 1])).toBe(1);
        expect(gateOutput(g, [1, 0])).toBe(0);
        expect(gateOutput(g, [0, 0])).toBe(0);
    });

    it("OR gate: high when any input is high", () => {
        const g = Object.create(OrGateElm.prototype) as OrGateElm;
        g.inputCount = 2; g.flags = 0; g.propagationDelay = 0;
        expect(gateOutput(g, [0, 0])).toBe(0);
        expect(gateOutput(g, [1, 0])).toBe(1);
    });

    it("XOR gate: high when an odd number of inputs are high", () => {
        const g = Object.create(XorGateElm.prototype) as XorGateElm;
        g.inputCount = 3; g.flags = 0; g.propagationDelay = 0;
        expect(gateOutput(g, [1, 1, 0])).toBe(0);
        expect(gateOutput(g, [1, 1, 1])).toBe(1);
        expect(gateOutput(g, [1, 0, 0])).toBe(1);
    });

    it("NAND/NOR/XNOR invert their base family's output", () => {
        const nand = Object.create(NandGateElm.prototype) as NandGateElm;
        nand.inputCount = 2; nand.flags = 0; nand.propagationDelay = 0;
        expect(gateOutput(nand, [1, 1])).toBe(0);
        expect(gateOutput(nand, [1, 0])).toBe(1);

        const nor = Object.create(NorGateElm.prototype) as NorGateElm;
        nor.inputCount = 2; nor.flags = 0; nor.propagationDelay = 0;
        expect(gateOutput(nor, [0, 0])).toBe(1);
        expect(gateOutput(nor, [1, 0])).toBe(0);

        const xnor = Object.create(XnorGateElm.prototype) as XnorGateElm;
        xnor.inputCount = 2; xnor.flags = 0; xnor.propagationDelay = 0;
        expect(gateOutput(xnor, [1, 1])).toBe(1);
        expect(gateOutput(xnor, [1, 0])).toBe(0);
    });

    it("FLAG_INVERT_INPUTS inverts each input before the reduction", () => {
        const g = Object.create(AndGateElm.prototype) as AndGateElm;
        g.inputCount = 2; g.flags = GateElm.FLAG_INVERT_INPUTS; g.propagationDelay = 0;
        // Both real inputs low -> both become high after per-input inversion -> AND -> high.
        expect(gateOutput(g, [0, 0])).toBe(1);
        expect(gateOutput(g, [1, 0])).toBe(0);
    });

    it("propagationDelay becomes the cell's outputDelayS in real seconds", () => {
        const g = Object.create(AndGateElm.prototype) as AndGateElm;
        g.inputCount = 2; g.flags = 0; g.propagationDelay = 1e-6;
        const { desc } = g.digitalSynthesis();
        expect(desc[0].delay).toEqual([1e-6, 1e-6]);
    });
});

describe("InverterElm.digitalSynthesis()", () => {
    it("inverts its single input", () => {
        const inv = Object.create(InverterElm.prototype) as InverterElm;
        (inv as any).inputCount = 1;
        inv.nodes = [];
        const hi = tieSource("VCC");
        connect({ elm: hi, num: 0 }, { elm: inv, num: 0 });
        const sink = probe();
        connect({ elm: inv, num: 1 }, { elm: sink, num: 0 });

        const { chipsByElm } = buildDigitalCircuit([hi, inv, sink]);
        expect(chipsByElm.get(inv)![0].output).toBe(0);
    });
});

describe("RailElm.digitalTie() / digitalSynthesis()", () => {
    function fakeRail(waveform: number, opts: { maxVoltage?: number; bias?: number; frequency?: number; flags?: number } = {}) {
        const r = Object.create(RailElm.prototype) as RailElm;
        (r as any).waveform = waveform;
        (r as any).maxVoltage = opts.maxVoltage ?? 5;
        (r as any).bias = opts.bias ?? 0;
        (r as any).frequency = opts.frequency ?? 1000;
        (r as any).FLAG_CLOCK = 1; // a class field (readonly FLAG_CLOCK = 1), unset via Object.create
        (r as any).flags = opts.flags ?? 1;
        r.nodes = [];
        return r;
    }

    it("a +5V DC rail ties to VCC", () => {
        const r = fakeRail(VoltageElm.WF_DC, { maxVoltage: 5, bias: 0 });
        expect(r.digitalTie()).toBe("VCC");
        expect(r.digitalSynthesis()).toBeNull();
    });

    it("a 0V DC rail ties to GND", () => {
        const r = fakeRail(VoltageElm.WF_DC, { maxVoltage: 0, bias: 0 });
        expect(r.digitalTie()).toBe("GND");
    });

    it("a square-wave clock rail is not a tie, and synthesizes a periodic CUSTOM_CHIP", () => {
        const r = fakeRail(VoltageElm.WF_SQUARE, { frequency: 1_000_000 }); // 1 MHz
        expect(r.digitalTie()).toBeNull();

        const sink = probe();
        connect({ elm: r, num: 0 }, { elm: sink, num: 0 });
        const { circuit, chipsByElm } = buildDigitalCircuit([r, sink]);

        const clockChip = chipsByElm.get(r)![0];
        // `history` only records for a historyWatched chip now (see chip.ts's `output` setter) -
        // mark it directly, standing in for a Scope having attached (see ScopePlot.setDigitalChip()).
        clockChip.historyWatched = true;
        // Requested half-period (500ns) is below TIMESCALE's default 1us tick, so
        // digitalSynthesis()'s Math.max(1, ...) floor kicks in: 1 tick each phase, a 2-tick
        // period - checking history (not just a before/after output compare) avoids a flaky
        // even-vs-odd-tick-count parity coincidence.
        circuit.run(20n);
        expect(clockChip.history.length).toBeGreaterThanOrEqual(10); // ~20 ticks / 2-tick period
    });

    it("a non-square, non-DC rail is neither a tie nor synthesizable", () => {
        const r = fakeRail(VoltageElm.WF_AC);
        expect(r.digitalTie()).toBeNull();
        expect(r.digitalSynthesis()).toBeNull();
    });
});

describe("LogicInputElm.digitalSynthesis() / toggle()", () => {
    function fakeLogicInput(initialPosition: number) {
        const li = Object.create(LogicInputElm.prototype) as LogicInputElm;
        (li as any).position = initialPosition;
        (li as any).posCount = 2;
        (li as any).flags = 0;
        (li as any).momentary = false;
        (li as any).label = null; // SwitchElm.toggle() checks this - a class field, unset via Object.create
        li.nodes = [];
        li.digitalChip = null;
        return li;
    }

    it("a high LogicInputElm drives its output high", () => {
        const li = fakeLogicInput(1);
        const sink = probe();
        connect({ elm: li, num: 0 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([li, sink]);
        circuit.run(1n); // apply the 0-delay initial-value event scheduled at construction

        expect(chipsByElm.get(li)![0].output).toBe(1);
    });

    it("toggle() pushes a live change into its own already-built chip", () => {
        const li = fakeLogicInput(0);
        const sink = probe();
        connect({ elm: li, num: 0 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([li, sink]);
        li.digitalChip = chipsByElm.get(li)![0];
        circuit.run(1n);
        expect(li.digitalChip.output).toBe(0);

        li.toggle(); // real SwitchElm.toggle() flips position 0 -> 1
        circuit.run(1n);
        expect(li.digitalChip.output).toBe(1);

        li.toggle(); // and back
        circuit.run(1n);
        expect(li.digitalChip.output).toBe(0);
    });

    it("ternary mode is not a digital source", () => {
        const li = fakeLogicInput(1);
        (li as any).flags = LogicInputElm.FLAG_TERNARY;
        expect(li.digitalSynthesis()).toBeNull();
    });
});

describe("ExtVoltageElm.digitalSynthesis() / setVoltage()", () => {
    function fakeExtVoltage(initialVoltage: number) {
        const ev = Object.create(ExtVoltageElm.prototype) as ExtVoltageElm;
        (ev as any).name = "extvolt";
        ev.voltage = initialVoltage;
        ev.nodes = [];
        ev.digitalChip = null;
        return ev;
    }

    it("never ties to VCC/GND (always needs its own live-pushable chip)", () => {
        const ev = fakeExtVoltage(5);
        expect(ev.digitalTie()).toBeNull();
    });

    it("a nonzero initial voltage drives its output high", () => {
        const ev = fakeExtVoltage(1);
        const sink = probe();
        connect({ elm: ev, num: 0 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([ev, sink]);
        circuit.run(1n); // apply the 0-delay initial-value event scheduled at construction

        expect(chipsByElm.get(ev)![0].output).toBe(1);
    });

    it("setVoltage() pushes a live change into its own already-built chip - this is the bug " +
        "JSInterface.setExtVoltage() used to hit: without a digitalChip handle, setVoltage() had " +
        "nothing to notify and the change never reached the digital graph", () => {
        const ev = fakeExtVoltage(0);
        const sink = probe();
        connect({ elm: ev, num: 0 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([ev, sink]);
        ev.digitalChip = chipsByElm.get(ev)![0];
        circuit.run(1n);
        expect(ev.digitalChip.output).toBe(0);

        ev.setVoltage(true as any); // JSInterface.setExtVoltage("extvolt", true)
        circuit.run(1n);
        expect(ev.digitalChip.output).toBe(1);

        ev.setVoltage(false as any); // JSInterface.setExtVoltage("extvolt", false)
        circuit.run(1n);
        expect(ev.digitalChip.output).toBe(0);
    });
});
