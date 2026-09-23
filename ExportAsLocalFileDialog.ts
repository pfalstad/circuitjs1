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
import { Locale } from "./Locale";

export class ExportAsLocalFileDialog extends Dialog {
    static lastFileName: string | null = null;
    private textBox: HTMLInputElement;
    private blobUrl: string;

    static downloadIsSupported(): boolean {
        return "download" in document.createElement("a");
    }

    static getBlobUrl(data: string): string {
        const oldBlob = (document as any).exportBlob;
        if (oldBlob)
            URL.revokeObjectURL(oldBlob);
        const blob = new Blob([data], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        (document as any).exportBlob = url;
        return url;
    }

    static setLastFileName(s: string | null): void {
        // remember filename for use when saving a new file.
        // if s is null or automatically generated then just clear out old filename.
        if (s == null || s.startsWith("circuitjs-"))
            ExportAsLocalFileDialog.lastFileName = null;
        else
            ExportAsLocalFileDialog.lastFileName = s;
    }

    constructor(data: string) {
        super();

        this.dialogEl.innerHTML = "";

        const titleEl = document.createElement("h3");
        titleEl.textContent = Locale.LS("Export as Local File");
        titleEl.style.margin = "0 0 8px 0";
        this.dialogEl.appendChild(titleEl);

        const label = document.createElement("div");
        label.textContent = Locale.LS("File name:");
        this.dialogEl.appendChild(label);

        const tb = document.createElement("input");
        tb.type = "text";
        tb.style.width = "250px";
        this.textBox = tb;
        this.dialogEl.appendChild(tb);

        this.blobUrl = ExportAsLocalFileDialog.getBlobUrl(data);

        let fname: string;
        if (ExportAsLocalFileDialog.lastFileName != null) {
            fname = ExportAsLocalFileDialog.lastFileName;
        } else {
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, "0");
            const ts = now.getFullYear().toString()
                + pad(now.getMonth() + 1)
                + pad(now.getDate())
                + "-"
                + pad(now.getHours())
                + pad(now.getMinutes())
                + pad(now.getSeconds());
            fname = "circuitjs-" + ts + ".txt";
        }
        tb.value = fname;

        const hp = document.createElement("div");
        hp.style.display = "flex";
        hp.style.justifyContent = "space-between";
        hp.style.marginTop = "8px";
        this.dialogEl.appendChild(hp);

        const okButton = document.createElement("button");
        okButton.textContent = Locale.LS("OK");
        okButton.onclick = () => {
            this.apply();
            this.closeDialog();
        };
        hp.appendChild(okButton);

        const cancelButton = document.createElement("button");
        cancelButton.textContent = Locale.LS("Cancel");
        cancelButton.onclick = () => this.closeDialog();
        hp.appendChild(cancelButton);
    }

    apply(): boolean {
        let fname = this.textBox.value;
        if (!fname.includes("."))
            fname += ".txt";
        ExportAsLocalFileDialog.setLastFileName(fname);
        const a = document.createElement("a");
        a.href = this.blobUrl;
        a.setAttribute("download", fname);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return true;
    }
}
