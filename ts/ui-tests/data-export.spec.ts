import { test, expect, type Sim } from "./fixtures";
import { readFile } from "node:fs/promises";

// The data export element (Draw > Outputs and Labels > Add Data Export) records the voltage at
// its post every time step, keeping the last "# of Data Points" of them, and offers them as a
// download link in its properties.  These tests put one on the post of a 1-terminal A/C source,
// run the circuit, download the data from its properties, and check it against the sine wave.

// draws an A/C source with its post at (96, 96) and a data export on the same post, and sets
// the number of data points it keeps
async function build(sim: Sim, count: number) {
    await sim.menu("Draw", "Inputs and Sources", "Add A/C Voltage Source (1-terminal)");
    await sim.drag(96, 96, 96, 160);
    await sim.menu("Draw", "Outputs and Labels", "Add Data Export");
    await sim.drag(96, 96, 160, 96);
    await sim.page.keyboard.press("Escape");
    expect((await sim.elements()).map(e => e.type)).toEqual(["ACRailElm", "DataRecorderElm"]);
    await sim.clickElm(96, 96, { type: "DataRecorderElm" });
    await expect(sim.dialog).toBeVisible();
    await sim.field("# of Data Points").fill(String(count));
    await sim.dialog.getByRole("button", { name: "OK" }).click();
    await expect(sim.dialog).toBeHidden();
    expect(await sim.prop(1, "dataCount")).toBe(count);
}

// opens the data export's properties and downloads the data from its link; returns the
// file's name and lines
async function download(sim: Sim) {
    await sim.clickElm(96, 96, { type: "DataRecorderElm" });
    await expect(sim.dialog).toBeVisible();
    const link = sim.dialog.getByRole("link");
    await expect(link).toHaveText(/^data-\d{8}-\d{4}\.circuitjs\.txt$/);
    const [dl] = await Promise.all([sim.page.waitForEvent("download"), link.click()]);
    const text = await readFile((await dl.path())!, "utf8");
    await sim.page.keyboard.press("Escape");
    return { name: dl.suggestedFilename(), lines: text.split("\n").filter(l => l !== "") };
}

// the time, time step, and the source's frequency and peak voltage
const state = (sim: Sim) => sim.page.evaluate(() => {
    const app = (window as any).__app;
    return { t: app.sim.t, dt: app.sim.timeStep, freq: app.elmList[0].frequency, peak: app.elmList[0].maxVoltage,
             steps: app.sim.timeStepCount };
});

// checks that the samples are the source's sine wave at consecutive time steps, the last one
// taken a step before time t (a step's sample is taken before the time advances)
function checkSine(samples: number[], s: { t: number; dt: number; freq: number; peak: number }) {
    const n = samples.length;
    for (let i = 0; i < n; i++) {
        const t = s.t - (n - i) * s.dt;
        expect(samples[i]!, `sample ${i}`).toBeCloseTo(s.peak * Math.sin(2 * Math.PI * s.freq * t), 3);
    }
}

test("data export keeps the last N time steps, and they download as a file", async ({ sim, page }) => {
    await build(sim, 200);
    // run it for more than 200 steps, so its buffer has wrapped around, then stop it
    await page.evaluate(() => (window as any).__app.setSimRunning(true));
    await page.waitForFunction(() => (window as any).__app.sim.timeStepCount > 1000, null, { timeout: 30000 });
    await page.evaluate(() => (window as any).__app.setSimRunning(false));
    const s = await state(sim);

    const info = await page.evaluate(() => { const a: string[] = []; (window as any).__app.elmList[1].getInfo(a); return a; });
    expect(info[2]).toBe("200/200");

    const { name, lines } = await download(sim);
    expect(name).toMatch(/^data-\d{8}-\d{4}\.circuitjs\.txt$/);
    expect(lines[0]).toBe(`# time step = ${s.dt} sec`);
    const samples = lines.slice(1).map(Number);
    expect(samples).toHaveLength(200);
    checkSine(samples, s);
});

test("data export before its buffer is full has only the steps so far", async ({ sim, page }) => {
    await build(sim, 100000);
    await page.evaluate(() => (window as any).__app.setSimRunning(true));
    await page.waitForFunction(() => (window as any).__app.sim.timeStepCount > 500, null, { timeout: 30000 });
    await page.evaluate(() => (window as any).__app.setSimRunning(false));
    const s = await state(sim);

    const { lines } = await download(sim);
    const samples = lines.slice(1).map(Number);
    expect(samples).toHaveLength(s.steps);
    checkSine(samples, s);
});
