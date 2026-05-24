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

export class ExportAsTextDialog extends Dialog {
    sim: CirSim;
    textArea: HTMLTextAreaElement;

    constructor(asim: CirSim, s: string) {
        super();
        this.closeOnEnter = false;
        this.sim = asim;

        this.dialogEl.innerHTML = "";

        const titleEl = document.createElement("h3");
        titleEl.textContent = Locale.LS("Export as Text");
        titleEl.style.margin = "0 0 8px 0";
        this.dialogEl.appendChild(titleEl);

        const label = document.createElement("div");
        label.textContent = Locale.LS("Text file for this circuit is...");
        this.dialogEl.appendChild(label);

        const ta = document.createElement("textarea");
        ta.style.width = "400px";
        ta.style.height = "300px";
        ta.style.display = "block";
        ta.value = s;
        this.textArea = ta;
        this.dialogEl.appendChild(ta);

        const hp = document.createElement("div");
        hp.style.display = "flex";
        hp.style.justifyContent = "space-between";
        hp.style.marginTop = "8px";
        this.dialogEl.appendChild(hp);

        const leftBtns = document.createElement("div");
        hp.appendChild(leftBtns);

        const okButton = document.createElement("button");
        okButton.textContent = Locale.LS("OK");
        okButton.onclick = () => this.closeDialog();
        leftBtns.appendChild(okButton);

        const copyButton = document.createElement("button");
        copyButton.textContent = Locale.LS("Copy to Clipboard");
        copyButton.style.marginLeft = "8px";
        copyButton.onclick = () => {
            this.textArea.focus();
            this.textArea.select();
            document.execCommand("copy");
            this.textArea.setSelectionRange(0, 0);
        };
        leftBtns.appendChild(copyButton);

        const importButton = document.createElement("button");
        importButton.textContent = Locale.LS("Re-Import");
        importButton.onclick = () => {
            this.sim.undoManager?.pushUndo();
            const text = this.textArea.value;
            this.closeDialog();
            if (text != null) {
                this.sim.readCircuit(text);
                this.sim.allowSave(false);
            }
        };
        hp.appendChild(importButton);
    }
}
