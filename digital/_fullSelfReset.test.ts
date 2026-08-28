import { describe, it, expect } from "vitest";
import { Scheduler } from "./Scheduler";
import { DigitalElm, State, GroupPin } from "./DigitalElm";
import { CounterElm } from "../CounterElm";
import { JKFlipFlopElm } from "../JKFlipFlopElm";
import { NandGateElm } from "../GateElm";
import { DFlipFlopElm } from "../DFlipFlopElm";

// Full structure, corrected per the user:
//   H: 9-bit self-resetting counter (bits -> nand5 -> hresetFF -> Q=HRESET
//      feeds back into H's OWN reset pin).
//   V: two 4-bit ripple-cascaded chips + a JK 9th bit, ALL clocked
//      ultimately from HRESET (vChip1 directly, vChip2/vJK via ripple
//      carry), and ALL reset by VRESET (vChip1/vChip2 directly, vJK via
//      its own invert-reset flag - matching /VRESET's active-low wiring) -
//      VRESET itself generated the same way as HRESET: V's own bits ->
//      nand3 -> vresetFF -> Q=VRESET, feeding back into V's OWN reset pins.

class ClockElm extends DigitalElm {
    constructor(period: number) {
        super();
        this.cycleTime = period;
        this.rootPhaseZero = 0;
        this.state = State.Active;
        this.firstOutputEvent = 0;
        this.currentOutputEvent = 1;
        this.outputEvents.push([0, false]);
        this.outputEvents.push([period / 2, true]);
        this.scheduler.schedule(period / 2, this, true);
    }
    evaluate(): boolean { throw new Error("clock always active"); }
}
// Uniform propagation delay (in ticks) applied to every gate/chip in the
// circuit below, bypassing the seconds/maxTimeStep conversion (there's no
// full SimulationManager set up in this unit test) via a direct
// propagationDelayTicks() override - see DigitalElm.ts's delayTicks docstring
// and GateElm/CounterElm/DFlipFlopElm/JKFlipFlopElm's own propagationDelayTicks()
// implementations for the real (seconds-based) version this stands in for.
const DELAY_TICKS = 2;
function withDelay<T extends { propagationDelayTicks?: (...a: any[]) => number }>(obj: T): T {
    if (DELAY_TICKS > 0) (obj as any).propagationDelayTicks = () => DELAY_TICKS;
    return obj;
}
function fakeGate(proto: object, inputCount: number): any {
    const g = Object.create(proto) as any;
    g.inputCount = inputCount; g.flags = 0; g.inputs = []; g.liveOutputs = [];
    g.value = false; g.initialValue = false; g.state = State.Passive; g.history = []; g.trustedInputs = new Set();
    g.outputEvents = []; g.cycleTime = 0; g.firstOutputEvent = 0; g.currentOutputEvent = 0;
    g.cycleParent = null; g.cycleSpanEnd = null; g.activationTime = null;
    g.currentCycle = g; g.previousCycle = null;
    g.rootPhaseZero = 0; g.sleepBase = 0; g.backfillCycle = g; g.backfillTime = 0;
    g.lastChecked = 0; g.sleepRequested = false; g.digitalDebug = false;
    g.inputPatternHistory = []; g.inputPatternTable = new Map();
    g.compressedEnd = new Map(); g.lastInputChange = [];
    g.firstInputTablePos = 0; g.firstInputMask = 0; g.checkVisited = false;
    return withDelay(g);
}
function buildDFF(d: any, clk: any) {
    const ff = Object.create(DFlipFlopElm.prototype) as any;
    ff.flags = 0;
    ff.inputs = [d, clk];
    ff.digitalPins = [new GroupPin(ff, 0), new GroupPin(ff, 1)];
    ff.initDigitalPins();
    withDelay(ff);
    for (const p of ff.digitalPins) p.addInput(...ff.inputs);
    return ff;
}
const NEG = CounterElm.FLAG_NEGATIVE_EDGE;

