import { test, expect } from "./fixtures";

// Builds the astable multivibrator (public/circuits/multivib-a.txt) from scratch with the
// mouse and keyboard, the way a user would: pick each part by its shortcut key and drag it
// out, then click each part that needs a value and type it into its properties.  Then runs
// it and checks that it oscillates.  Also adds its labels and undocked scopes.

// each part: the tool's shortcut key, where to drag it from and to, and the value to type
// into its properties (if it doesn't keep the default)
const parts: { key: string; type: string; from: [number, number]; to: [number, number]; value?: string }[] = [
    { key: "w", type: "WireElm",       from: [112, 48],  to: [208, 48] },
    { key: "w", type: "WireElm",       from: [208, 48],  to: [288, 48] },
    { key: "w", type: "WireElm",       from: [288, 48],  to: [384, 48] },
    { key: "r", type: "ResistorElm",   from: [112, 48],  to: [112, 176], value: "330" },
    { key: "r", type: "ResistorElm",   from: [208, 48],  to: [208, 176], value: "1020" },
    { key: "r", type: "ResistorElm",   from: [288, 48],  to: [288, 176], value: "1020" },
    { key: "r", type: "ResistorElm",   from: [384, 48],  to: [384, 176], value: "320" },
    { key: "c", type: "CapacitorElm",  from: [112, 176], to: [208, 176], value: "18u" },
    { key: "c", type: "CapacitorElm",  from: [384, 176], to: [288, 176], value: "18u" },
    { key: "w", type: "WireElm",       from: [384, 176], to: [384, 240] },
    { key: "n", type: "NTransistorElm", from: [288, 256], to: [384, 256] },
    { key: "w", type: "WireElm",       from: [208, 176], to: [288, 256] },
    { key: "w", type: "WireElm",       from: [288, 176], to: [208, 256] },
    { key: "n", type: "NTransistorElm", from: [208, 256], to: [112, 256] },
    { key: "w", type: "WireElm",       from: [112, 176], to: [112, 240] },
    { key: "Shift+V", type: "RailElm", from: [112, 48],  to: [64, 48] },
    { key: "g", type: "GroundElm",     from: [112, 272], to: [112, 304] },
    { key: "g", type: "GroundElm",     from: [384, 272], to: [384, 304] },
];

// the labels (placed on the grid points nearest where they are in the file)
const labels: { at: [number, number]; text: string }[] = [
    { at: [160, 208], text: "C1" },
    { at: [320, 208], text: "C2" },
    { at: [80, 256],  text: "Q1" },
    { at: [400, 256], text: "Q2" },
];

// the undocked scopes: the element each one views (and a point on it to right-click, clear
// of anything else), and the box to drag the scope's corners out to.  A new scope is 128x64,
// below and to the right of the element, and its corners and center can be on top of other
// elements, so before grabbing a corner the test hovers over a point inside it that's clear
// of everything else (which stays inside it while the top-left corner is dragged to its place)
const scopes: { elm: [number, number]; click: [number, number]; hover: [number, number];
                box: [number, number, number, number] }[] = [
    { elm: [288, 176], click: [268, 196], hover: [440, 280], box: [192, 208, 224, 240] },  // Q1's base
    { elm: [208, 176], click: [228, 196], hover: [300, 284], box: [272, 208, 304, 240] },  // Q2's base
    { elm: [384, 176], click: [336, 176], hover: [540, 280], box: [320, 128, 352, 160] },  // C2
    { elm: [112, 176], click: [160, 176], hover: [250, 284], box: [144, 128, 176, 160] },  // C1
];

const sortKey = (e: { type: string; x: number; y: number; x2: number; y2: number }) =>
    [e.type, e.x, e.y, e.x2, e.y2].join(" ");

