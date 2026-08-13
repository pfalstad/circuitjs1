import { describe, it, expect, beforeEach } from "vitest";
import { Scheduler } from "./Scheduler";
import { DigitalElm, GroupPin } from "./DigitalElm";
import { DFlipFlopElm } from "../DFlipFlopElm";
import { JKFlipFlopElm } from "../JKFlipFlopElm";
import { CounterElm } from "../CounterElm";

// Verifies the real evaluate()/alwaysDemoteOn() implementations added to
// DFlipFlopElm/JKFlipFlopElm/CounterElm against hand-computed truth tables,
// ported by reading (not reusing) each class's existing execute(). execute()
// can't be reused directly - it mutates pins[].value/this.lastClock, which
// would break evaluate()'s required purity - so this is the only real check
// that the two implementations agree, short of running the full app (which
// needs CircuitElm.app/CirSim - not constructible headlessly, see below).
//
// Real CircuitElm construction (`new DFlipFlopElm(x, y)`) touches
// CircuitElm.app deep inside setPoints()/setSize(), which isn't available
// outside the running app. Object.create() bypasses the constructor
// entirely while still exercising the class's REAL evaluate()/hasReset()/
// hasSet()/etc. methods - not a reimplementation of them.

/** A directly-controllable DigitalElm input for tests: setValue() both
 * updates .value and appends to .history, so transitionedTo() edge
 * detection works exactly as it would for a real driven input. */
class ManualElm extends DigitalElm {
    constructor(v: boolean) {
        super();
        this.value = v;
        this.history.push([0, v]);
    }
    evaluate(): boolean { return this.value; }
    setValue(t: number, v: boolean): void {
        this.value = v;
        this.history.push([t, v]);
    }
}

let scheduler: Scheduler;
beforeEach(() => {
    scheduler = new Scheduler();
    DigitalElm.current = scheduler;
});

describe("DFlipFlopElm.evaluate()", () => {
    it("captures D on the rising clock edge, holds otherwise", () => {
        const chip = Object.create(DFlipFlopElm.prototype) as DFlipFlopElm;
        chip.flags = 0; // no reset, no set
        const d = new ManualElm(false);
        const clk = new ManualElm(false);
        chip.inputs = [d, clk];
        chip.digitalPins = [new GroupPin(chip, 0), new GroupPin(chip, 1)];

        // No edge yet: Q should hold at its current (default false) value.
        let [q, qbar] = chip.evaluate(chip.digitalPins[0], null);
        expect([q, qbar]).toEqual([false, true]);

        // D=1, then a rising clock edge: Q should capture D.
        d.setValue(5, true);
        scheduler.currentTime = 10;
        clk.setValue(10, true);
        [q, qbar] = chip.evaluate(chip.digitalPins[0], clk);
        expect([q, qbar]).toEqual([true, false]);
        chip.digitalPins[0].value = q; // commit, as the real scheduler would

        // D changes without a new clock edge: Q must hold.
        d.setValue(15, false);
        scheduler.currentTime = 15;
        chip.digitalPins[0].lastChecked = 10;
        [q, qbar] = chip.evaluate(chip.digitalPins[0], d);
        expect([q, qbar]).toEqual([true, false]);
    });

    it("set/reset force Q and /Q independently (DFlipFlopElm's own quirk)", () => {
        const chip = Object.create(DFlipFlopElm.prototype) as DFlipFlopElm;
        chip.flags = DFlipFlopElm.FLAG_RESET | DFlipFlopElm.FLAG_SET;
        const d = new ManualElm(false);
        const clk = new ManualElm(false);
        const r = new ManualElm(false);
        const s = new ManualElm(false);
        chip.inputs = [d, clk, r, s]; // [D, clk, R, S]
        chip.digitalPins = [new GroupPin(chip, 0), new GroupPin(chip, 1)];

        scheduler.currentTime = 5;
        s.setValue(5, true);
        let [q, qbar] = chip.evaluate(chip.digitalPins[0], s);
        expect([q, qbar]).toEqual([true, false]); // isSet only

        s.setValue(10, false);
        r.setValue(10, true);
        scheduler.currentTime = 10;
        [q, qbar] = chip.evaluate(chip.digitalPins[0], r);
        expect([q, qbar]).toEqual([false, true]); // isReset only

        // Both asserted at once: reproduces the same "forbidden state" the
        // real execute() produces (Q and /Q both true) rather than papering
        // over it.
        s.setValue(15, true);
        scheduler.currentTime = 15;
        [q, qbar] = chip.evaluate(chip.digitalPins[0], s);
        expect([q, qbar]).toEqual([true, true]);

        expect(chip.alwaysDemoteOn(r)).toBe(true);
        expect(chip.alwaysDemoteOn(s)).toBe(true);
        expect(chip.alwaysDemoteOn(clk)).toBe(false);
    });
});

