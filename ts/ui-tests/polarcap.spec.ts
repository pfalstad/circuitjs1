import { test, expect, type Sim } from "./fixtures";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// tests/polarcap.txt: a 100uF polarized capacitor (max reverse voltage 1V) in series with a
// resistor, and a switch that connects its + side either to ground or to a variable voltage
// source (a "Voltage" slider from -5V to 5V, starting at -3.4V).  Flipping the switch puts the
// source's voltage across the capacitor backwards, and if that's more than 1V, the simulation
// stops with an error pointing at the capacitor.
const circuit = readFileSync(fileURLToPath(new URL("../../tests/polarcap.txt", import.meta.url)), "utf8");

test.use({ circuit });

const SWITCH: [number, number] = [256, 104];

const stopState = (sim: Sim) => sim.page.evaluate(() => {
    const app = (window as any).__app;
    return { msg: app.stopMessage, elm: app.stopElm?.getClassName() ?? null, running: app.simIsRunning() };
});

// clicks the switch (which flips it, rather than opening its properties)
async function flipSwitch(sim: Sim) {
    const before = await sim.prop(0, "position");
    await sim.click(...SWITCH);
    await expect(sim.dialog).toBeHidden();
    expect(await sim.prop(0, "position")).not.toBe(before);
}

// sets the Voltage slider by clicking in its track
async function setSlider(sim: Sim, volts: number) {
    const p = await sim.page.evaluate(v => {
        const elm = (window as any).__app.elmList.find((e: any) => e.getClassName() === "VarRailElm");
        const sb = elm.slider, S = sb.constructor;
        const value = Math.round((v - elm.bias) * 100 / (elm.maxVoltage - elm.bias));
        const left = S.HMARGIN + S.SCROLLHEIGHT + S.BARMARGIN;
        const x = left + (sb.vpw - 2 * left) * (value - sb.min) / (sb.max - sb.min);
        const r = sb.element.getBoundingClientRect();
        return { x: r.left + x, y: r.top + r.height / 2 };
    }, volts);
    await sim.page.mouse.click(p.x, p.y);
    expect(await sim.page.evaluate(() => {
        const elm = (window as any).__app.elmList.find((e: any) => e.getClassName() === "VarRailElm");
        return elm.getVoltage();
    })).toBeCloseTo(volts, 1);
}

// runs the circuit for the given simulated time (without waiting past a stop)
async function run(sim: Sim, seconds: number) {
    await sim.page.evaluate(() => (window as any).__app.setSimRunning(true));
    await sim.page.waitForFunction(s => {
        const app = (window as any).__app;
        return app.stopMessage != null || app.sim.t >= s;
    }, (await sim.page.evaluate(() => (window as any).__app.sim.t)) + seconds, { timeout: 30000 });
}

test("flipping the switch puts -3.4V across the polarized capacitor and stops with an error", async ({ sim }) => {
    // it runs happily with the capacitor's + side grounded
    await run(sim, 0.1);
    expect(await stopState(sim)).toEqual({ msg: null, elm: null, running: true });

    await flipSwitch(sim);
    await run(sim, 0.1);
    expect(await stopState(sim)).toEqual({
        msg: "capacitor exceeded max reverse voltage", elm: "PolarCapacitorElm", running: false });
});

test("a reverse voltage under the polarized capacitor's max is fine, until the slider goes past it", async ({ sim }) => {
    test.slow();
    await setSlider(sim, -0.5);
    await flipSwitch(sim);
    // (the RC time constant is 10ms, so the capacitor has long since charged to -0.5V)
    await run(sim, 0.2);
    expect(await stopState(sim)).toEqual({ msg: null, elm: null, running: true });
    expect(await sim.page.evaluate(() => {
        const cap = (window as any).__app.elmList.find((e: any) => e.getClassName() === "PolarCapacitorElm");
        return cap.voltdiff;
    })).toBeCloseTo(-0.5, 2);

    await setSlider(sim, -2);
    await run(sim, 0.1);
    expect(await stopState(sim)).toEqual({
        msg: "capacitor exceeded max reverse voltage", elm: "PolarCapacitorElm", running: false });
});