test("build the astable multivibrator from scratch, and it oscillates", async ({ sim, page }) => {
    // (building it takes a while, and running it takes a few seconds at the normal speed)
    test.slow();

    for (const p of parts)
        await sim.draw(p.key, ...p.from, ...p.to);
    await page.keyboard.press("Escape");    // back to the select tool

    // every part landed where it was dragged (none was split, merged or dropped)
    const elms = await sim.elements();
    expect(elms.map(sortKey).sort()).toEqual(parts.map(p =>
        sortKey({ type: p.type, x: p.from[0], y: p.from[1], x2: p.to[0], y2: p.to[1] })).sort());

    // set the values: clicking a part brings up its properties with its value field focused,
    // ready to type into
    for (const p of parts.filter(p => p.value != null)) {
        await sim.click((p.from[0] + p.to[0]) / 2, (p.from[1] + p.to[1]) / 2);
        await expect(sim.dialog).toBeVisible();
        await page.keyboard.type(p.value!);
        await page.keyboard.press("Enter");
        await expect(sim.dialog).toBeHidden();
    }
    const values = await page.evaluate(() => (window as any).__app.elmList
        .filter((e: any) => e.resistance != null || e.capacitance != null)
        .map((e: any) => [e.x, e.y, e.resistance ?? e.capacitance]));
    expect(values.sort()).toEqual([
        [112, 48, 330], [208, 48, 1020], [288, 48, 1020], [384, 48, 320],
        [112, 176, 18e-6], [384, 176, 18e-6],
    ].sort());

    // the labels: draw each with the text tool, then click it and type its text
    for (const l of labels) {
        // (the text goes where the drag ends)
        await sim.draw("t", l.at[0] - 16, l.at[1], ...l.at);
        await page.keyboard.press("Escape");
        await sim.clickElm(l.at[0], l.at[1]);
        await expect(sim.dialog).toBeVisible();
        await page.keyboard.type(l.text);
        // (the text is multi-line, so Enter would start a new line)
        await sim.dialog.getByRole("button", { name: "OK" }).click();
        await expect(sim.dialog).toBeHidden();
    }
    const texts = await page.evaluate(() => (window as any).__app.elmList
        .filter((e: any) => e.getClassName() === "TextElm").map((e: any) => [e.x, e.y, e.text]));
    expect(texts).toEqual(labels.map(l => [...l.at, l.text]));

    // the scopes: right-click the element, view it in a new undocked scope, then drag the
    // scope's top-left and bottom-right corners to where it goes, and set its properties
    // (an element's bounding box is only set when it's drawn, so a scope that was just created
    // or moved can't be found under the mouse until the next frame: keep moving the mouse onto
    // it until it is)
    const hoverScope = async (at: [number, number]) => {
        await expect.poll(async () => {
            await sim.move(at[0] + 1, at[1]);
            await sim.move(...at);
            return page.evaluate(() => (window as any).__app.mouse.getMouseElm()?.isScopeElm());
        }).toBe(true);
    };
    for (const sc of scopes) {
        await sim.click(...sc.click, { button: "right" });
        await page.locator(".elmContextMenu:visible").getByText("View in New Undocked Scope").click();
        const at = await page.evaluate(() => {
            const elms = (window as any).__app.elmList;
            const s = elms[elms.length - 1];
            return [s.x, s.y, s.x2, s.y2];
        });
        await hoverScope(sc.hover);
        await sim.drag(at[0], at[1], sc.box[0], sc.box[1]);
        await hoverScope(sc.hover);
        await sim.drag(at[2], at[3], sc.box[2], sc.box[3]);

        // then turn off its peak value display in its properties
        await sim.click((sc.box[0] + sc.box[2]) / 2, (sc.box[1] + sc.box[3]) / 2, { button: "right" });
        await page.locator(".elmContextMenu:visible").getByText("Properties...").click();
        await expect(sim.dialog).toBeVisible();
        await sim.dialog.getByLabel("Show Peak Value").uncheck();
        await sim.dialog.getByRole("button", { name: "OK" }).click();
        await expect(sim.dialog).toBeHidden();
    }
    const scopeElms = await page.evaluate(() => (window as any).__app.elmList
        .filter((e: any) => e.isScopeElm()).map((e: any) => {
            const v = e.elmScope.getElm();
            return { elm: [v.x, v.y], box: [e.x, e.y, e.x2, e.y2], showPeak: e.elmScope.showMax };
        }));
    expect(scopeElms).toEqual(scopes.map(sc => ({ elm: sc.elm, box: sc.box, showPeak: false })));

    // run it, and watch Q1's collector (the transistor at 208,256) swing between on and off.
    // Each half-period is about 0.7 * 1020 ohms * 18uF, or 13ms.
    await page.evaluate(() => {
        const app = (window as any).__app;
        const q1 = app.elmList.find((e: any) => e.x === 208 && e.y === 256);
        const w = window as any;
        w.__swings = 0;
        let high: boolean | null = null;
        const sample = () => {
            // (post 1 is the collector; its nodes aren't there until the circuit is analyzed)
            const vc = q1.nodes?.[1]?.v ?? 2.5;
            const h = vc > 2.5 ? true : vc < 0.5 ? false : high;
            if (high != null && h !== high)
                w.__swings++;
            high = h;
            requestAnimationFrame(sample);
        };
        sample();
        app.setSimRunning(true);
    });
    await page.waitForFunction(() => (window as any).__swings >= 4, null, { timeout: 30000 });
});
