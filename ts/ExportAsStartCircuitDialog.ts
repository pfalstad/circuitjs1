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

// Unlike ExportAsUrlDialog (which embeds the whole circuit, compressed, in the
// URL -- opaque and often shortened further, so there's no way to tell what
// circuit a link actually points to), this just references the circuit's own
// menu filename and title. The resulting link is short AND identifiable, and
// it resolves the same way readSetupFile does: circuits/, then applied/, then
// each extra manifest menu's directory, so it works no matter which menu the
// circuit actually lives in.
export class ExportAsStartCircuitDialog extends Dialog {

    textArea: HTMLTextAreaElement;

    constructor(file: string, title: string | null) {
        super();
        this.closeOnEnter = false;

        const start = window.location.href.split("?");
        if (CirSim.isElectron())
            start[0] = "https://www.falstad.com/circuit/circuitjs.html";
        let query = "?startCircuit=" + encodeURIComponent(file);
        if (title != null)
            query += "&startLabel=" + encodeURIComponent(title);
        const url = start[0] + query;

        this.dialogEl.innerHTML = "";

        const titleEl = document.createElement("h3");
        titleEl.textContent = Locale.LS("Export as Start Circuit");
        titleEl.style.margin = "0 0 8px 0";
        this.dialogEl.appendChild(titleEl);

        const label = document.createElement("div");
        label.textContent = Locale.LS("URL for this circuit is...");
        this.dialogEl.appendChild(label);

        const ta = document.createElement("textarea");
        ta.style.width = "400px";
        ta.style.height = "100px";
        ta.style.display = "block";
        ta.value = url;
        this.textArea = ta;
        this.dialogEl.appendChild(ta);

        const hp = document.createElement("div");
        hp.style.display = "flex";
        hp.style.gap = "8px";
        hp.style.marginTop = "8px";
        this.dialogEl.appendChild(hp);

        const okButton = document.createElement("button");
        okButton.textContent = Locale.LS("OK");
        okButton.onclick = () => this.closeDialog();
        hp.appendChild(okButton);

        const copyButton = document.createElement("button");
        copyButton.textContent = Locale.LS("Copy to Clipboard");
        copyButton.onclick = () => {
            this.textArea.focus();
            this.textArea.select();
            document.execCommand("copy");
            this.textArea.setSelectionRange(0, 0);
        };
        hp.appendChild(copyButton);
    }
}

// Register on window so CommandManager can access without a circular import
(window as any).ExportAsStartCircuitDialog = ExportAsStartCircuitDialog;
