// What the UI tests share: a `sim` fixture that opens the app on a blank circuit (or one
// given with test.use({ circuit })) and helpers that work in circuit coordinates, so
// tests don't depend on where the canvas is or how it's zoomed.
//
// The app is reached through window.__app, which main.ts sets when the URL has ?uitest.

import { test as base, expect, type Locator, type Page } from "@playwright/test";

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

    // clicks the middle of the element at (x, y) (of the given class, if more than one starts
    // there), for elements like text and chips that aren't drawn between their two points
    async clickElm(x: number, y: number, opts: { type?: string; button?: "left" | "right" } = {}) {
        const c = await this.page.evaluate(([x, y, type]) => {
            const e = (window as any).__app.elmList.find((e: any) => e.x === x && e.y === y &&
                (type == null || e.getClassName() === type));
            const b = e.boundingBox;
            return [b.x + b.width / 2, b.y + b.height / 2];
        }, [x, y, opts.type ?? null] as const);
        await this.click(c[0], c[1], { button: opts.button });
    }

    async dblclick(x: number, y: number) {
        const p = await this.toPage(x, y);
        await this.page.mouse.dblclick(p.x, p.y);
    }

    async drag(x1: number, y1: number, x2: number, y2: number) {
        const a = await this.toPage(x1, y1), b = await this.toPage(x2, y2);
        // picking a tool starts loading its element's class, if nothing has used it yet, and
        // until it's loaded, pressing the mouse doesn't start a new one (see
        // CirSim.preloadClass())
        await this.page.waitForFunction(() => {
            const app = (window as any).__app;
            return app.constructor.isClassLoaded(app.ui.mouseModeStr);
        });
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

    // waits until the circuit has been analyzed since it last changed (which happens on the
    // next frame).  Some things are only worked out then, like how wide a bus a wire carries.
    async analyzed() {
        await this.page.waitForFunction(() => !(window as any).__app.analyzeFlag);
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

    // a text field, dropdown or multi-line text field in the open edit dialog, by the label
    // above it (which isn't attached to it)
    field(label: string) { return this.labeled(label, "input"); }
    choice(label: string) { return this.labeled(label, "select"); }
    textArea(label: string) { return this.labeled(label, "textarea"); }
    private labeled(label: string, tag: string) {
        return this.dialog.locator(
            `xpath=.//label[normalize-space()="${label}"]/following-sibling::*[1]/descendant-or-self::${tag}[1]`);
    }

    // ---- the subcircuit pin layout editor (in the open Create Subcircuit dialog) ----

    // the pins, in the order the subcircuit lists them: name, side, position along the side,
    // and where the pin is on the editor's canvas
    pinLayout(): Promise<{ pins: { name: string; side: number; pos: number; at: [number, number] }[];
                           sizeX: number; sizeY: number }> {
        return this.page.evaluate(() => {
            const ed = (window as any).__app.constructor.dialogShowing.editor;
            return {
                pins: ed.entries.map((e: any, i: number) => ({
                    name: e.name, side: e.side, pos: e.pos,
                    at: [ed.chip.pins[i].textloc.x / ed.scale, ed.chip.pins[i].textloc.y / ed.scale],
                })),
                sizeX: ed.chip.sizeX, sizeY: ed.chip.sizeY,
            };
        });
    }

    // drags a pin to a side (Sim.SIDE_N etc.), at a position along it
    async movePin(name: string, side: number, pos: number) {
        const box = (await this.dialog.locator("canvas").boundingBox())!;
        const from = (await this.pinLayout()).pins.find(p => p.name === name)!.at;
        // where to drop it: just outside the chip, beside that position
        const to = await this.page.evaluate(([side, pos]) => {
            const ed = (window as any).__app.constructor.dialogShowing.editor;
            const c = ed.chip;
            // (see ChipElm.getPinPos: in units of pin spacing, the chip's body is from 0 to
            // sizeX across and 0 to sizeY down, with a pin's position rounded from where it is
            // along its side.  So position 0 is right at a corner: go a little past it, so it
            // isn't taken as being on the other side of the corner)
            const xr = c.x + c.cspc2 - c.cspc, yr = c.y - c.cspc;
            const xd = side === 2 ? -0.5 : side === 3 ? c.sizeX + 0.5 : pos + 0.2;
            const yd = side === 0 ? -0.5 : side === 1 ? c.sizeY + 0.5 : pos + 0.2;
            return [(xr + (xd + 0.5) * c.cspc2) / ed.scale, (yr + (yd + 0.5) * c.cspc2) / ed.scale];
        }, [side, pos]);
        await this.page.mouse.move(box.x + from[0], box.y + from[1]);
        await this.page.mouse.down();
        await this.page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 });
        await this.page.mouse.up();
    }

    static readonly SIDE_N = 0;
    static readonly SIDE_S = 1;
    static readonly SIDE_W = 2;
    static readonly SIDE_E = 3;

    // picks a menu item: menu("Edit", "Undo"), or with submenus, menu("Draw", "Inputs and Sources", ...)
    async menu(...path: string[]) {
        const [top, ...rest] = path;
        // text() is the menu's own label, not the items in its dropdown
        await this.page.locator(`xpath=//td[contains(@class,"gwt-MenuItem")][normalize-space(text())="${top}"]`).click();
        await this.menuPath(this.page.locator(".menuDropdown:visible").last(), rest);
    }

    // right-clicks at (x, y) in the circuit, and picks an item from the menu that pops up.  On
    // an empty spot, that's the same as the Draw menu: contextMenu(x, y, "Inputs and Sources", ...)
    async contextMenu(x: number, y: number, ...path: string[]) {
        await this.click(x, y, { button: "right" });
        await this.menuPath(this.page.locator(".elmContextMenu:visible"), path);
    }

    // picks an item from an open menu, going through submenus on the way
    private async menuPath(menu: Locator, path: string[]) {
        for (let i = 0; i < path.length; i++) {
            // (the innermost open submenu comes last)
            const dropdown = i === 0 ? menu : this.page.locator(".menuDropdown:visible").last();
            if (i < path.length - 1) {
                // a submenu's label is a text node in its item, beside the dropdown with its
                // items, so it can't be found by its text; hovering over it opens it
                await dropdown.locator(`xpath=./li[contains(@class,"hasSubmenu")][text()[normalize-space()="${path[i]}"]]`).hover();
            } else
                await dropdown.getByText(path[i], { exact: true }).click();
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
