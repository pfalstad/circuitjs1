import { describe, it, expect, beforeEach } from "vitest";
import { CommandPaletteRegistry, PaletteCommand } from "./CommandPaletteRegistry";

// The menu-bar search field only supplies the UI (input, dropdown, keys);
// ranking lives in CommandPaletteRegistry.searchComponents(). These tests feed
// it a fixed command list, shaped like the entries buildStatic() registers.
function component(cls: string, english: string, label: string, extraTerms?: string, hint?: string) {
    let keywords = cls + " ";
    if (extraTerms != null)
        keywords += extraTerms + " ";
    keywords += english + " " + label;
    return new PaletteCommand({
        id: "main:" + cls,
        label,
        category: "Mode",
        keywords,
        menu: "main",
        item: cls,
        hint,
    });
}

function register(...cmds: PaletteCommand[]) {
    for (const c of cmds)
        CommandPaletteRegistry.componentCommands.push(c);
}

const ids = (query: string, max = 12) =>
    CommandPaletteRegistry.searchComponents(query, max).map(c => c.id);

describe("CommandPaletteRegistry.searchComponents", () => {
    beforeEach(() => {
        CommandPaletteRegistry.componentCommands = [];
    });

    it("returns nothing for an empty or whitespace query", () => {
        register(component("ResistorElm", "Add Resistor", "Widerstand einfügen"));
        expect(CommandPaletteRegistry.searchComponents("", 12)).toEqual([]);
        expect(CommandPaletteRegistry.searchComponents("   ", 12)).toEqual([]);
    });

    it("matches a prefix of the localized label", () => {
        register(
            component("ResistorElm", "Add Resistor", "Widerstand einfügen"),
            component("CapacitorElm", "Add Capacitor", "Kondensator einfügen"),
        );
        expect(ids("widerst")).toEqual(["main:ResistorElm"]);
    });

    it("finds a part by its English name in a non-English UI", () => {
        register(
            component("ResistorElm", "Add Resistor", "Widerstand einfügen"),
            component("PhotoresistorElm", "Add Photoresistor", "Fotoresistor hinzufügen"),
        );
        // Both contain "resistor"; the keyword hit on the English label must
        // outrank the substring inside the German "Fotoresistor" label.
        expect(ids("resistor")).toEqual(["main:ResistorElm", "main:PhotoresistorElm"]);
    });

    it("ranks a standalone word above the same letters inside a longer word", () => {
        register(
            component("XElm", "Add Vxgnds Thing", "Vxgnds"),
            component("GroundElm", "Add Ground", "Masse", "gnd"),
        );
        // "gnd" sits inside "vxgnds" for XElm and stands alone for Ground.
        expect(ids("gnd")[0]).toBe("main:GroundElm");
    });

    it("matches abbreviations from the locale catalogs", () => {
        register(
            component("OpAmpElm", "Add Op-Amp", "Operationsverstärker", "opv"),
            component("PolarCapacitorElm", "Add Capacitor (Polarized)", "Elektrolytkondensator", "elko"),
            component("TransformerElm", "Add Transformer", "Transformator", "trafo"),
        );
        expect(ids("opv")).toEqual(["main:OpAmpElm"]);
        expect(ids("elko")).toEqual(["main:PolarCapacitorElm"]);
        expect(ids("trafo")).toEqual(["main:TransformerElm"]);
    });

    it("falls back to a fuzzy subsequence for the odd typo", () => {
        register(component("OpAmpElm", "Add Op-Amp", "Operationsverstärker"));
        // "opamp" is not a substring of "add op-amp ..." but a dense subsequence.
        expect(ids("opamp")).toEqual(["main:OpAmpElm"]);
    });

    it("rejects scattered letters instead of matching half the menu", () => {
        register(component("ResistorElm", "Add Resistor", "Widerstand einfügen"));
        // r-s-t-r are all in "resistor", but spread out and not worth a hit.
        expect(ids("rstr")).toEqual([]);
    });

    it("does not match against the category text", () => {
        register(component("ResistorElm", "Add Resistor", "Widerstand einfügen", undefined, "Passive Components"));
        // A query on the hint would otherwise hit every part in that submenu.
        expect(ids("passive")).toEqual([]);
    });

    it("caps the result list", () => {
        for (let i = 0; i < 20; i++)
            register(component("Elm" + i, "Add Resistor " + i, "Widerstand " + i));
        expect(CommandPaletteRegistry.searchComponents("widerstand", 12)).toHaveLength(12);
    });
});