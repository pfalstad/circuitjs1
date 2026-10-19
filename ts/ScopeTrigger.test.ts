import { describe, it, expect, vi } from "vitest";
import { ScopePlot } from "./ScopePlot";
import { ScopeTrigger } from "./ScopeTrigger";
import { UNITS_V, VAL_VOLTAGE } from "./ScopeConstants";
import { ChipState } from "./digital/chip";

// 16-column buffer, 6-pixel-wide screen, 10 ticks per column - small enough to reason about,
// and a frame jumping thousands of ticks covers the whole buffer many times over.
const SPC = 16, W = 6, SP = 10, HV = 5;

function setup() {
    const history: { time: number; value: number }[] = [];
    const chip = {
        circuit: { globalTime: 0 },
        state: ChipState.PASSIVE,
        history,
        output: 0,
        backfillHistory: vi.fn(() => chip.circuit.globalTime),
    } as any;
    const plot = new ScopePlot({ highVoltage: HV } as any, UNITS_V, VAL_VOLTAGE, 1);
    plot.digitalChip = chip;
    plot.scopePointCount = SPC;
    plot.scopePlotSpeed = SP;
    plot.minValues = new Array(SPC).fill(0);
    plot.maxValues = new Array(SPC).fill(0);
    const sim = { t: 0, maxTimeStep: 1, digitalTickEpoch: 0 } as any;
    const trigger = new ScopeTrigger();
    trigger.mode = ScopeTrigger.TRIGGER_NORMAL;
    trigger.reset(SPC);
    // one draw: bring the plot up to `now`, then run the trigger
    const frame = (now: number) => {
        chip.circuit.globalTime = now;
        sim.t = now;
        plot.fillFromDigitalHistory();
        trigger.check([plot], false, sim, SPC, W);
    };
    const pulse = (rise: number, fall: number) => {
        history.push({ time: rise, value: 1 }, { time: fall, value: 0 });
    };
    // the displayed screen, one max value per pixel column
    const screen = () => {
        const ipa = trigger.displayStartIndex(plot, W, SPC);
        return Array.from({ length: W }, (_, i) => plot.maxValues[(i + ipa) & (SPC - 1)]);
    };
    return { frame, pulse, screen, trigger, plot };
}

describe("ScopeTrigger (digital, history-based)", () => {
    it("catches a pulse that a single frame jumped far past", () => {
        const { frame, pulse, screen, trigger } = setup();
        frame(50);
        pulse(1000, 1005);
        frame(5000); // ~30 buffers' worth of ticks in one frame
        expect(trigger.isTriggered()).toBe(true);
        expect(screen()).toEqual([0, 0, 0, HV, 0, 0]);
        expect(trigger.time).toBe(1000);
    });

    it("keeps showing the sweep while nothing happens", () => {
        const { frame, pulse, screen, trigger } = setup();
        frame(50);
        pulse(1000, 1005);
        frame(5000);
        for (let now = 6000; now < 100000; now += 7000)
            frame(now);
        expect(trigger.isTriggered()).toBe(true);
        expect(trigger.state).toBe(ScopeTrigger.TRIG_STATE_ARMED);
        expect(screen()).toEqual([0, 0, 0, HV, 0, 0]);
    });

    it("finishes a capture whose edge came right at the end of a frame", () => {
        const { frame, pulse, screen, trigger } = setup();
        frame(50);
        pulse(1000, 1005);
        frame(5000);
        pulse(9995, 10015);
        frame(10000);
        // not complete yet: still showing the first sweep
        expect(trigger.state).toBe(ScopeTrigger.TRIG_STATE_TRIGGERED);
        expect(trigger.time).toBe(1000);
        frame(80000); // next frame cold-starts the live buffer, but history still has it
        expect(trigger.state).toBe(ScopeTrigger.TRIG_STATE_ARMED);
        expect(trigger.time).toBe(9990);
        expect(screen()).toEqual([0, 0, 0, HV, HV, HV]);
    });

    it("shows the most recent of several complete sweeps", () => {
        const { frame, pulse, trigger } = setup();
        frame(50);
        pulse(1000, 1005);
        pulse(2000, 2005);
        pulse(3000, 3005);
        frame(9000);
        expect(trigger.time).toBe(3000);
    });

    it("triggers on falling edges when asked", () => {
        const { frame, pulse, screen, trigger } = setup();
        trigger.edge = ScopeTrigger.TRIGGER_EDGE_FALLING;
        frame(50);
        pulse(1000, 1035);
        frame(5000);
        expect(trigger.time).toBe(1030);
        expect(screen()).toEqual([HV, HV, HV, HV, 0, 0]);
    });

    it("free-runs in auto mode once nothing has triggered for a while", () => {
        const { frame, pulse, trigger, plot } = setup();
        trigger.mode = ScopeTrigger.TRIGGER_AUTO;
        frame(50);
        pulse(1000, 1005);
        frame(1100);
        expect(trigger.isTriggered()).toBe(true);
        frame(1100 + 2 * SPC * SP);
        expect(trigger.isTriggered()).toBe(false);
        expect(trigger.state).toBe(ScopeTrigger.TRIG_STATE_AUTO_RUN);
        expect(plot.minValues).toBe(plot.liveMin);
    });

    it("holds history a pending capture still needs", () => {
        const { frame, pulse, trigger, plot } = setup();
        frame(50);
        pulse(1000, 1005);
        frame(1010);
        expect(trigger.state).toBe(ScopeTrigger.TRIG_STATE_TRIGGERED);
        expect(plot.historyFloor()).toBeLessThanOrEqual(1000 - (W / 2 + 1) * SP);
    });
});
