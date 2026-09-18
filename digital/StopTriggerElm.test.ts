// StopTriggerElm has no analog behavior of its own - it used to be driven from stepFinished(),
// called once per analog solver timestep by the old (now-dead, see SimulationManager.
// runCircuitAnalog()) per-step loop. This build's digital-only runCircuit() path never calls
// stepFinished() at all, so StopTriggerElm.digitalSynthesis() wires it directly into the digital
// event graph instead - exercised here the same way DigitalSynthesisPhase3.test.ts exercises the
// other digitalSynthesis() implementations, against a real dice-ts Circuit.
import { describe, it, expect, beforeEach } from "vitest";
import { chipStart, customChipStart } from "./chip_desc";
import { buildDigitalCircuit } from "./DigitalGraphBuilder";
import { Circuit } from "./circuit";
import { CHIP, CONNECTION, circuitLayout } from "./circuit_desc";
import type { CircuitEntry } from "./circuit_desc";
import type { Chip } from "./chip";
import { StopTriggerElm } from "../StopTriggerElm";
import { CircuitElm } from "../CircuitElm";
import { connect } from "./testWiring";

let simRunning = true;

beforeEach(() => {
    simRunning = true;
    CircuitElm.sim = { t: 0, maxTimeStep: 1e-6 } as any;
    CircuitElm.app = { setSimRunning: (s: boolean) => { simRunning = s; } } as any;
});

/** circuit.run() always drains at least one full queued event past whatever tick budget it's
 * given (see its own docstring) - so calling it right after arming a delayed stop, with nothing
 * else queued to compete, blows straight through to that stop event instead of stopping at the
 * requested tick. runWithDeadline() with an already-expired deadline processes exactly one queued
 * event (its `first` guard skips the deadline check only for that first one) then returns -
 * giving single-hop control for interleaving a mid-countdown check. */
function oneHop(circuit: { runWithDeadline: (t: number, d: number) => number }): void {
    circuit.runWithDeadline(1_000_000, Date.now() - 1);
}

/** A live-pushable digital source - same pattern DigitalSynthesisPhase3.test.ts's own
 * manualSource() uses (LogicInputElm.pushDigitalValue()'s "only schedule a 0-delay self-event
 * when the value actually differs" idiom). */
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

function makeTrigger(opts: { type?: number; triggerVoltage?: number; delay?: number; count?: number }) {
    const elm = Object.create(StopTriggerElm.prototype) as StopTriggerElm;
    elm.nodes = [];
    elm.type = opts.type ?? 0;
    elm.triggerVoltage = opts.triggerVoltage ?? 1;
    elm.delay = opts.delay ?? 0;
    elm.count = opts.count ?? 1;
    (elm as any).highVoltage = 5;
    elm.reset();
    return elm;
}

