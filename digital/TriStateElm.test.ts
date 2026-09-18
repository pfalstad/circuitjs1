// Covers TriStateElm.digitalSynthesis()/isTriStateOutput() and the OR-merge glue
// (DigitalGraphBuilder.ts's resolveNodeDrivers()) that lets several tri-state outputs safely
// share one node without a third (high-impedance) state - see DigitalTriStateDriver's own
// docstring. Same Object.create()-based construction and manualSource()/connect() helpers as
// DigitalSynthesisPhase3.test.ts (see its header comment for why).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { customChipStart } from "./chip_desc";
import { buildDigitalCircuit, syncDigitalToNodesNew } from "./DigitalGraphBuilder";
import type { Chip } from "./chip";
import { TriStateElm } from "../TriStateElm";
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

function makeTriState(busWidth = 1): any {
    const ts = Object.create(TriStateElm.prototype) as any;
    ts.busWidth = busWidth;
    ts.nodes = [];
    return ts;
}

describe("TriStateElm.digitalSynthesis()", () => {
    it("drives output = data & control (a disabled driver reads 0)", () => {
        const ts = makeTriState();
        const data = manualSource(1);
        const control = manualSource(0); // tri-stated
        const sink = probe();
        connect({ elm: data, num: 0 }, { elm: ts, num: 0 });
        connect({ elm: control, num: 0 }, { elm: ts, num: ts.controlNode() });
        connect({ elm: ts, num: 1 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([data, control, ts, sink]);
        data.chip = chipsByElm.get(data)![0];
        control.chip = chipsByElm.get(control)![0];
        circuit.run(20);
        expect(chipsByElm.get(ts)![0].output).toBe(0);

        control.set(1);
        circuit.run(20);
        expect(chipsByElm.get(ts)![0].output).toBe(1);
    });
});

describe("tri-state bus sharing (DigitalGraphBuilder OR-merge)", () => {
    it("resolves to whichever driver is enabled, without a wiring-conflict warning", () => {
        const warn = vi.spyOn(console, "log").mockImplementation(() => {});
        const dataA = manualSource(1);
        const controlA = manualSource(1); // enabled, driving 1
        const driverA = makeTriState();
        const dataB = manualSource(0);
        const controlB = manualSource(0); // disabled
        const driverB = makeTriState();
        const sink = probe();

        connect({ elm: dataA, num: 0 }, { elm: driverA, num: 0 });
        connect({ elm: controlA, num: 0 }, { elm: driverA, num: driverA.controlNode() });
        connect({ elm: dataB, num: 0 }, { elm: driverB, num: 0 });
        connect({ elm: controlB, num: 0 }, { elm: driverB, num: driverB.controlNode() });
        connect({ elm: driverA, num: 1 }, { elm: driverB, num: 1 }, { elm: sink, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit(
            [dataA, controlA, driverA, dataB, controlB, driverB, sink]);
        dataA.chip = chipsByElm.get(dataA)![0];
        controlA.chip = chipsByElm.get(controlA)![0];
        dataB.chip = chipsByElm.get(dataB)![0];
        controlB.chip = chipsByElm.get(controlB)![0];
        circuit.run(20);

        expect(warn).not.toHaveBeenCalled();
        const sinkChip = chipsByElm.get(sink)![0];
        expect(sinkChip.inputLinks[0].chip.output).toBe(1); // driverA wins while enabled

        // flip which driver is enabled: bus should follow driverB now.
        controlA.set(0);
        controlB.set(1);
        dataB.set(1);
        circuit.run(20);
        expect(sinkChip.inputLinks[0].chip.output).toBe(1);

        dataB.set(0);
        circuit.run(20);
        expect(sinkChip.inputLinks[0].chip.output).toBe(0); // nothing enabled -> reads 0, not floating

        warn.mockRestore();
    });

    // Regression for the real bug report: syncDigitalToNodesNew() used to resolve each driver's
    // OWN chip and write nodes[postIndex].v with it, so on a shared bus whichever element sorts
    // LAST in elmList silently won regardless of which one was actually enabled - a disabled
    // driver processed after the enabled one would stomp the correct value back down to 0. Put
    // the disabled driver LAST here (the opposite of enable order) so the old bug would have
    // shown up as "output low regardless of the enabled driver's data".
    it("syncDigitalToNodesNew writes the resolved bus value, not whichever driver runs last", () => {
        const dataA = manualSource(1);
        const controlA = manualSource(1); // enabled, driving 1
        const driverA = makeTriState();
        driverA.highVoltage = 5;
        const dataB = manualSource(0);
        const controlB = manualSource(0); // disabled - processed AFTER driverA below
        const driverB = makeTriState();
        driverB.highVoltage = 5;

        connect({ elm: dataA, num: 0 }, { elm: driverA, num: 0 });
        connect({ elm: controlA, num: 0 }, { elm: driverA, num: driverA.controlNode() });
        connect({ elm: dataB, num: 0 }, { elm: driverB, num: 0 });
        connect({ elm: controlB, num: 0 }, { elm: driverB, num: driverB.controlNode() });
        connect({ elm: driverA, num: 1 }, { elm: driverB, num: 1 });

        const elmList = [dataA, controlA, driverA, dataB, controlB, driverB];
        const graph = buildDigitalCircuit(elmList);
        dataA.chip = graph.chipsByElm.get(dataA)![0];
        controlA.chip = graph.chipsByElm.get(controlA)![0];
        dataB.chip = graph.chipsByElm.get(dataB)![0];
        controlB.chip = graph.chipsByElm.get(controlB)![0];
        graph.circuit.run(20);

        syncDigitalToNodesNew(elmList, graph);
        expect(driverA.nodes[1].v).toBe(5); // driverA (enabled, data=1) should win the bus
        expect(driverB.nodes[1].v).toBe(5); // same shared node - driverB must report the same value
    });
});
