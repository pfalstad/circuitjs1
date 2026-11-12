import { test, expect, type Sim } from "./fixtures";

// The stop trigger (Draw > Outputs and Labels > Add Stop Trigger) stops the simulation when
// the voltage at its post crosses a threshold.  These tests draw one on the post of a 1-terminal
// A/C source, set its properties in its dialog, run the circuit, and check that it stops when
// it should.

// draws an A/C source with its post at (96, 96) and a stop trigger on the same post, then
// opens the trigger's properties
async function build(sim: Sim) {
    await sim.menu("Draw", "Inputs and Sources", "Add A/C Voltage Source (1-terminal)");
    await sim.drag(96, 96, 96, 160);
    await sim.menu("Draw", "Outputs and Labels", "Add Stop Trigger");
    await sim.drag(96, 96, 160, 96);
    await sim.page.keyboard.press("Escape");
    expect((await sim.elements()).map(e => e.type)).toEqual(["ACRailElm", "StopTriggerElm"]);
    await sim.clickElm(96, 96, { type: "StopTriggerElm" });
    await expect(sim.dialog).toBeVisible();
}

async function ok(sim: Sim) {
    await sim.dialog.getByRole("button", { name: "OK" }).click();
    await expect(sim.dialog).toBeHidden();
}

// runs the circuit until it stops (or times out), and returns the time it stopped at, the
// source's frequency and peak voltage, and the trigger's info text
async function runUntilStopped(sim: Sim) {
    await sim.page.evaluate(() => (window as any).__app.setSimRunning(true));
    await sim.page.waitForFunction(() => !(window as any).__app.simIsRunning(), null, { timeout: 30000 });
    return sim.page.evaluate(() => {
        const app = (window as any).__app;
        const src = app.elmList[0], trig = app.elmList[1];
        const info: string[] = [];
        trig.getInfo(info);
        return { t: app.sim.t, freq: src.frequency, peak: src.maxVoltage, stopped: trig.stopped, info };
    });
}

test("a stop trigger with a required count stops on the nth crossing", async ({ sim }) => {
    test.slow();
    await build(sim);
    await sim.field("Voltage").fill("100");
    await sim.field("Required Count").fill("3");
    await ok(sim);
    expect(await sim.prop(1, "triggerVoltage")).toBe(100);
    expect(await sim.prop(1, "count")).toBe(3);

    const r = await runUntilStopped(sim);
    expect(r.stopped).toBe(true);
    expect(r.info[3]).toBe("stopped");
    // the source starts at 0V and rises past 100V a little after the start of each cycle, so
    // the third time is early in the third cycle
    const expected = (2 + Math.asin(100 / r.peak) / (2 * Math.PI)) / r.freq;
    expect(r.t).toBeGreaterThanOrEqual(expected);
    expect(r.t).toBeLessThan(expected + 0.05 / r.freq);
});

test("a <= stop trigger with a delay stops that long after the crossing", async ({ sim }) => {
    test.slow();
    await build(sim);
    await sim.field("Voltage").fill("-100");
    await sim.choice("Trigger Type").selectOption("<=");
    await sim.field("Delay (s)").fill("5m");
    await ok(sim);
    expect(await sim.prop(1, "type")).toBe(1);
    expect(await sim.prop(1, "delay")).toBeCloseTo(0.005);

    const r = await runUntilStopped(sim);
    expect(r.stopped).toBe(true);
    // the source first falls past -100V half a cycle after it first rises past 100V
    const crossing = (0.5 + Math.asin(100 / r.peak) / (2 * Math.PI)) / r.freq;
    expect(r.t).toBeGreaterThanOrEqual(crossing + 0.005);
    expect(r.t).toBeLessThan(crossing + 0.005 + 0.05 / r.freq);
});

test("a stop trigger doesn't stop the circuit while the threshold is out of reach", async ({ sim, page }) => {
    await build(sim);
    await sim.field("Voltage").fill("1k");
    await ok(sim);
    await page.evaluate(() => (window as any).__app.setSimRunning(true));
    // let it run a few cycles
    await page.waitForFunction(() => {
        const app = (window as any).__app;
        return app.sim.t * app.elmList[0].frequency > 3;
    }, null, { timeout: 30000 });
    expect(await page.evaluate(() => (window as any).__app.simIsRunning())).toBe(true);
    const info = await page.evaluate(() => {
        const a: string[] = [];
        (window as any).__app.elmList[1].getInfo(a);
        return a;
    });
    expect(info[3]).toBe("waiting");
});
