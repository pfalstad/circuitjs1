import { test, expect, Sim } from "./fixtures";

// Builds the full-wave rectifier subcircuit example (public/circuits/fullrect-sc.txt) from
// scratch with the mouse and keyboard, the way a user would: draw the bridge rectifier, make
// it into a subcircuit (dragging its pins where they go), then clear the canvas and build the
// circuit that uses it.  Then runs it and checks that the output is rectified.

type Pt = [number, number];

// the inside of the subcircuit: a diode bridge with labeled nodes for its pins
const inner: { key: string; type: string; from: Pt; to: Pt; text?: string }[] = [
    { key: "d", type: "DiodeElm",       from: [304, 128], to: [368, 192] },
    { key: "d", type: "DiodeElm",       from: [304, 256], to: [368, 192] },
    { key: "d", type: "DiodeElm",       from: [240, 192], to: [304, 128] },
    { key: "d", type: "DiodeElm",       from: [240, 192], to: [304, 256] },
    { key: "w", type: "WireElm",        from: [304, 64],  to: [304, 128] },
    { key: "w", type: "WireElm",        from: [304, 256], to: [304, 352] },
    { key: "w", type: "WireElm",        from: [368, 192], to: [416, 192] },
    { key: "b", type: "LabeledNodeElm", from: [304, 64],  to: [304, 16],  text: "in" },
    { key: "b", type: "LabeledNodeElm", from: [304, 352], to: [304, 400], text: "in-" },
    { key: "b", type: "LabeledNodeElm", from: [416, 192], to: [480, 192], text: "out" },
    { key: "b", type: "LabeledNodeElm", from: [240, 192], to: [160, 192], text: "out-" },
];

// the circuit that uses it.  The chip and the A/C source are picked from the Draw menu; a
// routed wire goes around the corner from where it starts to where it ends
const outer: { key?: string; menu?: string[]; type: string; from: Pt; to: Pt; route?: string }[] = [
    { menu: ["Subcircuits", "Add fullrect"], type: "SubcircuitElm", from: [720, 368], to: [784, 432] },
    { menu: ["Inputs and Sources", "Add A/C Voltage Source (2-terminal)"], type: "ACVoltageElm",
      from: [672, 448], to: [672, 320] },
    { key: "r", type: "ResistorElm",   from: [864, 320], to: [864, 448] },
    { key: "Shift+W", type: "RoutedWireElm", from: [672, 320], to: [720, 368], route: "672,320;720,320;720,368" },
    { key: "Shift+W", type: "RoutedWireElm", from: [672, 448], to: [720, 400], route: "672,448;720,448;720,400" },
    { key: "Shift+W", type: "RoutedWireElm", from: [816, 368], to: [864, 320], route: "816,368;816,320;864,320" },
    { key: "Shift+W", type: "RoutedWireElm", from: [816, 400], to: [864, 448], route: "816,400;816,448;864,448" },
    { key: "g", type: "GroundElm",     from: [672, 448], to: [672, 464] },
];

const { SIDE_N, SIDE_S, SIDE_W, SIDE_E } = Sim;

const sortKey = (e: { type: string; x: number; y: number; x2: number; y2: number }) =>
    [e.type, e.x, e.y, e.x2, e.y2].join(" ");
const partKey = (p: { type: string; from: Pt; to: Pt }) =>
    sortKey({ type: p.type, x: p.from[0], y: p.from[1], x2: p.to[0], y2: p.to[1] });

