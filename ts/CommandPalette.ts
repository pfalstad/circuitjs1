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
import { CommandPaletteRegistry, PaletteCommand } from "./CommandPaletteRegistry";
import { CommandPaletteHistory } from "./CommandPaletteHistory";
import { Locale } from "./Locale";

// Modal command palette (VS Code / Sublime style). Opened via double-tap Shift, /, or a
// user-assigned shortcut (CommandManager "key"/"commandpalette"). Arrow keys, Enter,
// and Escape are handled in UIManager's keydown handler so they work even when the
// filter box has focus.
export class CommandPalette {

    static readonly WIDTH = 520;
    static readonly MAX_RESULTS = 50;

    private sim: CirSim;
    private overlay: HTMLDivElement;
    private panel: HTMLDivElement;
    private filterBox: HTMLInputElement;
    private listPanel: HTMLDivElement;
    private visibleCommands: PaletteCommand[] = [];
    private selectedIndex = 0;
    // Only rebuild the list when the filter text actually changes; refreshList() resets
    // selectedIndex to 0, so we must not call it on every key-up (e.g. arrow keys).
    private lastQuery = "";
    private closed = false;

    constructor(sim: CirSim) {
        this.sim = sim;

        this.overlay = document.createElement("div");
        this.overlay.className = "command-palette-overlay";
        this.overlay.addEventListener("mousedown", (e) => {
            if (e.target === this.overlay)
                this.close();
        });

        this.panel = document.createElement("div");
        this.panel.className = "command-palette";
        this.panel.style.width = CommandPalette.WIDTH + "px";

        this.filterBox = document.createElement("input");
        this.filterBox.type = "text";
        this.filterBox.className = "command-palette-input";
        this.filterBox.placeholder = Locale.LS("Type a command...");
        this.panel.appendChild(this.filterBox);

        this.listPanel = document.createElement("div");
        this.listPanel.className = "command-palette-list";
        this.panel.appendChild(this.listPanel);

        this.filterBox.addEventListener("keyup", (e) => {
            // arrow/enter/escape are handled globally in UIManager so selection isn't
            // disturbed by refreshList(); don't let them also trigger a filter refresh.
            if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter" || e.key === "Escape")
                return;
            this.onFilterTextChanged();
        });
    }

    show(): void {
        this.lastQuery = "";
        this.filterBox.value = "";
        this.refreshList();
        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
        this.centerPopup();
        this.filterBox.focus();
        this.selectedIndex = 0;
        this.updateSelectionHighlight();
    }

    isShowing(): boolean {
        return !this.closed;
    }

    private centerPopup(): void {
        const left = Math.max(0, (window.innerWidth - CommandPalette.WIDTH) / 2);
        const top = Math.max(0, window.innerHeight / 5);
        this.panel.style.left = left + "px";
        this.panel.style.top = top + "px";
    }

    private onFilterTextChanged(): void {
        const query = this.filterBox.value;
        if (query === this.lastQuery)
            return;
        this.lastQuery = query;
        this.refreshList();
    }

    private refreshList(): void {
        const query = this.filterBox.value;
        this.listPanel.innerHTML = "";
        this.visibleCommands = [];
        this.selectedIndex = 0;

        if (query.trim().length === 0) {
            const recent = CommandPaletteRegistry.recentCommands();
            if (recent.length > 0) {
                this.addSectionLabel(Locale.LS("Recent"));
                for (const cmd of recent)
                    this.addCommandRow(cmd, query);
            }
        } else {
            const results = CommandPaletteRegistry.search(query, CommandPalette.MAX_RESULTS);
            for (const cmd of results)
                this.addCommandRow(cmd, query);
        }
        this.updateSelectionHighlight();
    }

    private addSectionLabel(text: string): void {
        const l = document.createElement("div");
        l.className = "command-palette-section-label";
        l.textContent = text;
        this.listPanel.appendChild(l);
    }

    private addCommandRow(cmd: PaletteCommand, query: string): void {
        const index = this.visibleCommands.length;
        this.visibleCommands.push(cmd);

        const row = document.createElement("div");
        row.className = "command-palette-item";
        row.setAttribute("data-index", String(index));

        const label = document.createElement("div");
        label.className = "command-palette-item-label";
        label.innerHTML = CommandPaletteRegistry.highlightMatch(Locale.LS(cmd.label), query);
        row.appendChild(label);

        if (cmd.hint != null && cmd.hint.length > 0) {
            const hint = document.createElement("div");
            hint.className = "command-palette-item-hint";
            hint.textContent = Locale.LS(cmd.hint);
            row.appendChild(hint);
        }

        row.addEventListener("click", () => {
            this.selectedIndex = index;
            this.executeSelected();
        });

        this.listPanel.appendChild(row);
    }

    moveSelection(delta: number): void {
        if (this.visibleCommands.length === 0)
            return;
        this.selectedIndex += delta;
        if (this.selectedIndex < 0)
            this.selectedIndex = this.visibleCommands.length - 1;
        if (this.selectedIndex >= this.visibleCommands.length)
            this.selectedIndex = 0;
        this.updateSelectionHighlight();
        this.scrollSelectedIntoView();
    }

    private updateSelectionHighlight(): void {
        for (const row of Array.from(this.listPanel.children)) {
            const idxStr = row.getAttribute("data-index");
            if (idxStr == null || idxStr.length === 0)
                continue;
            const idx = parseInt(idxStr, 10);
            row.classList.toggle("command-palette-item-selected", idx === this.selectedIndex);
        }
    }

    private scrollSelectedIntoView(): void {
        for (const row of Array.from(this.listPanel.children)) {
            const idxStr = row.getAttribute("data-index");
            if (idxStr != null && idxStr.length > 0 && parseInt(idxStr, 10) === this.selectedIndex) {
                (row as HTMLElement).scrollIntoView({ block: "nearest" });
                break;
            }
        }
    }

    executeSelected(): void {
        if (this.visibleCommands.length === 0 || this.selectedIndex < 0 || this.selectedIndex >= this.visibleCommands.length)
            return;
        const cmd = this.visibleCommands[this.selectedIndex];
        // Close before running the command so the modal overlay doesn't block native
        // file/print dialogs (Open File, Save As, etc.).
        this.close();
        CommandPalette.execute(cmd);
    }

    static execute(cmd: PaletteCommand): void {
        const app = CirSim.theApp;
        if (cmd.custom != null)
            cmd.custom.execute();
        else
            app.commands.menuPerformed(cmd.menu!, cmd.item!);
        CommandPaletteHistory.record(cmd.id);
    }

    close(): void {
        if (this.closed)
            return;
        this.closed = true;
        this.overlay.remove();
        this.panel.remove();
        if (CirSim.commandPalette === this)
            CirSim.commandPalette = null;
    }
}
