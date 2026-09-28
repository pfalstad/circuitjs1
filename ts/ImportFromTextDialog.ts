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

export class ImportFromTextDialog extends Dialog {
    constructor(sim: CirSim) {
        super();
        this.closeOnEnter = false;

        this.dialogEl.innerHTML = "";

        const title = document.createElement("div");
        title.textContent = Locale.LS("Import from Text");
        title.style.fontWeight = "bold";
        title.style.marginBottom = "8px";
        this.dialogEl.appendChild(title);

        const label = document.createElement("div");
        label.textContent = Locale.LS("Paste the text file for your circuit here...");
        label.style.marginBottom = "4px";
        this.dialogEl.appendChild(label);

        const textArea = document.createElement("textarea");
        textArea.style.width = "300px";
        textArea.style.height = "200px";
        textArea.style.display = "block";
        this.dialogEl.appendChild(textArea);

        const subCheck = document.createElement("input");
        subCheck.type = "checkbox";
        const subLabel = document.createElement("label");
        subLabel.style.display = "block";
        subLabel.style.margin = "4px 0";
        subLabel.appendChild(subCheck);
        subLabel.appendChild(document.createTextNode(" " + Locale.LS("Load Subcircuits Only")));
        this.dialogEl.appendChild(subLabel);

        const hp = document.createElement("div");
        hp.style.display = "flex";
        hp.style.gap = "8px";
        hp.style.marginTop = "8px";
        this.dialogEl.appendChild(hp);

        const okButton = document.createElement("button");
        okButton.textContent = Locale.LS("OK");
        okButton.addEventListener("click", () => {
            sim.undoManager?.pushUndo();
            this.closeDialog();
            sim.importCircuitFromText(textArea.value, subCheck.checked);
        });
        hp.appendChild(okButton);

        const cancelButton = document.createElement("button");
        cancelButton.textContent = Locale.LS("Cancel");
        cancelButton.addEventListener("click", () => this.closeDialog());
        hp.appendChild(cancelButton);

        this.show();
    }
}
