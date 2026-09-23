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

export class AboutBox extends Dialog {

    constructor(version: string) {
        super();

        // Add versionString variable to SessionStorage for iFrame in AboutBox
        sessionStorage.setItem("versionString", version);

        const vp = document.createElement("div");
        vp.style.width = "400px";
        this.dialogEl.appendChild(vp);

        const iframe = document.createElement("iframe");
        iframe.src = "circuitjs/about.html";
        iframe.width = "400";
        iframe.height = "430";
        iframe.scrolling = "auto";
        iframe.frameBorder = "0";
        vp.appendChild(iframe);

        vp.appendChild(document.createElement("br"));

        const okButton = document.createElement("button");
        okButton.textContent = "OK";
        okButton.onclick = () => this.closeDialog();
        vp.appendChild(okButton);

        this.show();
    }
}

(window as any).AboutBox = AboutBox;
