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

// asks for image format (PNG/SVG) and background options, then exports a scope
export class ScopeExportImageDialog extends Dialog {
    // remember last choices for the session
    static lastSVG: boolean = false;
    static lastTransparent: boolean = false;

    private scope: any;
    private svgRadio: HTMLInputElement;
    private transparentCheck: HTMLInputElement;

    constructor(scope: any) {
        super();
        this.scope = scope;

        const titleEl = document.createElement("h3");
        titleEl.textContent = Locale.LS("Export Image");
        titleEl.style.margin = "0 0 8px 0";
        this.dialogEl.appendChild(titleEl);

        const addRadio = (text: string, checked: boolean): HTMLInputElement => {
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "scopeExportFormat";
            radio.checked = checked;
            const label = document.createElement("label");
            label.style.display = "block";
            label.style.margin = "4px 0";
            label.appendChild(radio);
            label.appendChild(document.createTextNode(" " + Locale.LS(text)));
            this.dialogEl.appendChild(label);
            return radio;
        };
        addRadio("PNG", !ScopeExportImageDialog.lastSVG);
        this.svgRadio = addRadio("SVG", ScopeExportImageDialog.lastSVG);

        this.transparentCheck = document.createElement("input");
        this.transparentCheck.type = "checkbox";
        this.transparentCheck.checked = ScopeExportImageDialog.lastTransparent;
        const tLabel = document.createElement("label");
        tLabel.style.display = "block";
        tLabel.style.margin = "8px 0 4px 0";
        tLabel.appendChild(this.transparentCheck);
        tLabel.appendChild(document.createTextNode(" " + Locale.LS("Transparent Background")));
        this.dialogEl.appendChild(tLabel);

        const hp = document.createElement("div");
        hp.style.display = "flex";
        hp.style.gap = "8px";
        hp.style.marginTop = "8px";
        this.dialogEl.appendChild(hp);

        const okButton = document.createElement("button");
        okButton.textContent = Locale.LS("OK");
        okButton.addEventListener("click", () => {
            if (this.apply())
                this.closeDialog();
        });
        hp.appendChild(okButton);

        const cancelButton = document.createElement("button");
        cancelButton.textContent = Locale.LS("Cancel");
        cancelButton.addEventListener("click", () => this.closeDialog());
        hp.appendChild(cancelButton);
    }

    apply(): boolean {
        const svg = this.svgRadio.checked;
        const transparent = this.transparentCheck.checked;
        ScopeExportImageDialog.lastSVG = svg;
        ScopeExportImageDialog.lastTransparent = transparent;
        if (svg)
            this.scope.exportSVG(transparent);
        else
            this.scope.exportPNG(transparent);
        return true;
    }
}

// Register on window so Scope can access without a circular import
(window as any).ScopeExportImageDialog = ScopeExportImageDialog;
