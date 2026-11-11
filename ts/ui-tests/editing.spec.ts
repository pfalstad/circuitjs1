import { test, expect } from "./fixtures";

test("draw a resistor", async ({ sim }) => {
    await sim.draw("r", 96, 96, 192, 96);
    const elms = await sim.elements();
    expect(elms).toHaveLength(1);
    expect(elms[0]).toMatchObject({ type: "ResistorElm", x: 96, y: 96, x2: 192, y2: 96 });
});

test("edit a resistor's value in its dialog", async ({ sim }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await sim.dblclick(144, 96);
    await expect(sim.dialog).toBeVisible();
    await sim.dialog.getByRole("textbox").first().fill("4.7k");
    await sim.dialog.getByRole("button", { name: "OK" }).click();
    await expect(sim.dialog).toBeHidden();
    expect(await sim.prop(0, "resistance")).toBe(4700);
});

test("undo and redo", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await sim.draw("c", 96, 192, 192, 192);
    expect(await sim.elements()).toHaveLength(2);
    await page.keyboard.press("Control+z");
    expect((await sim.elements()).map(e => e.type)).toEqual(["ResistorElm"]);
    await page.keyboard.press("Control+y");
    expect((await sim.elements()).map(e => e.type)).toEqual(["ResistorElm", "CapacitorElm"]);
});

test("move an element by dragging it", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.drag(144, 96, 144, 150);    // snaps to the grid
    expect((await sim.elements())[0]).toMatchObject({ x: 96, y: 144, x2: 192, y2: 144 });
});

test("clicking an element opens its properties", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sim.dialog).toBeHidden();
});

test("select with a drag box and delete", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await sim.draw("w", 192, 160, 192, 256);
    await page.keyboard.press("Escape");
    await sim.drag(64, 64, 224, 128);      // around the resistor only
    expect((await sim.elements()).map(e => e.selected)).toEqual([true, false]);
    await page.keyboard.press("Delete");
    expect((await sim.elements()).map(e => e.type)).toEqual(["WireElm"]);
});

test("delete the element under the mouse", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await sim.draw("w", 192, 160, 192, 256);
    await page.keyboard.press("Escape");
    await sim.move(192, 208);
    await page.keyboard.press("Delete");
    expect((await sim.elements()).map(e => e.type)).toEqual(["ResistorElm"]);
});

test("copy and paste", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    const elms = await sim.elements();
    expect(elms).toHaveLength(2);
    expect(elms[1]!.type).toBe("ResistorElm");
    expect(elms[1]!.x).not.toBe(96);
});

test("Delete right after clicking an element deletes it, not the value in its properties", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.press("Delete");
    await expect(sim.dialog).toBeHidden();
    expect(await sim.elements()).toHaveLength(0);
});

test("Backspace right after clicking an element deletes it", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.press("Backspace");
    await expect(sim.dialog).toBeHidden();
    expect(await sim.elements()).toHaveLength(0);
});

test("Ctrl-C right after clicking an element copies it", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.press("Control+c");
    await expect(sim.dialog).toBeHidden();
    await page.keyboard.press("Control+v");
    expect((await sim.elements()).map(e => e.type)).toEqual(["ResistorElm", "ResistorElm"]);
});

test("Ctrl-X right after clicking an element cuts it", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.press("Control+x");
    await expect(sim.dialog).toBeHidden();
    expect(await sim.elements()).toHaveLength(0);
    await page.keyboard.press("Control+v");
    expect((await sim.elements()).map(e => e.type)).toEqual(["ResistorElm"]);
});

test("a tool shortcut right after clicking an element picks the tool", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.press("c");
    await expect(sim.dialog).toBeHidden();
    await sim.drag(96, 192, 192, 192);
    expect((await sim.elements()).map(e => e.type)).toEqual(["ResistorElm", "CapacitorElm"]);
});

test("typing a number right after clicking an element edits its value", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.type("47k");
    await page.keyboard.press("Enter");
    expect(await sim.prop(0, "resistance")).toBe(47000);
});

test("right-clicking closes the properties", async ({ sim, page }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await sim.click(144, 96, { button: "right" });
    await expect(sim.dialog).toBeHidden();
});

test("Delete right after clicking a wire (only checkboxes in its properties) deletes it", async ({ sim, page }) => {
    await sim.draw("w", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.press("Delete");
    await expect(sim.dialog).toBeHidden();
    expect(await sim.elements()).toHaveLength(0);
});

test("a tool shortcut right after clicking a diode (no text fields in its properties) picks the tool", async ({ sim, page }) => {
    await sim.draw("d", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.press("r");
    await expect(sim.dialog).toBeHidden();
    await sim.drag(96, 192, 192, 192);
    expect((await sim.elements()).map(e => e.type)).toEqual(["DiodeElm", "ResistorElm"]);
});

test("Space right after clicking an element leaves its properties open", async ({ sim, page }) => {
    await sim.draw("w", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await page.keyboard.press(" ");
    await expect(sim.dialog).toBeVisible();
});

test("a plain wire's properties don't offer the bus value options", async ({ sim, page }) => {
    await sim.draw("w", 96, 96, 192, 96);
    await page.keyboard.press("Escape");
    await sim.click(144, 96);
    await expect(sim.dialog).toBeVisible();
    await expect(sim.dialog.getByRole("checkbox")).toHaveCount(2);
    await expect(sim.dialog.getByText("Show Bus Value")).toHaveCount(0);
});

test("hovering over a new pin of a bus splitter that was made wider", async ({ sim, page }) => {
    await sim.menu("Draw", "Digital Chips", "Add Bus Splitter");
    await sim.drag(96, 96, 128, 96);
    await page.keyboard.press("Escape");
    await sim.clickElm(96, 96);
    await sim.field("# of Bits").fill("8");
    await sim.dialog.getByRole("button", { name: "OK" }).click();
    // hover over each of its pins (the fixture fails the test if this throws an exception)
    const posts: [number, number][] = await page.evaluate(() => {
        const e = (window as any).__app.elmList[0];
        return [...Array(e.getPostCount()).keys()].map(i => [e.getPost(i).x, e.getPost(i).y]);
    });
    expect(posts).toHaveLength(16);
    for (const p of posts) {
        await sim.move(...p);
        await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
    }
});

test("draw an instruction display", async ({ sim }) => {
    // (the fixture fails the test if drawing it while it's dragged out throws an exception)
    await sim.menu("Draw", "Outputs and Labels", "Add Instruction Display");
    await sim.drag(96, 96, 160, 96);
    expect((await sim.elements()).map(e => e.type)).toEqual(["InstructionDisplayElm"]);
});
