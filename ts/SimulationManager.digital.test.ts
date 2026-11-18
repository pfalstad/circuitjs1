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
import { connect } from "./digital/testWiring";
import { sourceCell, pushSourceValue } from "./digital/nativeKinds";

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

    // Any edit rebuilds the digital graph from scratch (see initDigitalCircuit()); the state of the
    // old graph has to carry over (DigitalStateSnapshot) rather than cold-start.
    describe("rebuild carries state over", () => {
        const maxTimeStep = 1e-6;
        const source = (high: () => boolean) => ({
            digitalChip: null as Chip | null,
            digitalSynthesis: () => ({ desc: [sourceCell(high).outputPin(1)] as ChipDesc[], pinMap: new Map([[0, 1]]) }),
            nodes: [] as any[],
        });
        // posts 0..n-1 in, n out
        const gate = (n: number, f: (ins: number[]) => number) => ({
            highVoltage: 5,
            digitalSynthesis: () => {
                const ins = Array.from({ length: n }, (_, i) => i + 1);
                return {
                    desc: [chipStart((pin) => { pin[n + 1] = f(ins.map(i => pin[i])); }).inputPins(...ins).outputPin(n + 1)
                        .outputDelayS(2 * maxTimeStep, 2 * maxTimeStep)] as ChipDesc[],
                    pinMap: new Map(Array.from({ length: n + 1 }, (_, i) => [i, i + 1] as [number, number])),
                };
            },
            nodes: [] as any[],
        });
        const nor = () => gate(2, ([a, b]) => (a | b) ^ 1);

        // q = NOR(r, qb), qb = NOR(0, q): a cold start settles q=1, a pulse on r latches q=0.
        // inv inverts a source that is high: a cold start begins it at 0 and corrects it with a
        // zero-delay event, which inv's cold copy reacts to - an event that must not survive
        // into the carried state.
        function build() {
            const r = source(() => false), hi = source(() => true);
            const q = nor(), qb = nor(), inv = gate(1, ([a]) => a ^ 1);
            const sinks = [sinkElm(), sinkElm()];
            connect({ elm: r, num: 0 }, { elm: q, num: 0 });
            connect({ elm: qb, num: 2 }, { elm: q, num: 1 });
            connect({ elm: q, num: 2 }, { elm: qb, num: 1 }, { elm: sinks[0], num: 0 });
            connect({ elm: hi, num: 0 }, { elm: inv, num: 0 });
            connect({ elm: inv, num: 1 }, { elm: sinks[1], num: 0 });
            const sm = bareSim([r, hi, q, qb, inv, ...sinks], maxTimeStep);
            const out = (elm: any) => sm.digitalGraph!.chipsByElm.get(elm)![0].currentValue();
            const run = (ticks: number) => { sm.digitalGraph!.circuit.runWithDeadline(ticks); sm.timeStepCount += ticks; };
            return { sm, r, q, inv, out, run };
        }

        it("a latch keeps its state and no startup event flips a carried value", () => {
            const { sm, r, q, inv, out, run } = build();
            sm.initDigitalCircuit();
            run(20);
            expect(out(q)).toBe(1);
            pushSourceValue(r.digitalChip!, true);
            run(20);
            pushSourceValue(r.digitalChip!, false);
            run(20);
            expect(out(q)).toBe(0);
            expect(out(inv)).toBe(0);

            sm.initDigitalCircuit(); // rebuild, as for an edit
            expect(out(q)).toBe(0);
            run(20);
            expect(out(q)).toBe(0);
            expect(out(inv)).toBe(0);
        });

        it("a Reset still starts cold", () => {
            const { sm, r, q, out, run } = build();
            sm.initDigitalCircuit();
            pushSourceValue(r.digitalChip!, true);
            run(20);
            pushSourceValue(r.digitalChip!, false);
            run(20);
            expect(out(q)).toBe(0);

            sm.resetTime();
            sm.initDigitalCircuit();
            run(20);
            expect(out(q)).toBe(1);
        });
    });
});
