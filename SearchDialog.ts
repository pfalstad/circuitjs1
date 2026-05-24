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
import { Locale } from "./Locale";

export class SearchDialog extends Dialog {
    private sim: CirSim;
    private textBox: HTMLInputElement;
    private listBox: HTMLSelectElement;

    constructor(sim: CirSim) {
        super();
        this.sim = sim;
        this.closeOnEnter = false;

        this.dialogEl.style.minWidth = "300px";

        const title = document.createElement("div");
        title.textContent = Locale.LS("Find Component");
        title.style.fontWeight = "bold";
        title.style.marginBottom = "6px";
        this.dialogEl.appendChild(title);

        this.textBox = document.createElement("input");
        this.textBox.type = "text";
        this.textBox.maxLength = 15;
        this.textBox.style.width = "100%";
        this.textBox.style.boxSizing = "border-box";
        this.dialogEl.appendChild(this.textBox);
        this.textBox.addEventListener("keyup", () => this.search());

        this.listBox = document.createElement("select");
        this.listBox.size = 10;
        this.listBox.style.width = "100%";
        this.listBox.style.marginTop = "6px";
        this.dialogEl.appendChild(this.listBox);
        this.listBox.addEventListener("dblclick", () => this.apply());

        // populate initial list (all items with shortcut length <= 1)
        const ui = sim.ui;
        for (let i = 0; i !== ui.mainMenuItems.length; i++) {
            const item = ui.mainMenuItems[i];
            if (item.getShortcut().length > 1)
                break;
            const opt = document.createElement("option");
            opt.textContent = item.getLabel();
            this.listBox.appendChild(opt);
        }

        const hp = document.createElement("div");
        hp.style.display = "flex";
        hp.style.justifyContent = "space-between";
        hp.style.marginTop = "8px";
        this.dialogEl.appendChild(hp);

        const okButton = document.createElement("button");
        okButton.textContent = Locale.LS("OK");
        okButton.addEventListener("click", () => this.apply());
        hp.appendChild(okButton);

        const cancelButton = document.createElement("button");
        cancelButton.textContent = Locale.LS("Cancel");
        cancelButton.addEventListener("click", () => this.closeDialog());
        hp.appendChild(cancelButton);

        // focus text box after modal opens
        setTimeout(() => this.textBox.focus(), 0);
    }

    apply(): boolean {
        const s = this.listBox.options[this.listBox.selectedIndex]?.text;
        if (s) {
            const ui = this.sim.ui;
            for (let i = 0; i !== ui.mainMenuItems.length; i++) {
                const item = ui.mainMenuItems[i];
                if (item.getLabel() === s) {
                    item.execute();
                    break;
                }
            }
        }
        this.closeDialog();
        return true;
    }

    private search(): void {
        const str = this.textBox.value.toLowerCase();
        const ui = this.sim.ui;
        const items: string[] = [];
        for (let i = 0; i !== ui.mainMenuItems.length; i++) {
            const item = ui.mainMenuItems[i];
            if (item.getLabel().toLowerCase().includes(str)) {
                if (!items.includes(item.getLabel()))
                    items.push(item.getLabel());
            }
        }
        items.sort((a, b) => a.localeCompare(b));
        this.listBox.innerHTML = "";
        for (const name of items) {
            const opt = document.createElement("option");
            opt.textContent = name;
            this.listBox.appendChild(opt);
        }
        if (items.length > 0)
            this.listBox.selectedIndex = 0;
    }
}
