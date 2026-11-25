/*
    Copyright (C) Paul Falstad and Iain Sharp

    This file is part of CircuitJS1.

    CircuitJS1 is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    CircuitJS1 is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with CircuitJS1.  If not, see <http://www.gnu.org/licenses/>.
*/

import { CirSim } from "./CirSim";
import { Locale } from "./Locale";

// One circuit entry from a menu list file (setuplist.txt, setupappliedlist.txt,
// or an extra menu's list from extramenus.txt).
interface CircuitEntry {
    file: string;        // as in the list file, e.g. "lrc.txt"
    stem: string;        // file without .txt, e.g. "lrc"
    title: string;       // menu title, e.g. "LRC Circuit"
    path: string;        // where it lives in the menus, e.g. "Circuits > Basics"
    key: string | null;  // null for Circuits, "applied" for Applied, else the extra menu's key (its directory)
    menu: string;        // menu command it runs: "circuits" or "extra:<key>"
}

interface CircuitHit {
    entry: CircuitEntry;
    onFile: boolean;  // matched on the filename (else on the title)
}

// "Search circuits..." field in the menu bar, next to the component search.
// Finds circuits by filename or title, exactly as typed (case ignored, each ?
// stands for one character), and loads the one picked, just as its menu item
// would. Results come in menu order; a filename match wins over a title match,
// so each circuit is listed once. On mobile there's room for only one field,
// so a checkbox in front of it switches between components and circuits.
//
// A prefix limits the search to one place: C:, Cir: or Circuits: for the
// Circuits menu; A:, App: or Applied: for the Applied menu; E:, X: or Ext:
// for all extra menus; or an extra menu's
// directory name (e.g. Testbed:) for just that menu. Case is ignored, and a
// prefix alone lists everything in that place.
export class CircuitSearch {
    static entries: CircuitEntry[] = [];

    private app: CirSim;
    private root: HTMLDivElement;
    input: HTMLInputElement;
    private list: HTMLDivElement;
    private results: CircuitHit[] = [];
    private selected = 0;

    private static readonly VISIBLE_ROWS = 10;

    // Called from Menus.processSetupList() for each circuit in a list file.
    static register(key: string | null, file: string, title: string, path: string): void {
        if (CircuitSearch.entries.some(e => e.key === key && e.file === file))
            return;
        const menu = key == null ? "circuits" : "extra:" + key;
        CircuitSearch.entries.push({ file, stem: file.replace(/\.txt$/i, ""), title, path, key, menu });
    }

    // Splits off a recognized prefix. Returns the entry filter (null = all
    // circuits) and the text left to match; an unknown prefix is just text.
    static parsePrefix(query: string): { filter: ((e: CircuitEntry) => boolean) | null, text: string } {
        const m = /^([^:\s]+):\s*(.*)$/.exec(query);
        if (m != null) {
            const p = m[1].toLowerCase();
            const text = m[2];
            if (p === "c" || p === "cir" || p === "circuits")
                return { filter: e => e.key == null, text };
            if (p === "a" || p === "app" || p === "applied")
                return { filter: e => e.key === "applied", text };
            if (p === "e" || p === "x" || p === "ext")
                return { filter: e => e.key != null && e.key !== "applied", text };
            if (CircuitSearch.entries.some(e => e.key != null && e.key.toLowerCase() === p))
                return { filter: e => e.key != null && e.key.toLowerCase() === p, text };
        }
        return { filter: null, text: query };
    }

    // Text as typed, case ignored; each ? matches exactly one character.
    static pattern(text: string): RegExp {
        const src = text.split("?").map(s => s.replace(/[.*+^${}()|[\]\\]/g, "\\$&")).join(".");
        return new RegExp(src, "i");
    }

    static search(query: string): CircuitHit[] {
        const { filter, text } = CircuitSearch.parsePrefix(query.trim());
        if (filter == null && text.length === 0)
            return [];
        const re = CircuitSearch.pattern(text);
        const hits: CircuitHit[] = [];
        for (const entry of CircuitSearch.entries) {
            if (filter != null && !filter(entry))
                continue;
            if (text.length > 0 && re.test(entry.stem))
                hits.push({ entry, onFile: true });
            else if (re.test(entry.title))
                hits.push({ entry, onFile: false });
        }
        return hits;
    }

