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
import { ExportAsLocalFileDialog } from "./ExportAsLocalFileDialog";
import { Locale } from "./Locale";
import type { ModelScope } from "./ModelRegistry";
import { allModelTypes, dumpModelLibrary, getModelsInUse, isUserModel, type TypedModel } from "./ModelTypes";

// lists the user's models of all types (subcircuits, diodes, transistors, ...) and lets them
// change where the models live (see ModelRegistry), save them to a library file, or delete them
export class ModelManagerDialog extends Dialog {
    // type shown in the list, or "" for all types (remembered between uses)
    private static typeFilter = "";

    private typeSelect: HTMLSelectElement;
    private modelListBox: HTMLSelectElement;
    private models: TypedModel[] = [];

    constructor(sim: CirSim) {
        super();

        this.dialogEl.style.width = "400px";

        const title = document.createElement("div");
        title.textContent = Locale.LS("Model Manager");
        title.style.fontWeight = "bold";
        title.style.marginBottom = "6px";
        this.dialogEl.appendChild(title);

        const typeRow = document.createElement("div");
        typeRow.style.marginBottom = "6px";
        typeRow.appendChild(document.createTextNode(Locale.LS("Type:") + " "));
        this.typeSelect = document.createElement("select");
        typeRow.appendChild(this.typeSelect);
        this.dialogEl.appendChild(typeRow);
        this.typeSelect.onchange = () => {
            ModelManagerDialog.typeFilter = this.typeSelect.value;
            this.populateList(new Set());
        };

        this.modelListBox = document.createElement("select");
        this.modelListBox.multiple = true;
        this.modelListBox.size = 12;
        this.modelListBox.style.width = "100%";
        this.dialogEl.appendChild(this.modelListBox);
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
        addButton("Make Local",      () => this.handleSetScope("local"));
        addButton("Make Global",     () => this.handleSetScope("global"));
        addButton("Make Persistent", () => this.handleSetScope("persistent"));
        addButton("Export",          () => this.handleSave());
        addButton("Delete",          () => this.handleDelete());
        addButton("Done",            () => this.closeDialog());
    }

    // fill type selector and list box, selecting the models in selected
    private populateList(selected: Set<unknown>): void {
        const all: TypedModel[] = [];
        for (const type of allModelTypes())
            for (const model of type.registry.models())
                if (isUserModel(model))
                    all.push({ type, model });
        const typeName = (tm: TypedModel) => tm.type.typeName(tm.model);
        all.sort((a, b) => typeName(a).localeCompare(typeName(b)) || a.model.name.localeCompare(b.model.name));

        // offer the types that have models, plus the current filter
        const typeNames = [...new Set(all.map(typeName))];
        const filter = ModelManagerDialog.typeFilter;
        if (filter && !typeNames.includes(filter))
            typeNames.push(filter);
        this.typeSelect.innerHTML = "";
        this.typeSelect.appendChild(Object.assign(document.createElement("option"),
            { value: "", textContent: Locale.LS("All Types") }));
        for (const t of typeNames)
            this.typeSelect.appendChild(Object.assign(document.createElement("option"),
                { value: t, textContent: Locale.LS(t) }));
        this.typeSelect.value = filter;

        this.models = all.filter(tm => !filter || typeName(tm) === filter);
        this.modelListBox.innerHTML = "";
        for (const tm of this.models) {
            const opt = document.createElement("option");
            let text = tm.model.name + " (";
            if (!filter)
                text += Locale.LS(typeName(tm)) + ", ";
            opt.textContent = text + Locale.LS(tm.type.registry.scope(tm.model)) + ")";
            opt.selected = selected.has(tm.model);
            this.modelListBox.appendChild(opt);
        }
    }

    private getSelected(): TypedModel[] {
        const sel: TypedModel[] = [];
        const opts = this.modelListBox.options;
        for (let i = 0; i < opts.length; i++)
            if (opts[i].selected) sel.push(this.models[i]);
        if (sel.length === 0)
            window.alert(Locale.LS("Please select one or more models."));
        return sel;
    }

    private handleSetScope(scope: ModelScope): void {
        const sel = this.getSelected();
        for (const tm of sel)
            tm.type.registry.setScope(tm.model, scope);
        this.populateList(new Set(sel.map(tm => tm.model)));
    }

    // save selected models as a library file which can be loaded like a circuit
    private handleSave(): void {
        const sel = this.getSelected();
        if (sel.length === 0) return;
        const data = dumpModelLibrary(sel);
        const base = (sel.length === 1) ? sel[0].model.name.replace(/[\\/:*?"<>|]/g, "_") : "models";
        new ExportAsLocalFileDialog(data, base + ".txt", "Save Models").show();
    }

    private handleDelete(): void {
        const sel = this.getSelected();
        if (sel.length === 0) return;
        const inUse = getModelsInUse();
        // (an element may hold a different model object with the same name, e.g. after the model was replaced)
        const used = sel.filter(tm => [...inUse].some(u => u === tm.model ||
            (u.constructor === tm.model.constructor && u.name === tm.model.name)));
        if (used.length > 0) {
            window.alert(Locale.LS("Can't delete models in use in the current circuit: ") +
                used.map(tm => tm.model.name).join(", "));
            return;
        }
        const names = sel.map(tm => tm.model.name).join(", ");
        if (!window.confirm(Locale.LS("Are you sure you want to delete ") + names + "?"))
            return;
        for (const tm of sel)
            tm.type.registry.delete(tm.model);
        this.populateList(new Set());
    }
}

(window as any).ModelManagerDialog = ModelManagerDialog;
