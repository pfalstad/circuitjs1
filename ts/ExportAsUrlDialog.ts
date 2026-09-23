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

export class ExportAsUrlDialog extends Dialog {
    // set to false at build/deploy time if the target server doesn't have shortrelay.php
    static readonly shortRelaySupported = true;

    textArea: HTMLTextAreaElement;

    shortIsSupported(): boolean {
        if (CirSim.isElectron())
            return false;
        return ExportAsUrlDialog.shortRelaySupported;
    }

    static createShort(urlin: string, textArea: HTMLTextAreaElement): void {
        const url = "shortrelay.php" + "?v=" + urlin;
        textArea.value = "Waiting for short URL for web service...";
        fetch(url)
            .then(r => {
                if (r.ok) return r.text();
                const text = "Shortner error:" + r.statusText;
                console.log(text);
                return text;
            })
            .then(text => { textArea.value = text; })
            .catch((exception) => { console.log("File Error Response", exception); });
    }

    constructor(dump: string) {
        super();
        this.closeOnEnter = false;

        const start = window.location.href.split("?");
        if (CirSim.isElectron())
            start[0] = "https://www.falstad.com/circuit/circuitjs.html";
        const compressed = (window as any).LZString.compressToEncodedURIComponent(dump);
        const query = "?ctz=" + compressed;
        const url = start[0] + query;
        const requrl = encodeURIComponent(query);

        this.dialogEl.innerHTML = "";

        const titleEl = document.createElement("h3");
        titleEl.textContent = Locale.LS("Export as URL");
        titleEl.style.margin = "0 0 8px 0";
        this.dialogEl.appendChild(titleEl);

        const label = document.createElement("div");
        label.textContent = Locale.LS("URL for this circuit is...");
        this.dialogEl.appendChild(label);

        if (url.length > 2000) {
            const warning = document.createElement("div");
            warning.textContent = Locale.LS("Warning: this URL is longer than 2000 characters and may not work in some browsers.");
            warning.style.width = "300px";
            this.dialogEl.appendChild(warning);
        }

        const ta = document.createElement("textarea");
        ta.style.width = "400px";
        ta.style.height = "300px";
        ta.style.display = "block";
        ta.value = url;
        this.textArea = ta;
        this.dialogEl.appendChild(ta);

        const hp = document.createElement("div");
        hp.style.display = "flex";
        hp.style.justifyContent = "space-between";
        hp.style.marginTop = "8px";
        this.dialogEl.appendChild(hp);

        const leftBtns = document.createElement("div");
        leftBtns.style.display = "flex";
        leftBtns.style.gap = "8px";
        hp.appendChild(leftBtns);

        const okButton = document.createElement("button");
        okButton.textContent = Locale.LS("OK");
        okButton.onclick = () => this.closeDialog();
        leftBtns.appendChild(okButton);

        const copyButton = document.createElement("button");
        copyButton.textContent = Locale.LS("Copy to Clipboard");
        copyButton.onclick = () => {
            this.textArea.focus();
            this.textArea.select();
            document.execCommand("copy");
            this.textArea.setSelectionRange(0, 0);
        };
        leftBtns.appendChild(copyButton);

        if (this.shortIsSupported()) {
            const shortButton = document.createElement("button");
            shortButton.textContent = Locale.LS("Create short URL");
            shortButton.onclick = () => {
                shortButton.style.display = "none";
                ExportAsUrlDialog.createShort(requrl, this.textArea);
            };
            hp.appendChild(shortButton);
        }
    }
}

// Register on window so CommandManager can access without a circular import
(window as any).ExportAsUrlDialog = ExportAsUrlDialog;
