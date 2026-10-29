import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { CircuitElm } from "./CircuitElm";
import { ChipElm } from "./ChipElm";
import { CounterElm } from "./CounterElm";
import { PinLayoutModel } from "./PinLayoutModel";

const off = { getState: () => false };

beforeAll(() => {
    (CircuitElm as any).app = {
        mouse: { dragElm: null },
        menus: {
            showValuesCheckItem: off, powerCheckItem: off, euroResistorCheckItem: off,
            showOhmCheckItem: off, smallGridCheckItem: off,
        },
    };
});

beforeEach(() => PinLayoutModel.registry.reset());

function makeCounter(): CounterElm {
    const c = new CounterElm(100, 100);
    c.x2 = 200; c.y2 = 100;
    c.setPoints();
    return c;
}

// a layout for the chip with all its pins moved to the north side
function northLayout(c: ChipElm): PinLayoutModel {
    const m = new PinLayoutModel();
    m.name = "north";
    m.elmType = c.getXmlDumpType();
    m.sizeX = c.getPostCount();
    m.sizeY = 2;
    m.pins = c.pins.slice(0, c.getPostCount()).map((p, i) => ({ name: p.text, side: ChipElm.SIDE_N, pos: i }));
    PinLayoutModel.registry.setLocal(m);
    return m;
}

function findEditInfo(c: ChipElm, pred: (ei: any) => boolean): number {
    for (let n = 0; ; n++) {
        const ei = c.getEditInfo(n);
        if (ei === null) return -1;
        if (pred(ei)) return n;
    }
}

describe("pin layout models", () => {
    it("moves pins and resizes the chip, and goes back to the default layout", () => {
        const c = makeCounter();
        const defSizeX = c.sizeX, defSizeY = c.sizeY;
        const defSides = c.pins.map(p => p.side0);
        const m = northLayout(c);
        expect(c.pinLayoutFits(m)).toBe(true);

        c.setPinLayout(m);
        expect(c.sizeX).toBe(c.getPostCount());
        expect(c.sizeY).toBe(2);
        c.pins.forEach((p, i) => {
            expect(p.side).toBe(ChipElm.SIDE_N);
            expect(p.pos).toBe(i);
        });

        c.setPinLayout(null);
        expect(c.sizeX).toBe(defSizeX);
        expect(c.sizeY).toBe(defSizeY);
        expect(c.pins.map(p => p.side0)).toEqual(defSides);
    });

    it("doesn't apply to chips with different pins or of another type", () => {
        const c = makeCounter();
        const m = northLayout(c);
        m.pins[0] = { ...m.pins[0], name: "X" };
        expect(c.pinLayoutFits(m)).toBe(false);
        const m2 = northLayout(c);
        m2.elmType = "something else";
        expect(c.pinLayoutFits(m2)).toBe(false);
        const m3 = northLayout(c);
        m3.pins[0] = { ...m3.pins[0], pos: m3.sizeX };
        expect(c.pinLayoutFits(m3)).toBe(false);
    });

    it("keeps the layout through setupPins() + setPoints()", () => {
        const c = makeCounter();
        c.setPinLayout(northLayout(c));
        c.setupPins();
        c.setPoints();
        expect(c.pins.every(p => p.side === ChipElm.SIDE_N)).toBe(true);
    });

    it("locks structural fields while a layout is attached", () => {
        const c = makeCounter();
        const bitsIdx = findEditInfo(c, ei => ei.name === "# of Bits");
        expect(bitsIdx).toBeGreaterThanOrEqual(0);
        expect(c.getEditInfo(bitsIdx)!.disabled).toBe(false);
        c.setPinLayout(northLayout(c));
        expect(c.getEditInfo(bitsIdx)!.disabled).toBe(true);
        // non-structural fields aren't locked
        const modIdx = findEditInfo(c, ei => ei.name === "Modulus");
        expect(c.getEditInfo(modIdx)!.disabled).toBe(false);
    });

    it("lists fitting layouts after the chip's own fields and attaches the selected one", () => {
        const c = makeCounter();
        const m = northLayout(c);
        const other = new PinLayoutModel();
        other.name = "other";
        other.elmType = "nope";
        PinLayoutModel.registry.setLocal(other);

        const idx = findEditInfo(c, ei => ei.name === "Pin Layout");
        expect(idx).toBeGreaterThan(0);
        const ei = c.getEditInfo(idx)!;
        expect(ei.choice!.items).toEqual(["Default", "north"]);
        ei.choice!.selectedIndex = 1;
        (ei.choice as any).element = null;
        c.setEditValue(idx, ei);
        expect(c.pinLayout).toBe(m);
        expect(ei.newDialog).toBe(true);
    });

    it("drops the layout if an edit changes the pins anyway", () => {
        const c = makeCounter();
        c.setPinLayout(northLayout(c));
        const bitsIdx = findEditInfo(c, ei => ei.name === "# of Bits");
        const ei = c.getEditInfo(bitsIdx)!;
        ei.value = c.bits + 1;
        c.setEditValue(bitsIdx, ei);
        expect(c.pinLayout).toBe(null);
        expect(c.pinLayoutName).toBe(null);
        expect(ei.newDialog).toBe(true);
    });

    it("follows a renamed model and finds a model by name in updateModels()", () => {
        const c = makeCounter();
        const m = northLayout(c);
        c.setPinLayout(m);
        PinLayoutModel.registry.rename(m, "renamed");
        c.updateModels();
        expect(c.pinLayoutName).toBe("renamed");

        const c2 = makeCounter();
        c2.pinLayoutName = "renamed";
        c2.updateModels();
        expect(c2.pinLayout).toBe(m);
        expect(c2.pins.every(p => p.side === ChipElm.SIDE_N)).toBe(true);
    });
});