    constructor(app: CirSim, parent: HTMLElement) {
        this.app = app;

        // Mobile only (hidden on desktop by CSS): checked = search circuits.
        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.className = "circuitSearchToggle";
        toggle.title = Locale.LS("Search circuits");
        toggle.addEventListener("change", () => parent.classList.toggle("circuitSearchMode", toggle.checked));
        parent.appendChild(toggle);

        this.root = document.createElement("div");
        this.root.className = "componentSearch circuitSearch";

        this.input = document.createElement("input");
        this.input.type = "text";
        this.input.className = "componentSearchInput";
        this.input.placeholder = Locale.LS("Search circuits...");
        this.input.setAttribute("aria-label", Locale.LS("Search circuits..."));
        this.input.setAttribute("role", "combobox");
        this.input.setAttribute("aria-expanded", "false");
        this.input.autocomplete = "off";
        this.input.spellcheck = false;

        this.list = document.createElement("div");
        this.list.className = "componentSearchList circuitSearchList";
        this.list.style.display = "none";

        this.root.appendChild(this.input);
        this.root.appendChild(this.list);
        parent.appendChild(this.root);

        this.input.addEventListener("input", () => this.refresh());
        this.input.addEventListener("focus", () => this.refresh());
        this.input.addEventListener("keydown", (e) => this.onKeyDown(e));
        this.input.addEventListener("blur", () => {
            // Delay so a click on a result still lands before the list is hidden.
            window.setTimeout(() => {
                if (document.activeElement !== this.input)
                    this.hide();
            }, 150);
        });
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape") {
            e.stopPropagation();
            e.preventDefault();
        }
        if (e.key === "ArrowDown")
            this.moveSelection(1);
        else if (e.key === "ArrowUp")
            this.moveSelection(-1);
        else if (e.key === "Enter")
            this.select(this.selected);
        else if (e.key === "Escape")
            this.clear();
    }

    private refresh(): void {
        const query = this.input.value.trim();
        if (query.length === 0) {
            this.hide();
            return;
        }
        this.results = CircuitSearch.search(query);
        this.selected = 0;
        this.render(CircuitSearch.pattern(CircuitSearch.parsePrefix(query).text));
    }

    private render(re: RegExp): void {
        this.list.innerHTML = "";
        this.list.style.maxHeight = "";
        this.list.style.display = "block";
        this.input.setAttribute("aria-expanded", "true");

        if (this.results.length === 0) {
            const empty = document.createElement("div");
            empty.className = "componentSearchEmpty";
            empty.textContent = Locale.LS("No matching circuits");
            this.list.appendChild(empty);
            return;
        }

        for (let i = 0; i < this.results.length; i++) {
            const hit = this.results[i];
            const row = document.createElement("div");
            row.className = "componentSearchItem" + (i === this.selected ? " componentSearchItemSelected" : "");

            const label = document.createElement("span");
            label.className = "componentSearchLabel";
            if (hit.onFile)
                label.innerHTML = CircuitSearch.escapeHtml(hit.entry.title)
                    + " <span class=\"circuitSearchFile\">" + CircuitSearch.highlight(hit.entry.stem, re) + "</span>";
            else
                label.innerHTML = CircuitSearch.highlight(hit.entry.title, re);
            row.appendChild(label);

            const hint = document.createElement("span");
            hint.className = "componentSearchHint";
            hint.textContent = hit.entry.path;
            row.appendChild(hint);

            // mousedown + preventDefault keeps focus in the input, so the blur
            // handler doesn't tear the list down before the click is delivered.
            row.addEventListener("mousedown", (e) => e.preventDefault());
            row.addEventListener("click", () => this.select(i));
            this.list.appendChild(row);
        }

        // Window of VISIBLE_ROWS rows; scroll for the rest.
        const first = this.list.firstElementChild as HTMLElement;
        if (this.results.length > CircuitSearch.VISIBLE_ROWS)
            this.list.style.maxHeight = (first.offsetHeight * CircuitSearch.VISIBLE_ROWS + 2) + "px";
    }

    private moveSelection(delta: number): void {
        if (this.results.length === 0)
            return;
        this.selected += delta;
        if (this.selected < 0)
            this.selected = this.results.length - 1;
        if (this.selected >= this.results.length)
            this.selected = 0;
        const rows = this.list.querySelectorAll(".componentSearchItem");
        rows.forEach((row, i) => row.classList.toggle("componentSearchItemSelected", i === this.selected));
        (rows[this.selected] as HTMLElement).scrollIntoView({ block: "nearest" });
    }

    // Loads the circuit the same way clicking its menu item does.
    private select(index: number): void {
        if (index < 0 || index >= this.results.length)
            return;
        const e = this.results[index].entry;
        this.clear();
        this.app.commands.menuPerformed(e.menu, "setup " + e.file + " " + e.title);
    }

    private clear(): void {
        this.input.value = "";
        this.hide();
        this.input.blur();
    }

    private hide(): void {
        this.list.style.display = "none";
        this.list.innerHTML = "";
        this.results = [];
        this.selected = 0;
        this.input.setAttribute("aria-expanded", "false");
    }

    private static highlight(text: string, re: RegExp): string {
        const m = re.exec(text);
        if (m == null || m[0].length === 0)
            return CircuitSearch.escapeHtml(text);
        return CircuitSearch.escapeHtml(text.substring(0, m.index))
            + "<b>" + CircuitSearch.escapeHtml(m[0]) + "</b>"
            + CircuitSearch.escapeHtml(text.substring(m.index + m[0].length));
    }

    private static escapeHtml(s: string): string {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
}
