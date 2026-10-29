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
import type { ChipElm } from "./ChipElm";
import { ChipPinEditor, type PinLayoutEntry } from "./ChipPinEditor";
import { PinLayoutModel } from "./PinLayoutModel";
import type { ModelScope } from "./ModelRegistry";
import { HookRegistry } from "./HookRegistry";
import { Locale } from "./Locale";
import { CirSim } from "./CirSim";

// editor for a chip's pin layout model (see PinLayoutModel).  Lays out a copy of the pins, so
// nothing changes until OK is pressed.
export class EditPinLayoutDialog extends Dialog {
    private entries: PinLayoutEntry[];
    private size: { sizeX: number; sizeY: number };
    private editor: ChipPinEditor;
    private nameInput: HTMLInputElement;
    private scopeSelect: HTMLSelectElement;

    private static readonly SCOPES: ModelScope[] = ["local", "global", "persistent"];

    // model is the model to edit, or null to create one from the chip's current layout
    constructor(private readonly chip: ChipElm, private readonly model: PinLayoutModel | null) {
        super();
        const reg = PinLayoutModel.registry;

        // start from where the chip's pins are now (where the model puts them, if editing it)
        this.size = { sizeX: chip.sizeX, sizeY: chip.sizeY };
        this.entries = [];
        for (let i = 0; i !== chip.getPostCount(); i++) {
            const p = chip.pins[i];
            this.entries.push({ name: p.text, pos: p.pos, side: p.side0, busWidth: p.busWidth, busZ: p.busZ });
        }

        const title = document.createElement("div");
        title.textContent = Locale.LS(model === null ? "Create Pin Layout" : "Edit Pin Layout");
        title.style.fontWeight = "bold";
        title.style.marginBottom = "8px";
        this.dialogEl.appendChild(title);
        this.dialogEl.appendChild(Object.assign(document.createElement("div"),
            { textContent: Locale.LS("Drag the pins to the desired position") }));

        this.editor = new ChipPinEditor(this.entries, this.size, {
            // draw the pins like the chip does
            decoratePin: (pin, i) => {
                const cp = chip.pins[i];
                pin.text = cp.text;
                pin.lineOver = cp.lineOver;
                pin.bubble = cp.bubble;
                pin.clock = cp.clock;
            },
        });
        this.dialogEl.appendChild(this.editor.canvas);
        this.dialogEl.appendChild(this.editor.createSizeControls());

        const nameRow = document.createElement("div");
        nameRow.appendChild(Object.assign(document.createElement("span"),
            { textContent: Locale.LS("Model Name") + " " }));
        this.nameInput = document.createElement("input");
        this.nameInput.type = "text";
        this.nameInput.value = model !== null ? model.name :
            reg.uniqueName(chip.getChipName() + " " + Locale.LS("layout"));
        nameRow.appendChild(this.nameInput);
        this.dialogEl.appendChild(nameRow);

        const scopeRow = document.createElement("div");
        scopeRow.style.margin = "8px 0";
        scopeRow.appendChild(Object.assign(document.createElement("span"), { textContent: Locale.LS("Scope:") + " " }));
        this.scopeSelect = document.createElement("select");
        for (const s of ["This Circuit", "This Session", "Save Across Sessions"])
            this.scopeSelect.appendChild(Object.assign(document.createElement("option"), { textContent: Locale.LS(s) }));
        this.scopeSelect.selectedIndex = model === null ? 0 : EditPinLayoutDialog.SCOPES.indexOf(reg.scope(model));
        scopeRow.appendChild(this.scopeSelect);
        this.dialogEl.appendChild(scopeRow);

        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.gap = "8px";
        btnRow.style.marginTop = "8px";
        const okBtn = document.createElement("button");
        okBtn.textContent = Locale.LS("OK");
        okBtn.addEventListener("click", () => this.enterPressed());
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = Locale.LS("Cancel");
        cancelBtn.addEventListener("click", () => this.closeDialog());
        btnRow.appendChild(okBtn);
        btnRow.appendChild(cancelBtn);
        this.dialogEl.appendChild(btnRow);
    }

    show(): void {
        super.show();
        this.editor.draw();
    }

    enterPressed(): void {
        const reg = PinLayoutModel.registry;
        const name = this.nameInput.value.trim();
        if (name.length === 0) {
            window.alert(Locale.LS("Please enter a model name."));
            return;
        }
        const existing = reg.get(name);
        if (existing !== undefined && existing !== this.model) {
            window.alert(Locale.LS("A pin layout with that name already exists."));
            return;
        }
        const layout = {
            sizeX: this.size.sizeX, sizeY: this.size.sizeY,
            pins: this.entries.map(e => ({ name: e.name, side: e.side, pos: e.pos })),
        };
        const scope = EditPinLayoutDialog.SCOPES[this.scopeSelect.selectedIndex];
        const app = CirSim.theApp;
        if (this.model === null) {
            const m = new PinLayoutModel();
            m.name = name;
            m.elmType = this.chip.getXmlDumpType();
            m.copyLayout(layout);
            reg.setScope(m, scope);
            this.chip.setPinLayout(m);
        } else {
            if (name !== this.model.name)
                reg.rename(this.model, name);
            this.model.copyLayout(layout);
            // also updates the saved copy, if any
            reg.setScope(this.model, scope);
            // move the pins of every chip using this model
            app.updateModels();
        }
        app.needAnalyze();
        CirSim.editDialog?.resetDialog();
        this.closeDialog();
    }
}

HookRegistry.editPinLayout = (chip: ChipElm, model: PinLayoutModel | null) => {
    new EditPinLayoutDialog(chip, model).show();
};
