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
import { CustomCompositeModel } from "./CustomCompositeModel";

export class SubcircuitDialog extends Dialog {
    private subcircuitListBox: HTMLSelectElement;
    private subcircuits: CustomCompositeModel[];

    constructor(sim: CirSim) {
        super();

        this.dialogEl.style.width = "400px";

        const title = document.createElement("div");
        title.textContent = "Subcircuit Manager";
        title.style.fontWeight = "bold";
        title.style.marginBottom = "6px";
        this.dialogEl.appendChild(title);

        this.subcircuits = CustomCompositeModel.getModelList().filter(m => !m.isBuiltin());

        this.subcircuitListBox = document.createElement("select");
        this.subcircuitListBox.size = 5;
        this.subcircuitListBox.style.width = "100%";
        for (const m of this.subcircuits) {
            const opt = document.createElement("option");
            opt.textContent = m.name;
            this.subcircuitListBox.appendChild(opt);
        }
        this.dialogEl.appendChild(this.subcircuitListBox);

        this.dialogEl.appendChild(document.createElement("br"));

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.onclick = () => this.handleDelete();
        this.dialogEl.appendChild(deleteButton);

        const doneButton = document.createElement("button");
        doneButton.textContent = "Done";
        doneButton.onclick = () => this.closeDialog();
        this.dialogEl.appendChild(doneButton);
    }

    private handleDelete(): void {
        const selectedIndex = this.subcircuitListBox.selectedIndex;
        if (selectedIndex === -1) {
            window.alert("Please select a subcircuit to delete.");
            return;
        }

        const selectedSubcircuit = this.subcircuitListBox.options[selectedIndex].textContent;
        const confirm = window.confirm("Are you sure you want to delete " + selectedSubcircuit + "?");

        if (confirm) {
            const model = this.subcircuits[selectedIndex];
            this.subcircuits.splice(selectedIndex, 1);
            model.remove();
            this.subcircuitListBox.remove(selectedIndex);
        }
    }
}

(window as any).SubcircuitDialog = SubcircuitDialog;
