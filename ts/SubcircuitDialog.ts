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
import { SubcircuitModel } from "./SubcircuitModel";
import { ExportAsLocalFileDialog } from "./ExportAsLocalFileDialog";
import { Locale } from "./Locale";

export class SubcircuitDialog extends Dialog {
    private subcircuitListBox: HTMLSelectElement;
    private subcircuits: SubcircuitModel[] = [];

    constructor(sim: CirSim) {
        super();

        this.dialogEl.style.width = "400px";

        const title = document.createElement("div");
        title.textContent = Locale.LS("Subcircuit Manager");
        title.style.fontWeight = "bold";
        title.style.marginBottom = "6px";
        this.dialogEl.appendChild(title);

        this.subcircuitListBox = document.createElement("select");
        this.subcircuitListBox.multiple = true;
        this.subcircuitListBox.size = 10;
        this.subcircuitListBox.style.width = "100%";
        this.dialogEl.appendChild(this.subcircuitListBox);
        this.populateList(new Set());

        // two rows of three equal-width buttons, so the columns line up
        const buttons = document.createElement("div");
        buttons.style.display = "grid";
        buttons.style.gridTemplateColumns = "repeat(3, 1fr)";
        buttons.style.gap = "8px";
        buttons.style.padding = "12px 0 6px 0";
        this.dialogEl.appendChild(buttons);

        const addButton = (label: string, handler: () => void) => {
            const b = document.createElement("button");
            b.textContent = Locale.LS(label);
            b.onclick = handler;
            buttons.appendChild(b);
        };
        addButton("Make Local",      () => this.handleMakeLocal());
        addButton("Make Global",     () => this.handleMakeGlobal());
        addButton("Make Persistent", () => this.handleMakePersistent());
        addButton("Save",            () => this.handleSave());
        addButton("Delete",          () => this.handleDelete());
        addButton("Done",            () => this.closeDialog());
    }

    // fill list box, selecting the models in selected
    private populateList(selected: Set<SubcircuitModel>): void {
        this.subcircuits = SubcircuitModel.getModelList().filter(m => !m.isBuiltin());
        this.subcircuitListBox.innerHTML = "";
        for (const m of this.subcircuits) {
            const opt = document.createElement("option");
            opt.textContent = m.name + " (" + Locale.LS(m.getScope()) + ")";
            opt.selected = selected.has(m);
            this.subcircuitListBox.appendChild(opt);
        }
    }

    private getSelected(): SubcircuitModel[] {
        const sel: SubcircuitModel[] = [];
        const opts = this.subcircuitListBox.options;
        for (let i = 0; i < opts.length; i++)
            if (opts[i].selected) sel.push(this.subcircuits[i]);
        if (sel.length === 0)
            window.alert(Locale.LS("Please select one or more subcircuits."));
        return sel;
    }

    private handleMakeLocal(): void {
        const sel = this.getSelected();
        for (const m of sel) m.makeLocal();
        this.populateList(new Set(sel));
    }

    private handleMakeGlobal(): void {
        const sel = this.getSelected();
        for (const m of sel) m.makeGlobal();
        this.populateList(new Set(sel));
    }

    private handleMakePersistent(): void {
        const sel = this.getSelected();
        for (const m of sel) m.makePersistent();
        this.populateList(new Set(sel));
    }

    // save selected subcircuits as a library file which can be loaded like a circuit
    private handleSave(): void {
        const sel = this.getSelected();
        if (sel.length === 0) return;
        const data = SubcircuitModel.dumpLibrary(sel);
        const base = (sel.length === 1) ? sel[0].name.replace(/[\\/:*?"<>|]/g, "_") : "subcircuits";
        const fname = base + ".txt";
        new ExportAsLocalFileDialog(data, fname, "Save Subcircuits").show();
    }

    private handleDelete(): void {
        const sel = this.getSelected();
        if (sel.length === 0) return;
        const inUse = SubcircuitModel.getModelNamesInUse();
        const used = sel.filter(m => inUse.has(m.name));
        if (used.length > 0) {
            window.alert(Locale.LS("Can't delete subcircuits in use in the current circuit: ") +
                used.map(m => m.name).join(", "));
            return;
        }
        const names = sel.map(m => m.name).join(", ");
        if (!window.confirm(Locale.LS("Are you sure you want to delete ") + names + "?"))
            return;
        for (const m of sel) m.remove();
        this.populateList(new Set());
    }
}

(window as any).SubcircuitDialog = SubcircuitDialog;
