// What the UI tests share: a `sim` fixture that opens the app on a blank circuit (or one
// given with test.use({ circuit })) and helpers that work in circuit coordinates, so
// tests don't depend on where the canvas is or how it's zoomed.
//
// The app is reached through window.__app, which main.ts sets when the URL has ?uitest.

import { test as base, expect, type Page } from "@playwright/test";

export interface Elm {
    type: string;               // class name, like "ResistorElm"
    x: number; y: number; x2: number; y2: number;
    selected: boolean;
}

export class Sim {
    constructor(readonly page: Page) {}

    async open(circuit: string | null) {
        const params = new URLSearchParams({ uitest: "1", running: "false" });
        if (circuit == null)
            params.set("startCircuit", "blank.txt");
        else
            params.set("cct", circuit);
        await this.page.goto("circuitjs.html?" + params);
        await this.page.waitForFunction(() => (window as any).__app?.mouse != null);
    }

    // page coordinates of a point in the circuit
    async toPage(x: number, y: number): Promise<{ x: number; y: number }> {
        return this.page.evaluate(([x, y]) => {
            const app = (window as any).__app;
            const r = app.ui.cv.getBoundingClientRect();
            return { x: r.left + app.mouse.transformX(x) + 0.5, y: r.top + app.mouse.transformY(y) + 0.5 };
        }, [x, y]);
    }

    async move(x: number, y: number) {
        const p = await this.toPage(x, y);
        await this.page.mouse.move(p.x, p.y);
    }

    async click(x: number, y: number, opts: { button?: "left" | "right" } = {}) {
        const p = await this.toPage(x, y);
        await this.page.mouse.click(p.x, p.y, opts);
    }

    // clicks the middle of the element at (x, y), for elements like text that aren't drawn
    // between their two points
    async clickElm(x: number, y: number) {
        const c = await this.page.evaluate(([x, y]) => {
            const e = (window as any).__app.elmList.find((e: any) => e.x === x && e.y === y);
            const b = e.boundingBox;
            return [b.x + b.width / 2, b.y + b.height / 2];
        }, [x, y]);
        await this.click(c[0], c[1]);
    }

    async dblclick(x: number, y: number) {
        const p = await this.toPage(x, y);
        await this.page.mouse.dblclick(p.x, p.y);
    }

    async drag(x1: number, y1: number, x2: number, y2: number) {
        const a = await this.toPage(x1, y1), b = await this.toPage(x2, y2);
        await this.page.mouse.move(a.x, a.y);
        await this.page.mouse.down();
        // MouseManager won't drag an element until the button has been down 150ms
        await this.page.waitForTimeout(200);
        await this.page.mouse.move(b.x, b.y, { steps: 8 });
        await this.page.mouse.up();
    }

    // picks a tool by its keyboard shortcut, then drags out the element
    async draw(key: string, x1: number, y1: number, x2: number, y2: number) {
        await this.page.keyboard.press(key);
        await this.drag(x1, y1, x2, y2);
    }

    async elements(): Promise<Elm[]> {
        return this.page.evaluate(() => (window as any).__app.elmList.map((e: any) => ({
            type: e.getClassName(), x: e.x, y: e.y, x2: e.x2, y2: e.y2, selected: e.selected,
        })));
    }

    // a property of the nth element, like "resistance"
    async prop(n: number, name: string): Promise<any> {
        return this.page.evaluate(([n, name]) => (window as any).__app.elmList[n][name], [n, name] as const);
    }

    dump(): Promise<string> {
        return this.page.evaluate(() => (window as any).__app.dumpCircuit());
    }

    // the canvas the circuit is drawn on, for screenshots
    get canvas() { return this.page.locator(".canvasWrapper > canvas"); }

    // the open edit dialog
    get dialog() { return this.page.locator("dialog.circuitDialog[open]"); }

    // a text field in the open edit dialog, by the label above it (which isn't attached to it)
    field(label: string) {
        return this.dialog.locator(
            `xpath=.//label[normalize-space()="${label}"]/following-sibling::*[1]/descendant-or-self::input[1]`);
    }

    // picks a menu item: menu("Edit", "Undo"), or with submenus, menu("Draw", "Inputs and Sources", ...)
    async menu(...path: string[]) {
        const [top, ...rest] = path;
        // text() is the menu's own label, not the items in its dropdown
        await this.page.locator(`xpath=//td[contains(@class,"gwt-MenuItem")][normalize-space(text())="${top}"]`).click();
        for (let i = 0; i < rest.length; i++) {
            // (the innermost open dropdown comes last)
            const dropdown = this.page.locator(".menuDropdown:visible").last();
            if (i < rest.length - 1) {
                // a submenu's label is a text node in its item, beside the dropdown with its
                // items, so it can't be found by its text; hovering over it opens it
                await dropdown.locator(`xpath=./li[contains(@class,"hasSubmenu")][text()[normalize-space()="${rest[i]}"]]`).hover();
            } else
                await dropdown.getByText(rest[i], { exact: true }).click();
        }
    }
}

export const test = base.extend<{ circuit: string | null; sim: Sim }>({
    circuit: [null, { option: true }],
    sim: async ({ page, circuit }, use) => {
        // an exception in the app fails the test, even if nothing else noticed it
        const errors: string[] = [];
        page.on("pageerror", e => errors.push(e.stack ?? e.message));
        const sim = new Sim(page);
        await sim.open(circuit);
        await use(sim);
        expect(errors, "exceptions in the app").toEqual([]);
    },
});

export { expect };
