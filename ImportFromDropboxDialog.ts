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
import { ImportFromDropbox } from "./ImportFromDropbox";

export class ImportFromDropboxDialog extends Dialog {
    static sim: CirSim;

    static setSim(csim: CirSim): void {
        ImportFromDropboxDialog.sim = csim;
    }

    static doLoadCallback(s: string): void {
        ImportFromDropboxDialog.sim.undoManager?.pushUndo();
        ImportFromDropboxDialog.sim.readCircuit(s);
        ImportFromDropboxDialog.sim.allowSave(false);
    }

    static doDropboxImport(link: string): void {
        try {
            const xhr = new XMLHttpRequest();
            xhr.addEventListener("load", function reqListener() {
                const text = xhr.responseText;
                ImportFromDropboxDialog.doLoadCallback(text);
            });
            xhr.open("GET", link, false);
            xhr.send();
        }
        catch (err) {
        }
    }

    static doImportDropboxLink(link: string, validateIsDropbox: boolean): void {
        if (validateIsDropbox && link.indexOf("https://www.dropbox.com/") != 0) {
            window.alert("Dropbox links must start https://www.dropbox.com/");
            return;
        }
        // Work-around to allow CORS access to dropbox links - see
        // https://www.dropboxforum.com/t5/API-support/CORS-issue-when-trying-to-download-shared-file/m-p/82466
        link = link.replace("www.dropbox.com", "dl.dropboxusercontent.com");
        ImportFromDropboxDialog.doDropboxImport(link);
    }

    constructor(csim: CirSim) {
        super();
        ImportFromDropboxDialog.setSim(csim);

        this.closeOnEnter = false;

        this.dialogEl.innerHTML = "";

        const title = document.createElement("div");
        title.textContent = Locale.LS("Import from Dropbox");
        title.style.fontWeight = "bold";
        title.style.marginBottom = "8px";
        this.dialogEl.appendChild(title);

        let la: HTMLLabelElement | HTMLDivElement;
        if (ImportFromDropbox.isSupported()) {
            const label = document.createElement("div");
            label.textContent = Locale.LS("To open a file in your dropbox account using the chooser click below.");
            this.dialogEl.appendChild(label);

            const chooserButton = document.createElement("button");
            chooserButton.textContent = Locale.LS("Open Dropbox Chooser");
            chooserButton.addEventListener("click", () => {
                this.closeDialog();
                new ImportFromDropbox(csim);
            });
            this.dialogEl.appendChild(chooserButton);

            la = document.createElement("div");
            la.textContent = Locale.LS("To open a shared Dropbox file from a Dropbox link paste the link below...");
        } else {
            const label = document.createElement("div");
            label.textContent = "This site, or your browser doesn't support the Dropbox chooser so you can't pick a file from your dropbox account.";
            this.dialogEl.appendChild(label);

            la = document.createElement("div");
            la.textContent = "You can open a shared Dropbox file if you have a link. Paste the Dropbox link below...";
            la.style.marginTop = "8px";
        }
        this.dialogEl.appendChild(la);

        const ta = document.createElement("textarea");
        ta.style.width = "300px";
        ta.style.height = "200px";
        ta.style.display = "block";
        this.dialogEl.appendChild(ta);

        const hp = document.createElement("div");
        hp.style.display = "flex";
        hp.style.justifyContent = "space-between";
        hp.style.marginTop = "8px";
        this.dialogEl.appendChild(hp);

        const importButton = document.createElement("button");
        importButton.textContent = Locale.LS("Import From Dropbox Link");
        importButton.addEventListener("click", () => {
            this.closeDialog();
            ImportFromDropboxDialog.doImportDropboxLink(ta.value, true);
        });
        hp.appendChild(importButton);

        const cancelButton = document.createElement("button");
        cancelButton.textContent = Locale.LS("Cancel");
        cancelButton.addEventListener("click", () => this.closeDialog());
        hp.appendChild(cancelButton);

        this.show();
    }
}

(window as any).ImportFromDropboxDialog = ImportFromDropboxDialog;