describe("JKFlipFlopElm.evaluate()", () => {
    function buildChip(positiveEdge: boolean, withReset: boolean) {
        const chip = Object.create(JKFlipFlopElm.prototype) as JKFlipFlopElm;
        chip.flags = (positiveEdge ? JKFlipFlopElm.FLAG_POSITIVE_EDGE : 0) | (withReset ? JKFlipFlopElm.FLAG_RESET : 0);
        const j = new ManualElm(false);
        const clk = new ManualElm(!positiveEdge); // start on the "inactive" level so the first edge is a real transition
        const k = new ManualElm(false);
        const inputs = withReset ? [j, clk, k, new ManualElm(false)] : [j, clk, k];
        chip.inputs = inputs;
        chip.digitalPins = [new GroupPin(chip, 0), new GroupPin(chip, 1)];
        return { chip, j, clk, k, r: inputs[3] as ManualElm | undefined };
    }

    it("J=1,K=0 sets; J=0,K=1 resets; J=K=1 toggles; J=K=0 holds", () => {
        const { chip, j, clk, k } = buildChip(true, false);
        let t = 0;
        const clockEdge = () => {
            t += 10;
            scheduler.currentTime = t;
            clk.setValue(t, true);
            const [q] = chip.evaluate(chip.digitalPins[0], clk);
            chip.digitalPins[0].value = q;
            clk.setValue(t + 1, false); // fall back so the next edge is a real transition
            scheduler.currentTime = t + 1;
            chip.digitalPins[0].lastChecked = t;
            return q;
        };

        j.setValue(t, true); k.setValue(t, false);
        expect(clockEdge()).toBe(true); // set

        j.setValue(t, false); k.setValue(t, false);
        expect(clockEdge()).toBe(true); // hold

        j.setValue(t, true); k.setValue(t, true);
        expect(clockEdge()).toBe(false); // toggle from true

        expect(clockEdge()).toBe(true); // toggle again

        j.setValue(t, false); k.setValue(t, true);
        expect(clockEdge()).toBe(false); // reset
    });

    it("negative-edge triggering and async reset", () => {
        const { chip, j, clk, k, r } = buildChip(false, true);
        j.setValue(0, true); k.setValue(0, false);
        scheduler.currentTime = 10;
        clk.setValue(10, false); // falling edge (started true)
        let [q] = chip.evaluate(chip.digitalPins[0], clk);
        expect(q).toBe(true);
        chip.digitalPins[0].value = q;

        r!.setValue(20, true);
        scheduler.currentTime = 20;
        [q] = chip.evaluate(chip.digitalPins[0], r);
        expect(q).toBe(false);

        expect(chip.alwaysDemoteOn(r!)).toBe(true);
        expect(chip.alwaysDemoteOn(j)).toBe(false);
    });
});

describe("CounterElm.evaluate()", () => {
    it("increments on the configured edge and wraps at the bit width", () => {
        const chip = Object.create(CounterElm.prototype) as CounterElm;
        chip.bits = 3;
        chip.modulus = 0;
        chip.invertreset = false;
        chip.flags = 0; // positive edge (negativeEdgeTriggered() false), no up/down
        const clk = new ManualElm(false);
        const reset = new ManualElm(false); // invertreset=false -> asserted when reset.value===true
        chip.inputs = [clk, reset];
        chip.digitalPins = Array.from({ length: 3 }, (_, k) => new GroupPin(chip, k));

        const toValue = (bits: boolean[]) => bits.reduce((v, b, k) => v | ((b ? 1 : 0) << (bits.length - 1 - k)), 0);

        let t = 0;
        const tick = () => {
            t += 10;
            scheduler.currentTime = t;
            clk.setValue(t, true);
            const next = chip.evaluate(chip.digitalPins[0], clk);
            chip.digitalPins.forEach((p, k) => { p.value = next[k]; p.lastChecked = t; });
            clk.setValue(t + 1, false);
            scheduler.currentTime = t + 1;
            return toValue(next);
        };

        expect(tick()).toBe(1);
        expect(tick()).toBe(2);
        expect(tick()).toBe(3);
        for (let i = 0; i < 4; i++) tick(); // 4,5,6,7
        expect(tick()).toBe(0); // wraps at 2^3
    });

    it("respects modulus and the up/down pin", () => {
        const chip = Object.create(CounterElm.prototype) as CounterElm;
        chip.bits = 4;
        chip.modulus = 5;
        chip.invertreset = false;
        chip.flags = CounterElm.FLAG_UP_DOWN;
        const clk = new ManualElm(false);
        const reset = new ManualElm(false);
        const updown = new ManualElm(true); // true -> dir=-1 per evaluate()
        chip.inputs = [clk, reset, updown];
        chip.digitalPins = Array.from({ length: 4 }, (_, k) => new GroupPin(chip, k));

        const toValue = (bits: boolean[]) => bits.reduce((v, b, k) => v | ((b ? 1 : 0) << (bits.length - 1 - k)), 0);
        let t = 0;
        const tick = () => {
            t += 10;
            scheduler.currentTime = t;
            clk.setValue(t, true);
            const next = chip.evaluate(chip.digitalPins[0], clk);
            chip.digitalPins.forEach((p, k) => { p.value = next[k]; p.lastChecked = t; });
            clk.setValue(t + 1, false);
            scheduler.currentTime = t + 1;
            return toValue(next);
        };

        // starts at 0, counting down with modulus 5: wraps to 4.
        expect(tick()).toBe(4);
        expect(tick()).toBe(3);

        reset.setValue(t + 5, true);
        scheduler.currentTime = t + 5;
        const afterReset = chip.evaluate(chip.digitalPins[0], reset);
        expect(toValue(afterReset)).toBe(0);

        expect(chip.alwaysDemoteOn(reset)).toBe(true);
        expect(chip.alwaysDemoteOn(updown)).toBe(true);
        expect(chip.alwaysDemoteOn(clk)).toBe(false);
    });
});