function buildCircuit(scheduler: Scheduler) {
    DigitalElm.current = scheduler;
    const clock = new ClockElm(4);

    // H: self-resetting.
    const hCounter = Object.create(CounterElm.prototype) as any;
    hCounter.invertreset = true; hCounter.modulus = 0; hCounter.flags = NEG; hCounter.bits = 9;
    hCounter.initDigitalPins(); withDelay(hCounter);
    const nand5 = fakeGate(NandGateElm.prototype, 5);
    const hresetFF = buildDFF(nand5, clock);
    const HRESET = hresetFF.digitalPins[0];
    hCounter.inputs = [clock, HRESET];
    for (const p of hCounter.digitalPins) p.addInput(...hCounter.inputs, ...hCounter.extraPeriodicityInputs(p));
    const hbit = (weight: number) => hCounter.digitalPins[8 - Math.log2(weight)];
    nand5.addInput(hbit(2), hbit(4), hbit(64), hbit(128), hbit(256));

    // V: ripple-cascaded, self-resetting via its OWN nand3/vresetFF, reset
    // pins wired to VRESET (vJK included).
    const nand3 = fakeGate(NandGateElm.prototype, 3);
    const vresetFF = buildDFF(nand3, clock);
    const VRESET = vresetFF.digitalPins[0];

    const vChip1 = Object.create(CounterElm.prototype) as any;
    vChip1.invertreset = true; vChip1.modulus = 0; vChip1.flags = NEG; vChip1.bits = 4;
    vChip1.initDigitalPins(); withDelay(vChip1);
    vChip1.inputs = [HRESET, VRESET];
    for (const p of vChip1.digitalPins) p.addInput(...vChip1.inputs, ...vChip1.extraPeriodicityInputs(p));
    const vChip1MSB = vChip1.digitalPins[0];

    const vChip2 = Object.create(CounterElm.prototype) as any;
    vChip2.invertreset = true; vChip2.modulus = 0; vChip2.flags = NEG; vChip2.bits = 4;
    vChip2.initDigitalPins(); withDelay(vChip2);
    vChip2.inputs = [vChip1MSB, VRESET];
    for (const p of vChip2.digitalPins) p.addInput(...vChip2.inputs, ...vChip2.extraPeriodicityInputs(p));
    const vChip2MSB = vChip2.digitalPins[0];

    const vJK = Object.create(JKFlipFlopElm.prototype) as any;
    vJK.flags = JKFlipFlopElm.FLAG_RESET | JKFlipFlopElm.FLAG_INVERT_RESET;
    const jHigh = fakeGate(NandGateElm.prototype, 0); jHigh.value = true; jHigh.evaluate = () => true;
    const kHigh = fakeGate(NandGateElm.prototype, 0); kHigh.value = true; kHigh.evaluate = () => true;
    vJK.inputs = [jHigh, vChip2MSB, kHigh, VRESET];
    vJK.digitalPins = [new GroupPin(vJK, 0), new GroupPin(vJK, 1)];
    vJK.initDigitalPins(); withDelay(vJK);
    for (const p of vJK.digitalPins) p.addInput(...vJK.inputs);

    const vbit = (weight: number): any => {
        if (weight === 256) return vJK.digitalPins[0];
        if (weight >= 16) return vChip2.digitalPins[3 - Math.log2(weight / 16)];
        return vChip1.digitalPins[3 - Math.log2(weight)];
    };
    nand3.addInput(vbit(1), vbit(4), vbit(256));

    const all = [
        ...hCounter.digitalPins, nand5, ...hresetFF.digitalPins,
        ...vChip1.digitalPins, ...vChip2.digitalPins, ...vJK.digitalPins,
        nand3, ...vresetFF.digitalPins,
    ];
    for (const p of all) if (p.state === State.Passive) p.inputUpdated(null);

    return { scheduler, hCounter, nand5, hresetFF, vChip1, vChip2, vJK, nand3, vresetFF, hbit, vbit };
}

describe("full self-resetting H+V (corrected structure)", () => {
    it("report settling after a long run", () => {
        DigitalElm.promotionEnabled = true;
        const c = buildCircuit(new Scheduler());
        c.scheduler.runUntil(2_000_000);
        const report = (label: string, pin: any) =>
            console.log(`${label}: state=${State[pin.state]} cycleTime=${pin.cycleTime} historyLen=${pin.history.length}`);
        report("nand5", c.nand5);
        report("hresetFF.Q", c.hresetFF.digitalPins[0]);
        for (const w of [1, 4, 16, 64, 256]) report(`V bit${w}`, c.vbit(w));
        report("nand3", c.nand3);
        report("vresetFF.Q", c.vresetFF.digitalPins[0]);
    }, 30000);

    it("matches an always-correct baseline over 2,000,000 ticks (V bit 256 and 128)", () => {
        DigitalElm.promotionEnabled = false;
        const base = buildCircuit(new Scheduler());
        base.scheduler.runUntil(2_000_000);

        DigitalElm.promotionEnabled = true;
        const opt = buildCircuit(new Scheduler());
        opt.scheduler.runUntil(2_000_000);

        for (const w of [128, 256]) {
            const baseHist = base.vbit(w).history;
            const optPin = opt.vbit(w);
            if (optPin.state === State.Asleep) optPin._backfillHistory(2_000_000);
            const optHist = optPin.history.filter(([t]: [number, boolean]) => t <= 2_000_000);

            let bi = 0, oi = 0, mismatches = 0, drops = 0;
            const realMismatches: any[] = [];
            while (bi < baseHist.length && oi < optHist.length) {
                const b = baseHist[bi], o = optHist[oi];
                if (b[0] === o[0] && b[1] === o[1]) { bi++; oi++; continue; }
                let matched = false;
                for (let k = 1; k <= 6 && !matched; k++) {
                    if (bi + k < baseHist.length && baseHist[bi + k][0] === o[0] && baseHist[bi + k][1] === o[1]) { drops += k; bi += k; matched = true; }
                }
                if (matched) continue;
                for (let k = 1; k <= 6 && !matched; k++) {
                    if (oi + k < optHist.length && optHist[oi + k][0] === b[0] && optHist[oi + k][1] === b[1]) { drops += k; oi += k; matched = true; }
                }
                if (matched) continue;
                mismatches++;
                if (realMismatches.length < 10) realMismatches.push({ base_i: bi, base: b, opt_i: oi, opt: o });
                bi++; oi++;
            }
            console.log(`V bit${w}: baseLen=${baseHist.length} optLen=${optHist.length} drops=${drops} realMismatches=${mismatches} leftoverBase=${baseHist.length - bi} leftoverOpt=${optHist.length - oi}`);
            if (mismatches > 0) console.log("examples:", JSON.stringify(realMismatches));
            expect(mismatches, `V bit${w} real mismatches`).toBe(0);
        }
    }, 60000);
});