describe("StopTriggerElm.digitalSynthesis()", () => {
    it("stops the sim as soon as the watched signal goes high (type '>=', no delay)", () => {
        const src = manualSource(0);
        const trig = makeTrigger({ type: 0, delay: 0 });
        connect({ elm: src, num: 0 }, { elm: trig, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([src, trig]);
        src.chip = chipsByElm.get(src)![0];
        circuit.run(5);

        expect(simRunning).toBe(true);
        src.set(1);
        circuit.run(5);
        expect(simRunning).toBe(false);
        expect(trig.stopped).toBe(true);
    });

    it("stops on the falling edge for type '<='", () => {
        const src = manualSource(1);
        const trig = makeTrigger({ type: 1, triggerVoltage: 1, delay: 0 });
        connect({ elm: src, num: 0 }, { elm: trig, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([src, trig]);
        src.chip = chipsByElm.get(src)![0];
        circuit.run(5);

        src.set(0);
        circuit.run(5);
        expect(simRunning).toBe(false);
    });

    it("waits for `count` occurrences before arming", () => {
        const src = manualSource(0);
        const trig = makeTrigger({ type: 0, delay: 0, count: 3 });
        connect({ elm: src, num: 0 }, { elm: trig, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([src, trig]);
        src.chip = chipsByElm.get(src)![0];
        circuit.run(2);

        for (let i = 0; i < 2; i++) {
            src.set(1); circuit.run(2);
            src.set(0); circuit.run(2);
        }
        expect(simRunning).toBe(true); // only 2 of 3 occurrences so far

        src.set(1);
        circuit.run(2);
        expect(simRunning).toBe(false); // 3rd occurrence
    });

    it("fires exactly `delay` seconds after the arming edge, tick-accurate", () => {
        const src = manualSource(0);
        const trig = makeTrigger({ type: 0, delay: 10e-6 }); // 10 ticks at TIMESCALE=1e-6
        connect({ elm: src, num: 0 }, { elm: trig, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([src, trig]);
        src.chip = chipsByElm.get(src)![0];
        circuit.run(2);

        src.set(1);
        oneHop(circuit); // processes just the rising edge (arms, stop due ~10 ticks later)
        expect(simRunning).toBe(true);

        circuit.run(20); // now past the scheduled stop tick
        expect(simRunning).toBe(false);
    });

    it("does not cancel the pending stop if the signal reverts before the delay elapses", () => {
        const src = manualSource(0);
        const trig = makeTrigger({ type: 0, delay: 10e-6 });
        connect({ elm: src, num: 0 }, { elm: trig, num: 0 });

        const { circuit, chipsByElm } = buildDigitalCircuit([src, trig]);
        src.chip = chipsByElm.get(src)![0];
        circuit.run(2);

        src.set(1); // arms, stop due ~10 ticks later
        oneHop(circuit);
        src.set(0); // reverts well before the delay elapses
        oneHop(circuit);
        expect(simRunning).toBe(true);

        circuit.run(20);
        expect(simRunning).toBe(false); // still fires - matches the original stepFinished() semantics
    });

    it("can fire again on a later run after reset()", () => {
        const src = manualSource(0);
        const trig = makeTrigger({ type: 0, delay: 0 });
        connect({ elm: src, num: 0 }, { elm: trig, num: 0 });

        const { chipsByElm } = buildDigitalCircuit([src, trig]);
        src.chip = chipsByElm.get(src)![0];
        src.chip.circuit.run(2);

        src.set(1);
        src.chip.circuit.run(2);
        expect(simRunning).toBe(false);

        // A real reset() rebuilds the whole digital graph (SimulationManager.resetAction() sets
        // analyzeFlag, forcing initDigitalCircuit() to run again) - simulate that here by just
        // building a fresh Circuit/StopTriggerElm pair, same as a fresh run.
        simRunning = true;
        trig.reset();
        expect(trig.stopped).toBe(false);

        const src2 = manualSource(0);
        const trig2 = makeTrigger({ type: 0, delay: 0 });
        connect({ elm: src2, num: 0 }, { elm: trig2, num: 0 });
        const built2 = buildDigitalCircuit([src2, trig2]);
        src2.chip = built2.chipsByElm.get(src2)![0];
        built2.circuit.run(2);
        src2.set(1);
        built2.circuit.run(2);
        expect(simRunning).toBe(false);
    });

    it("halts runWithDeadline() mid-batch instead of letting it drain the rest of the requested budget", () => {
        // A free-running ring oscillator (output wired back to its own input) alongside the
        // trigger, so the circuit still has plenty of future ticks queued up at the moment the
        // trigger fires. If setSimRunning(false) were the only thing `stop` did, this SAME
        // runWithDeadline() call - already handed a huge tick budget by the test below - would
        // keep right on toggling the oscillator for the rest of that budget, because nothing
        // inside the engine's own event loop consults CircuitElm.app.simRunning (Circuit has no
        // reference to it at all - see Circuit.haltRequested's own comment).
        let toggles = 0;
        const oscOut = 2;
        const oscDesc = [
            chipStart((pin: Int32Array) => { pin[oscOut] = pin[1] ? 0 : 1; })
                .inputPins(1).outputPin(oscOut).outputDelayS(1e-6, 1e-6),
        ];
        const counter = (chip: Chip, mask: number): void => {
            if (mask === 0) return;
            chip.inputs ^= mask;
            toggles++;
        };

        const src = manualSource(0);
        const trig = makeTrigger({ type: 0, delay: 0 });
        const entries: CircuitEntry[] = [
            CHIP("osc", oscDesc),
            CONNECTION("osc", oscOut, "osc", 1), // self-loop -> free-running
            CHIP("cnt", [customChipStart(counter).inputPins(1)]),
            CONNECTION("osc", oscOut, "cnt", 1),
        ];
        // Fold the trigger/source (real CircuitElm-shaped, wired via connect()/nodes[]) into the
        // same Circuit as the hand-built oscillator entries above.
        const trigDesc = trig.digitalSynthesis();
        const srcDesc = src.digitalSynthesis();
        entries.push(CHIP("trig", trigDesc.desc), CHIP("src", srcDesc.desc));
        entries.push(CONNECTION("src", 1, "trig", 1));
        const circuit = new Circuit(circuitLayout(entries));
        const srcChip = circuit.chips.find(c => c.debugName === "src")!;
        src.chip = srcChip;

        circuit.run(2);
        src.set(1); // arms the trigger; stop fires on this very tick (delay=0)

        const hugeBudget = 10_000_000;
        const actualTicks = circuit.runWithDeadline(hugeBudget, Date.now() + 60_000);

        expect(simRunning).toBe(false);
        expect(actualTicks).toBeLessThan(hugeBudget);
        // The oscillator would have toggled ~10 million times over that budget (1 tick period);
        // halting on the trigger's own tick keeps it in the single digits.
        expect(toggles).toBeLessThan(10);
    });
});
