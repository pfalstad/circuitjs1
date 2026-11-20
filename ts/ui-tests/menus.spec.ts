import { test, expect } from "./fixtures";

test("Edit > Undo from the menu bar", async ({ sim }) => {
    await sim.draw("r", 96, 96, 192, 96);
    await sim.menu("Edit", "Undo");
    expect(await sim.elements()).toHaveLength(0);
});

test.describe("with a circuit loaded", () => {
    test.use({ circuit: "$ 1 5.0E-6 10 50 5.0\nr 256 176 256 304 0 100.0\nw 256 304 256 336 1\n" });

    test("starts with the circuit's elements", async ({ sim }) => {
        expect((await sim.elements()).map(e => e.type)).toEqual(["ResistorElm", "WireElm"]);
    });

    test("right-click opens the element's context menu", async ({ sim, page }) => {
        await sim.click(256, 240, { button: "right" });
        await expect(page.getByText("Edit...", { exact: false }).first()).toBeVisible();
    });
});

const paletteShowing = (page: import("@playwright/test").Page) =>
    page.evaluate(() => !!(window as any).__app.constructor.commandPalette?.isShowing());

test("double-tapping Shift opens the command palette", async ({ sim, page }) => {
    await page.keyboard.press("Shift");
    await page.keyboard.press("Shift");
    expect(await paletteShowing(page)).toBe(true);
});

test("a Shift shortcut followed quickly by Shift isn't a double tap", async ({ sim, page }) => {
    await page.keyboard.press("Shift+W");
    await page.keyboard.press("Shift");
    expect(await paletteShowing(page)).toBe(false);
});

test("two Shift shortcuts in quick succession aren't a double tap", async ({ sim, page }) => {
    await page.keyboard.press("Shift+W");
    await page.keyboard.press("Shift+V");
    expect(await paletteShowing(page)).toBe(false);
});

test("a shift-drag followed quickly by Shift isn't a double tap", async ({ sim, page }) => {
    await page.keyboard.down("Shift");
    await sim.drag(96, 96, 192, 96);
    await page.keyboard.up("Shift");
    await page.keyboard.press("Shift");
    expect(await paletteShowing(page)).toBe(false);
});

test("a click between two Shift taps means they aren't a double tap", async ({ sim, page }) => {
    await page.keyboard.press("Shift");
    await sim.click(96, 96);
    await page.keyboard.press("Shift");
    expect(await paletteShowing(page)).toBe(false);
});

test.describe("picking a tool in the touch layout", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test("closes the menu and the sidebar, leaving the canvas free", async ({ sim, page }) => {
        // what a user has open when they pick an element: the sidebar and the hamburger menu list
        // (sidebar first: the open menu bar covers the top of the screen)
        await page.locator(".triggerLabel").click();
        await page.locator(".toptriggerlabel").click();
        await expect(page.locator("input.toptrigger")).toBeChecked();
        await expect(page.locator("input.trigger")).toBeChecked();

        await sim.menu("Draw", "Add Resistor");

        await expect(page.locator("input.toptrigger")).not.toBeChecked();
        await expect(page.locator("input.trigger")).not.toBeChecked();
        await expect(page.locator(".gwt-MenuBar-horizontal > table")).toBeHidden();
        expect(await page.locator(".menuDropdown:visible").count()).toBe(0);

        // and the picked element can still be placed
        await sim.drag(96, 96, 192, 96);
        expect((await sim.elements()).map(e => e.type)).toEqual(["ResistorElm"]);
    });
});

test("picking a tool leaves the desktop sidebar alone", async ({ sim, page }) => {
    await sim.menu("Draw", "Add Resistor");
    expect(await page.locator(".menuDropdown:visible").count()).toBe(0);
    const width = await page.locator(".verticalPanel").evaluate(el => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(100);
});
