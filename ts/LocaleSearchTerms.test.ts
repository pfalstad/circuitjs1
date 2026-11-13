/// <reference types="node" />
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Project, SyntaxKind } from "ts-morph";

// A "search:<ElmClass>" entry only earns its line if it adds a word that no
// other indexed text contains. The index is class name + English label +
// localized label, so "cap" for CapacitorElm or "cccs" for CCCSElm are dead
// weight: they cannot produce a hit the class name or the label does not
// already produce. This test keeps the catalogs honest, so the abbreviation
// mechanism stays a short list of real synonyms instead of drifting into a
// copy of the element names.

const here = path.dirname(fileURLToPath(import.meta.url));
const localeDir = path.join(here, "public", "locale");

function elementLabels(): Map<string, string> {
    // Same pairs the Draw menu is built from: makeClassCheckItems(menu, ["Add
    // Resistor", "ResistorElm", ...]). Read from source so the test cannot
    // drift from the menu.
    const project = new Project();
    const source = project.addSourceFileAtPath(path.join(here, "Menus.ts"));
    const labels = new Map<string, string>();
    for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        if (!call.getExpression().getText().endsWith("makeClassCheckItems"))
            continue;
        const list = call.getArguments()[1];
        if (list == null || !list.isKind(SyntaxKind.ArrayLiteralExpression))
            continue;
        const items = list.getElements();
        for (let i = 0; i + 1 < items.length; i += 2) {
            const label = items[i].getText().replace(/^["']|["']$/g, "");
            const cls = items[i + 1].getText().replace(/^["']|["']$/g, "").split(":")[0];
            if (!labels.has(cls))
                labels.set(cls, label);
        }
    }
    return labels;
}

function catalog(lang: string): Map<string, string> {
    const file = path.join(localeDir, "locale_" + lang + ".txt");
    const map = new Map<string, string>();
    for (const rawLine of fs.readFileSync(file, "utf8").split("\n")) {
        const match = rawLine.match(/^\s*"([^"]+)"\s*=\s*"(.*)"\s*$/);
        if (match == null)
            continue;
        // Last one wins, the same way Locale.processLocale() reads the file.
        map.set(match[1], match[2]);
    }
    return map;
}

function searchTerms(map: Map<string, string>): Map<string, string[]> {
    const terms = new Map<string, string[]>();
    for (const [key, value] of map) {
        if (!key.startsWith("search:"))
            continue;
        terms.set(key.substring("search:".length), value.split(/\s+/).filter(t => t.length > 0));
    }
    return terms;
}

const labels = elementLabels();
const english = searchTerms(catalog("en"));
const languages = fs.readdirSync(localeDir)
    .map(f => f.match(/^locale_(.+)\.txt$/))
    .filter(m => m != null)
    .map(m => m![1])
    .filter(lang => searchTerms(catalog(lang)).size > 0);

describe("locale search abbreviations", () => {
    it("finds the element labels in the Draw menu", () => {
        expect(labels.get("ResistorElm")).toBe("Add Resistor");
        expect(labels.size).toBeGreaterThan(100);
    });

    it("has at least one catalog to check", () => {
        expect(languages.length).toBeGreaterThan(0);
    });

    for (const lang of languages) {
        const own = catalog(lang);
        const terms = searchTerms(own);

        it(`${lang}: keys name a real element class`, () => {
            const unknown = [...terms.keys()].filter(cls => !labels.has(cls));
            expect(unknown).toEqual([]);
        });

        it(`${lang}: terms are lowercase single words or short phrases`, () => {
            for (const [cls, list] of terms) {
                for (const term of list)
                    expect(term, `${cls} -> "${term}"`).toBe(term.toLowerCase());
            }
        });

        it(`${lang}: terms are not already part of class name or label`, () => {
            const redundant: string[] = [];
            for (const [cls, list] of terms) {
                const englishLabel = labels.get(cls) ?? "";
                const localizedLabel = own.get(englishLabel) ?? "";
                const haystack = (cls + " " + englishLabel + " " + localizedLabel).toLowerCase();
                for (const term of list)
                    if (haystack.includes(term))
                        redundant.push(`${cls}: "${term}"`);
            }
            expect(redundant).toEqual([]);
        });

        if (lang !== "en") {
            it(`${lang}: does not repeat the English base catalog`, () => {
                // locale_en.txt is loaded first for every locale, so an entry
                // that only repeats the base adds nothing.
                const duplicates: string[] = [];
                for (const [cls, list] of terms) {
                    const base = english.get(cls);
                    if (base != null && list.every(term => base.includes(term)))
                        duplicates.push(`${cls}: ${list.join(" ")}`);
                }
                expect(duplicates).toEqual([]);
            });
        }
    }
});