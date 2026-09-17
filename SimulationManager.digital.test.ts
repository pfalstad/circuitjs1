// Phase 5 (see noble-stirring-rabin.md) smoke test: SimulationManager.initDigitalCircuit()/
// runCircuit() driving the real dice-ts engine end-to-end (buildDigitalCircuit() ->
// Circuit.runWithDeadline() -> syncDigitalToNodesNew()) - not exhaustive per-element coverage
// (DigitalSynthesisPhase3.test.ts and friends already own that), just confirming the pipeline
// wired up in this phase actually moves a real value from a live-pushed source through a delayed
// cell and back out into a real CircuitNode's voltage.
//
// SimulationManager can't be constructed via `new` outside the running app (its constructor
// wants a real CirSim), so - same Object.create() pattern DigitalSynthesis.test.ts/
// ChipGroupLogic.test.ts use for CircuitElm - this builds a bare instance and sets only the
// fields initDigitalCircuit()/runCircuit() actually touch.
import { describe, it, expect } from "vitest";
import { SimulationManager } from "./SimulationManager";
import { chipStart, customChipStart } from "./digital/chip_desc";
import type { ChipDesc } from "./digital/chip_desc";
import type { Chip } from "./digital/chip";

function fakeApp() {
    return {
        getIterCount: () => 1,
        minFrameRate: 30,
        onTimeStep: () => { },
    };
}

// A live-pushable source - same shape as LogicInputElm's own digitalChip/pushDigitalValue
// mechanism (see LogicInputElm.ts), minus the real CircuitElm scaffolding.
function manualSource() {
    return {
        digitalChip: null as Chip | null,
        digitalSynthesis: () => ({
            desc: [customChipStart(() => { }).outputPin(1)] as ChipDesc[],
            pinMap: new Map([[0, 1]]),
        }),
        nodes: [] as { v: number; links: { num: number; elm: any }[] }[],
    };
}

// A 2-tick-delay buffer: pin1 in, pin2 out = in. Post 0 = input, post 1 = output.
function bufElm(highVoltage: number, delayTicks: number, maxTimeStep: number) {
    return {
        highVoltage,
        digitalSynthesis: () => ({
            desc: [chipStart((pin) => { pin[2] = pin[1]; }).inputPins(1).outputPin(2)
                .outputDelayS(delayTicks * maxTimeStep, delayTicks * maxTimeStep)] as ChipDesc[],
            pinMap: new Map([[0, 1], [1, 2]]),
        }),
        nodes: [] as { v: number; links: { num: number; elm: any }[] }[],
    };
}

// A no-op terminal sink (CUSTOM_CHIP, one input pin, no output) - keeps Circuit's dead-code
// elimination (circuit.ts's makeAllConnections()) from pruning buf's output chip, whose own
// output would otherwise feed nothing - see DigitalGraphBuilder.test.ts's identical need.
function sinkElm() {
    return {
        digitalSynthesis: () => ({
            desc: [customChipStart(() => { }).inputPins(1)] as ChipDesc[],
            pinMap: new Map([[0, 1]]),
        }),
        nodes: [] as { links: { num: number; elm: any }[] }[],
    };
}

function connect(...posts: { elm: any; num: number }[]): void {
    const node = { links: posts.map(p => ({ num: p.num, elm: p.elm })) };
    for (const p of posts) p.elm.nodes[p.num] = node;
}

function bareSim(elmArr: any[], maxTimeStep: number): SimulationManager {
    const sm = Object.create(SimulationManager.prototype) as SimulationManager;
    (sm as any).app = fakeApp();
    sm.elmArr = elmArr;
    sm.elmList = elmArr;
    sm.maxTimeStep = maxTimeStep;
    sm.t = 0;
    sm.timeStepAccum = 0;
    sm.timeStepCount = 0;
    sm.lastIterTime = 0;
    return sm;
}

describe("SimulationManager digital fast path (Phase 5 integration)", () => {
    it("initDigitalCircuit() builds a graph and settles initial (0) state into node voltages", () => {
        const maxTimeStep = 1e-6;
        const src = manualSource();
        const buf = bufElm(5, 2, maxTimeStep);
        const sink = sinkElm();
        connect({ elm: src, num: 0 }, { elm: buf, num: 0 });
        connect({ elm: buf, num: 1 }, { elm: sink, num: 0 });
        buf.nodes[1] = { v: -1, links: buf.nodes[1].links };

        const sm = bareSim([src, buf, sink], maxTimeStep);
        sm.initDigitalCircuit();

        expect(sm.digitalReady).toBe(true);
        expect(sm.digitalGraph).not.toBeNull();
        // LogicInputElm-style digitalChip handle got populated by initDigitalCircuit() itself.
        expect(src.digitalChip).toBe(sm.digitalGraph!.chipsByElm.get(src)![0]);
        expect(src.digitalChip!.output).toBe(0);
    });

    it("runCircuit() advances the Circuit and syncs a propagated transition back into nodes[].v", () => {
        const maxTimeStep = 1e-6;
        const src = manualSource();
        const buf = bufElm(5, 2, maxTimeStep); // 2-tick propagation delay
        const sink = sinkElm();
        connect({ elm: src, num: 0 }, { elm: buf, num: 0 });
        connect({ elm: buf, num: 1 }, { elm: sink, num: 0 });
        buf.nodes[1] = { v: -1, links: buf.nodes[1].links };

        const sm = bareSim([src, buf, sink], maxTimeStep);
        sm.initDigitalCircuit();

        // Live-push src high, same mechanism LogicInputElm.pushDigitalValue() uses.
        const srcChip = src.digitalChip!;
        srcChip.pendingEvent = srcChip.circuit.queuePush(srcChip, 0);

        // runCircuit() gates on wall-clock elapsed time since lastIterTime; back-date it so the
        // very next call actually runs instead of just priming the clock (see runCircuit()'s own
        // `if (lit === 0) { this.lastIterTime = tm; return; }` early-out).
        sm.lastIterTime = Date.now() - 1000;
        sm.runCircuit(true);

        // src's push (0-tick delay) plus buf's 2-tick propagation delay = 3 ticks total - well
        // within even a slow single frame's worth of ticks, so one runCircuit() call should have
        // carried it all the way through.
        expect(srcChip.output).toBe(1);
        expect(buf.nodes[1].v).toBe(5); // out = in = 1 -> highVoltage
        expect(sm.timeStepCount).toBeGreaterThan(0);
        expect(sm.t).toBeGreaterThan(0);
    });
});