test("build the full-wave rectifier subcircuit example from scratch, and it rectifies", async ({ sim, page }) => {
    // (building it takes a while, and running it takes a few seconds at the normal speed)
    test.slow();

    // ---- the subcircuit ----
    for (const p of inner)
        await sim.draw(p.key, ...p.from, ...p.to);
    await page.keyboard.press("Escape");
    expect((await sim.elements()).map(sortKey).sort()).toEqual(inner.map(partKey).sort());

    // name the labeled nodes
    for (const p of inner.filter(p => p.text != null)) {
        await sim.click((p.from[0] + p.to[0]) / 2, (p.from[1] + p.to[1]) / 2);
        await expect(sim.dialog).toBeVisible();
        await page.keyboard.type(p.text!);
        await page.keyboard.press("Enter");
        await expect(sim.dialog).toBeHidden();
    }

    // make it into a subcircuit.  Each labeled node becomes a pin on the side it points to
    // (so "in" starts out on top); drag them so the inputs are on the left and the outputs
    // on the right, then make the chip narrower, since nothing is on its top or bottom now
    await sim.menu("File", "Create Subcircuit...");
    await expect(sim.dialog).toBeVisible();
    const layout = async () => (await sim.pinLayout()).pins.map(p => [p.name, p.side, p.pos]);
    expect(await layout()).toEqual([["in", SIDE_N, 1], ["in-", SIDE_S, 1], ["out", SIDE_E, 0], ["out-", SIDE_W, 0]]);
    await sim.movePin("out-", SIDE_E, 1);
    await sim.movePin("in", SIDE_W, 0);
    await sim.movePin("in-", SIDE_W, 1);
    await sim.dialog.getByRole("button", { name: "-" }).first().click();    // width
    expect(await layout()).toEqual([["in", SIDE_W, 0], ["in-", SIDE_W, 1], ["out", SIDE_E, 0], ["out-", SIDE_E, 1]]);
    expect(await sim.pinLayout()).toMatchObject({ sizeX: 2, sizeY: 2 });
    await sim.dialog.getByRole("textbox").fill("fullrect");
    await sim.dialog.getByRole("button", { name: "OK" }).click();
    await expect(sim.dialog).toBeHidden();

    // ---- the circuit that uses it ----
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    expect(await sim.elements()).toHaveLength(0);

    for (const p of outer) {
        if (p.menu != null) {
            await sim.menu("Draw", ...p.menu);
            await sim.drag(...p.from, ...p.to);
        } else
            await sim.draw(p.key!, ...p.from, ...p.to);
    }
    await page.keyboard.press("Escape");
    expect((await sim.elements()).map(sortKey).sort()).toEqual(outer.map(partKey).sort());
    const details = await page.evaluate(() => (window as any).__app.elmList.map((e: any) =>
        [e.getClassName(), e.routePoints?.map((p: any) => p.x + "," + p.y).join(";") ?? e.model?.name ?? null]));
    expect(details.filter((d: any) => d[1] != null).sort()).toEqual([
        ["SubcircuitElm", "fullrect"], ...outer.filter(p => p.route != null).map(p => [p.type, p.route])].sort());

    // a new A/C source is 120V at 60 Hz, like the mains; make it 5V at 40 Hz
    await sim.click(672, 384);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.type("5");    // (into the first field, Max Voltage)
    await sim.field("Frequency (Hz)").fill("40");
    await sim.dialog.getByRole("button", { name: "OK" }).click();
    await expect(sim.dialog).toBeHidden();
    const src = await page.evaluate(() => {
        const e = (window as any).__app.elmList.find((e: any) => e.getClassName() === "ACVoltageElm");
        return [e.maxVoltage, e.frequency];
    });
    expect(src).toEqual([5, 40]);

    // the label: draw it with the text tool, then click it, type its text and make it smaller
    await sim.draw("t", 672, 304, 688, 304);    // (the text goes where the drag ends)
    await page.keyboard.press("Escape");
    await sim.clickElm(688, 304);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.type("double-click subcircuit to view");
    await sim.field("Size").fill("12");
    await sim.dialog.getByRole("button", { name: "OK" }).click();
    await expect(sim.dialog).toBeHidden();

    // view the resistor in a scope
    await sim.click(864, 384, { button: "right" });
    await page.locator(".elmContextMenu:visible").getByText("View in New Scope").click();
    const text = await page.evaluate(() => (window as any).__app.elmList
        .filter((e: any) => e.getClassName() === "TextElm").map((e: any) => [e.x, e.y, e.text, e.size]));
    expect(text).toEqual([[688, 304, "double-click subcircuit to view", 12]]);
    const scopes = await page.evaluate(() => {
        const sm = (window as any).__app.scopeManager;
        return sm.scopes.slice(0, sm.scopeCount).map((s: any) => ({
            elm: [s.getElm().x, s.getElm().y], speed: s.speed, plots: s.plots.map((p: any) => p.value) }));
    });
    expect(scopes).toEqual([{ elm: [864, 320], speed: 64, plots: [0, 3] }]);    // voltage and current

    // run it for a couple of cycles (it's 40 Hz), and check that while the source swings both ways,
    // the voltage across the resistor only goes one way
    await page.evaluate(() => {
        const app = (window as any).__app;
        const src = app.elmList.find((e: any) => e.getClassName() === "ACVoltageElm");
        const r = app.elmList.find((e: any) => e.getClassName() === "ResistorElm");
        const w = window as any;
        w.__range = { src: [0, 0], r: [0, 0] };
        // (nodes aren't there until the circuit is analyzed)
        const diff = (e: any) => e.nodes?.[0] && e.nodes?.[1] ? e.nodes[0].v - e.nodes[1].v : 0;
        const sample = () => {
            const rg = w.__range;
            // (the A/C source is drawn bottom to top, so it's positive at its second post)
            const vs = -diff(src), vr = diff(r);
            rg.src = [Math.min(rg.src[0], vs), Math.max(rg.src[1], vs)];
            rg.r = [Math.min(rg.r[0], vr), Math.max(rg.r[1], vr)];
            rg.t = app.sim.t;
            requestAnimationFrame(sample);
        };
        sample();
        app.setSimRunning(true);
    });
    await page.waitForFunction(() => (window as any).__range.t > 0.06, null, { timeout: 30000 });
    const range = await page.evaluate(() => (window as any).__range);
    expect(range.src[0]).toBeLessThan(-4.9);
    expect(range.src[1]).toBeGreaterThan(4.9);
    // (less two diode drops)
    expect(range.r[0]).toBeGreaterThan(-0.01);
    expect(range.r[1]).toBeGreaterThan(3);
    expect(range.r[1]).toBeLessThan(4.5);
});
