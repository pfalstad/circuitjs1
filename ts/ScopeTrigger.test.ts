import { describe, it, expect } from "vitest";
import { ScopePlot } from "./ScopePlot";
import { ScopeTrigger } from "./ScopeTrigger";
import { UNITS_V } from "./ScopeConstants";

// 16-column buffer, 6-pixel-wide screen, so the write pointer laps the displayed window after
// only a dozen or so columns of nothing happening.
const SPC = 16, W = 6;

function setup(mode = ScopeTrigger.TRIGGER_NORMAL) {
    const plot = new ScopePlot(null, UNITS_V);
    plot.scopePointCount = SPC;
    plot.minValues = new Array(SPC).fill(0);
    plot.maxValues = new Array(SPC).fill(0);
    const sim = { t: 0 } as any;
    const trigger = new ScopeTrigger();
    trigger.mode = mode;
    trigger.level = 2.5;
    trigger.reset(SPC);
    // advance one column holding value v, the way ScopePlot.timeStep() does, then run the trigger
    const column = (v: number) => {
        plot.ptr = (plot.ptr + 1) & (SPC - 1);
        plot.liveMin[plot.ptr] = plot.liveMax[plot.ptr] = v;
        sim.t++;
        trigger.check([plot], false, sim, SPC, W);
    };
    const columns = (v: number, n: number) => { for (let i = 0; i < n; i++) column(v); };
    // the displayed screen, one max value per pixel column (only the valid ones)
    const screen = () => {
        const ipa = trigger.displayStartIndex(plot, W, SPC);
        const n = trigger.validDataCount(plot, ipa, W, SPC);
        return Array.from({ length: n }, (_, i) => plot.maxValues[(i + ipa) & (SPC - 1)]);
    };
    return { column, columns, screen, trigger, plot };
}

describe("ScopeTrigger", () => {
    it("keeps showing a rare pulse after the buffer has wrapped many times", () => {
        const { column, columns, screen, trigger } = setup();
        columns(0, 20);
        column(5);
        columns(0, 200);
        expect(trigger.isTriggered()).toBe(true);
        expect(screen()).toEqual([0, 0, 0, 5, 0, 0]);
        expect(trigger.time).toBe(21);
    });

    it("shows the first sweep live while it fills in", () => {
        const { column, columns, screen } = setup();
        columns(0, 20);
        column(5);
        expect(screen()).toEqual([0, 0, 0, 5]);
    });

    it("keeps the previous sweep up until the next one is complete", () => {
        const { column, columns, screen, trigger } = setup();
        columns(0, 20);
        column(5);
        columns(0, 100);
        column(5);
        column(5);
        // second sweep still capturing: first one stays on screen
        expect(trigger.state).toBe(ScopeTrigger.TRIG_STATE_TRIGGERED);
        expect(screen()).toEqual([0, 0, 0, 5, 0, 0]);
        expect(trigger.time).toBe(21);
        columns(0, 100);
        expect(screen()).toEqual([0, 0, 0, 5, 5, 0]);
        expect(trigger.time).toBe(122);
    });

    it("free-runs in auto mode once nothing has triggered for a while", () => {
        const { column, columns, trigger, plot } = setup(ScopeTrigger.TRIGGER_AUTO);
        columns(0, 20);
        column(5);
        columns(0, 10);
        expect(trigger.isTriggered()).toBe(true);
        columns(0, 2 * SPC);
        expect(trigger.isTriggered()).toBe(false);
        expect(plot.minValues).toBe(plot.liveMin);
    });
});
