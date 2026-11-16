import { test, expect, type Sim } from "./fixtures";

// The data input element (Draw > Inputs and Sources > Add Data Input) is a 1-terminal source
// that plays back voltages from a text file (one per line; # comments and blank lines are
// skipped), each for one sample length, times a scale factor.  These tests load a file through
// the file chooser in its properties, record its output with a data export on the same post,
// run the circuit, and check what it played.

// draws a data input with its post at (96, 96) and a data export on the same post, and opens
// the data input's properties
async function build(sim: Sim) {
    await sim.menu("Draw", "Inputs and Sources", "Add Data Input");
    await sim.drag(96, 96, 96, 160);
    await sim.menu("Draw", "Outputs and Labels", "Add Data Export");
    await sim.drag(96, 96, 160, 96);
    await sim.page.keyboard.press("Escape");
    expect((await sim.elements()).map(e => e.type)).toEqual(["DataInputElm", "DataRecorderElm"]);
    await sim.clickElm(96, 96, { type: "DataInputElm" });
    await expect(sim.dialog).toBeVisible();
}

// picks a file with the given contents in the open properties' file chooser
async function chooseFile(sim: Sim, name: string, contents: string) {
    await sim.dialog.locator("input[type=file]").setInputFiles(
        { name, mimeType: "text/plain", buffer: Buffer.from(contents) });
}

async function ok(sim: Sim) {
    await sim.dialog.getByRole("button", { name: "OK" }).click();
    await expect(sim.dialog).toBeHidden();
}

// runs the circuit for at least the given number of time steps, then stops it; returns the
// voltages the data export recorded, as runs of [voltage, number of steps]
async function record(sim: Sim, steps: number): Promise<[number, number][]> {
    await sim.page.evaluate(() => (window as any).__app.setSimRunning(true));
    await sim.page.waitForFunction(s => (window as any).__app.sim.timeStepCount >= s, steps, { timeout: 30000 });
    await sim.page.evaluate(() => (window as any).__app.setSimRunning(false));
    const data: number[] = await sim.page.evaluate(() => {
        const r = (window as any).__app.elmList[1];
        return r.data.slice(0, r.dataPtr);
    });
    const runs: [number, number][] = [];
    for (const v of data) {
        const last = runs[runs.length - 1];
        if (last && Math.abs(last[0] - v) < 1e-9) last[1]++;
        else runs.push([v, 1]);
    }
    return runs;
}

// the file: comments and blank lines, around three values
const FILE = "# test data\n1\n\n2.5\n# another comment\n-3\n";

// expects the runs to be the given voltages in order, each held for about the given number of
// steps (the last one for at least that long).  A step can land on either side of a sample's
// boundary, depending on rounding of the time.
function expectRuns(runs: [number, number][], volts: number[], steps: number) {
    expect(runs.map(r => r[0])).toEqual(volts);
    runs.forEach(([v, n], i) => {
        if (i === runs.length - 1)
            expect(n, `steps at ${v}V`).toBeGreaterThanOrEqual(steps - 1);
        else {
            expect(n, `steps at ${v}V`).toBeGreaterThanOrEqual(steps - 1);
            expect(n, `steps at ${v}V`).toBeLessThanOrEqual(steps + 1);
        }
    });
}

test("data input plays back a file's values, scaled, then holds the last one", async ({ sim, page }) => {
    await build(sim);
    await chooseFile(sim, "wave.txt", FILE);
    await expect.poll(() => sim.prop(0, "data")).toEqual([1, 2.5, -3]);
    await sim.field("Scale Factor").fill("2");
    await sim.field("Sample Length (s)").fill("0.5m");
    await ok(sim);
    expect(await sim.prop(0, "scaleFactor")).toBe(2);
    expect(await sim.prop(0, "sampleLength")).toBeCloseTo(0.5e-3);
    // it's labeled with the file's name, without the extension
    expect(await page.evaluate(() => (window as any).__app.elmList[0].getRailText())).toBe("wave");

    const dt: number = await page.evaluate(() => (window as any).__app.sim.timeStep);
    const perSample = Math.round(0.5e-3 / dt);
    // (play it all, then a while longer)
    const runs = await record(sim, perSample * 5);
    expectRuns(runs, [2, 5, -6], perSample);
    expect(runs[2]![1]).toBeGreaterThan(perSample * 2);
});

test("data input with Repeat checked starts over at the end of the file", async ({ sim, page }) => {
    await build(sim);
    await chooseFile(sim, "wave.txt", FILE);
    await expect.poll(() => sim.prop(0, "data")).toEqual([1, 2.5, -3]);
    await sim.field("Sample Length (s)").fill("0.5m");
    await sim.dialog.getByLabel("Repeat").check();
    await ok(sim);
    expect(await page.evaluate(() => (window as any).__app.elmList[0].doesRepeat())).toBe(true);

    const dt: number = await page.evaluate(() => (window as any).__app.sim.timeStep);
    const perSample = Math.round(0.5e-3 / dt);
    const runs = await record(sim, perSample * 7);
    // (two full times through, and some of the third)
    expectRuns(runs.slice(0, 6), [1, 2.5, -3, 1, 2.5, -3], perSample);
    expect(runs[6]![0]).toBe(1);
});

test("data input with a bad file says so", async ({ sim, page }) => {
    await build(sim);
    const alert = new Promise<string>(resolve => page.once("dialog", d => {
        resolve(d.message());
        d.dismiss();
    }));
    await chooseFile(sim, "bad.txt", "1\nabc\n2\n");
    expect(await alert).toContain("Error parsing data file");
});
