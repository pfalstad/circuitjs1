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
import { CommandPalette } from "./CommandPalette";
import { CommandPaletteRegistry, PaletteCommand } from "./CommandPaletteRegistry";

// Always-visible component search field in the menu bar. Typing filters the
// element list directly, so placing a part no longer requires walking through
// Draw -> submenu -> item. Enter or a click selects the placement mode.
//
// The list is fed by CommandPaletteRegistry.componentCommands, i.e. the same
// entries the command palette uses, so labels, translations and the
// class-name keywords stay in sync with the Draw menu automatically.
export class ComponentSearch {
    private app: CirSim;
    private root: HTMLDivElement;
    input: HTMLInputElement;
    private list: HTMLDivElement;
    private results: PaletteCommand[] = [];
    private selected = 0;

    private static readonly MAX_RESULTS = 12;

    constructor(app: CirSim, parent: HTMLElement) {
        this.app = app;

        this.root = document.createElement("div");
        this.root.className = "componentSearch";

        this.input = document.createElement("input");
        this.input.type = "text";
        this.input.className = "componentSearchInput";
        this.input.placeholder = Locale.LS("Search components...");
        this.input.setAttribute("aria-label", Locale.LS("Search components..."));
        this.input.setAttribute("role", "combobox");
        this.input.setAttribute("aria-expanded", "false");
        this.input.autocomplete = "off";
        this.input.spellcheck = false;

        this.list = document.createElement("div");
        this.list.className = "componentSearchList";
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

    focus(): void {
        this.input.focus();
        this.input.select();
    }

    private onKeyDown(e: KeyboardEvent): void {
        // Keep the canvas/global shortcut handlers out of the way while typing.
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape") {
            e.stopPropagation();
            e.preventDefault();
        }
        if (e.key === "ArrowDown") {
            this.moveSelection(1);
        } else if (e.key === "ArrowUp") {
            this.moveSelection(-1);
        } else if (e.key === "Enter") {
            this.select(this.selected);
        } else if (e.key === "Escape") {
            this.clear();
        }
    }

    private refresh(): void {
        const query = this.input.value.trim();
        if (query.length === 0) {
            this.hide();
            return;
        }
        this.results = CommandPaletteRegistry.searchComponents(query, ComponentSearch.MAX_RESULTS);
        this.selected = 0;
        this.render(query);
    }

    private render(query: string): void {
        this.list.innerHTML = "";
        this.list.style.display = "block";
        this.input.setAttribute("aria-expanded", "true");

        if (this.results.length === 0) {
            const empty = document.createElement("div");
            empty.className = "componentSearchEmpty";
            empty.textContent = Locale.LS("No matching components");
            this.list.appendChild(empty);
            return;
        }

        for (let i = 0; i < this.results.length; i++) {
            const cmd = this.results[i];
            const row = document.createElement("div");
            row.className = "componentSearchItem" + (i === this.selected ? " componentSearchItemSelected" : "");
            row.setAttribute("data-index", String(i));

            const label = document.createElement("span");
            label.className = "componentSearchLabel";
            // Component entries carry the plain element name ("Widerstand
            // einfügen"), no "Mode: " prefix like the command palette.
            const text = Locale.LS(cmd.label);
            label.innerHTML = CommandPaletteRegistry.highlightMatch(text, query);
            row.appendChild(label);

            if (cmd.hint != null && cmd.hint.length > 0) {
                const hint = document.createElement("span");
                hint.className = "componentSearchHint";
                hint.textContent = Locale.LS(cmd.hint);
                row.appendChild(hint);
            }

            // mousedown + preventDefault keeps focus in the input, so the blur
            // handler doesn't tear the list down before the click is delivered.
            row.addEventListener("mousedown", (e) => e.preventDefault());
            row.addEventListener("click", () => this.select(i));
            this.list.appendChild(row);
        }
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
        const sel = rows[this.selected] as HTMLElement | undefined;
        if (sel != null)
            sel.scrollIntoView({ block: "nearest" });
    }

    private select(index: number): void {
        if (index < 0 || index >= this.results.length)
            return;
        const cmd = this.results[index];
        this.clear();
        CommandPalette.execute(cmd);
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
}
