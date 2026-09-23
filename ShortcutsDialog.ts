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

import { Dialog } from "./Dialog";
import { CirSim } from "./CirSim";
import { KeyNames } from "./KeyNames";
import { Locale } from "./Locale";

export class ShortcutsDialog extends Dialog {
    sim: CirSim;
    ui: any;
    textBoxes: HTMLInputElement[] = [];
    shortcuts: string[] = [];
    // target each row applies to: a mainMenuItems index, -1 for run/stop, -2 for command palette
    rowMenuItemIndex: number[] = [];
    okButton!: HTMLButtonElement;

    constructor(sim: CirSim) {
        super();
        this.sim = sim;
        this.ui = sim.ui;

        this.dialogEl.style.minWidth = "400px";

        const title = document.createElement("div");
        title.textContent = Locale.LS("Edit Shortcuts");
        title.style.fontWeight = "bold";
        title.style.marginBottom = "6px";
        this.dialogEl.appendChild(title);

        const sp = document.createElement("div");
        sp.style.height = "400px";
        sp.style.overflowY = "auto";
        this.dialogEl.appendChild(sp);

        // build the list of things we can assign a shortcut to: every menu item that
        // accepts a shortcut, plus the "start/stop simulation" action
        const rowNames: string[] = [];
        const rowInitialShortcuts: string[] = [];
        let i: number;
        for (i = 0; i !== this.ui.mainMenuItems.length; i++) {
            const item = this.ui.mainMenuItems[i];
            if (item.getShortcut().length > 1)
                break;
            rowNames.push(item.getLabel());
            rowInitialShortcuts.push(item.getShortcut());
            this.rowMenuItemIndex.push(i);
        }
        let runStopShortcut = "";
        let commandPaletteShortcut = "/";
        for (const [key, value] of this.sim.shortcuts) {
            if (value === CirSim.RUNSTOP_SHORTCUT_ACTION)
                runStopShortcut = String.fromCharCode(key);
            else if (value === CirSim.COMMAND_PALETTE_SHORTCUT_ACTION)
                commandPaletteShortcut = String.fromCharCode(key);
        }
        rowNames.push(Locale.LS("Start/Stop Simulation"));
        rowInitialShortcuts.push(runStopShortcut);
        this.rowMenuItemIndex.push(-1);
        rowNames.push(Locale.LS("Command Palette"));
        rowInitialShortcuts.push(commandPaletteShortcut);
        this.rowMenuItemIndex.push(-2); // not a mainMenuItems row; see enterPressed()

        const table = document.createElement("table");
        sp.appendChild(table);
        for (i = 0; i !== rowNames.length; i++) {
            const row = i;
            const tr = document.createElement("tr");
            table.appendChild(tr);

            const nameTd = document.createElement("td");
            nameTd.textContent = rowNames[i];
            tr.appendChild(nameTd);

            const text = document.createElement("input");
            text.type = "text";
            text.readOnly = true;
            text.value = KeyNames.displayText(rowInitialShortcuts[i]) ?? "";
            this.shortcuts.push(rowInitialShortcuts[i]);
            text.addEventListener("keydown", (ev: KeyboardEvent) => {
                const keyCode = ev.keyCode;
                const placeholder = KeyNames.keyCodeToPlaceholder(keyCode, ev.shiftKey,
                    ev.ctrlKey, ev.altKey, ev.metaKey);
                if (placeholder >= 0) {
                    ev.preventDefault();
                    this.setRowShortcut(row, text, String.fromCharCode(placeholder));
                } else if (keyCode === 8 /* backspace */ || keyCode === 46 /* delete */) {
                    ev.preventDefault();
                    this.setRowShortcut(row, text, "");
                }
            });
            text.addEventListener("keypress", (ev: KeyboardEvent) => {
                ev.preventDefault();
                const cc = ev.charCode ?? ev.which;
                if (cc >= 32 && cc < 127)
                    this.setRowShortcut(row, text, String.fromCharCode(cc));
            });
            const textTd = document.createElement("td");
            textTd.appendChild(text);
            tr.appendChild(textTd);
            this.textBoxes.push(text);

            const clearButton = document.createElement("button");
            clearButton.textContent = Locale.LS("Clear");
            clearButton.addEventListener("click", () => this.setRowShortcut(row, text, ""));
            const clearTd = document.createElement("td");
            clearTd.appendChild(clearButton);
            tr.appendChild(clearTd);
        }

        const hp = document.createElement("div");
        hp.style.display = "flex";
        hp.style.justifyContent = "space-between";
        hp.style.marginTop = "8px";
        this.dialogEl.appendChild(hp);

        this.okButton = document.createElement("button");
        this.okButton.textContent = Locale.LS("OK");
        this.okButton.addEventListener("click", () => this.enterPressed());
        hp.appendChild(this.okButton);

        const cancelButton = document.createElement("button");
        cancelButton.textContent = Locale.LS("Cancel");
        cancelButton.addEventListener("click", () => this.closeDialog());
        hp.appendChild(cancelButton);
    }

    setRowShortcut(row: number, text: HTMLInputElement, shortcut: string): void {
        this.shortcuts[row] = shortcut;
        text.value = KeyNames.displayText(shortcut) ?? "";
        this.checkForDuplicates();
    }

    enterPressed(): void {
        if (this.checkForDuplicates())
            return;
        // clear existing shortcuts
        this.sim.shortcuts.clear();
        // load new ones
        for (let i = 0; i !== this.shortcuts.length; i++) {
            const str = this.shortcuts[i];
            const menuItemIndex = this.rowMenuItemIndex[i];
            if (menuItemIndex >= 0) {
                const item = this.ui.mainMenuItems[menuItemIndex];
                item.setShortcut(str);
                if (str.length > 0)
                    this.sim.shortcuts.set(str.charCodeAt(0), this.ui.mainMenuItemNames[menuItemIndex]);
            } else if (menuItemIndex === -1) {
                if (str.length > 0)
                    this.sim.shortcuts.set(str.charCodeAt(0), CirSim.RUNSTOP_SHORTCUT_ACTION);
            } else if (menuItemIndex === -2) {
                if (str.length > 0)
                    this.sim.shortcuts.set(str.charCodeAt(0), CirSim.COMMAND_PALETTE_SHORTCUT_ACTION);
            }
        }
        // save to local storage
        this.sim.saveShortcuts();
        this.closeDialog();
    }

    checkForDuplicates(): boolean {
        const boxForShortcut = new Map<string, HTMLInputElement>();
        let result = false;
        for (let i = 0; i !== this.textBoxes.length; i++) {
            const box = this.textBoxes[i];
            const str = this.shortcuts[i];
            if (str.length === 0) {
                box.style.color = "black";
                continue;
            }
            const c = str.charAt(0);

            // check for duplicates and mark them
            const other = boxForShortcut.get(c);
            if (other != null) {
                box.style.color = "red";
                other.style.color = "red";
                result = true;
            } else
                box.style.color = "black";

            boxForShortcut.set(c, box);
        }
        this.okButton.disabled = result;
        return result;
    }
}

// Register on window so CommandManager can access without a circular import
(window as any).ShortcutsDialog = ShortcutsDialog;
