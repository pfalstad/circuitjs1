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
import { ImageExporter } from "./ImageExporter";

export class ExportAsImageDialog extends Dialog {
    textBox: HTMLInputElement;
    dataURL: string;
    ext: string;

    // string may have unicode text in it, so we don't just call btoa()
    static b64encode(a: string): string {
        return window.btoa(unescape(encodeURIComponent(a)));
    }

    constructor(type: number, sim: CirSim) {
        super();

        this.dialogEl.innerHTML = "";

        const titleEl = document.createElement("h3");
        titleEl.textContent = Locale.LS("Save as Image");
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

        const imageExporter: ImageExporter = sim.imageExporter;
        this.ext = ".png";
        if (type === ImageExporter.CAC_IMAGE) {
            this.dataURL = imageExporter.getCircuitAsCanvas(type).toDataURL();
        } else {
            const data = imageExporter.getCircuitAsSVG();
            this.dataURL = "data:text/plain;base64," + ExportAsImageDialog.b64encode(data);
            this.ext = ".svg";
        }
        this.textBox.value = ImageExporter.defaultFileName(this.ext);

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
            fname += this.ext;
        const a = document.createElement("a");
        a.textContent = fname;
        a.href = this.dataURL;
        a.setAttribute("download", fname);
        this.dialogEl.appendChild(a);
        a.click();
        return true;
    }
}

// Register on window so CommandManager can access without a circular import
(window as any).ExportAsImageDialog = ExportAsImageDialog;
