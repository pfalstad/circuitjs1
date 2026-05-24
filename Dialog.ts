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

import { CirSim } from "./CirSim";

export class Dialog {
    closeOnEnter: boolean = true;
    protected dialogEl: HTMLDialogElement;

    constructor() {
        this.dialogEl = document.createElement("dialog");
        this.dialogEl.classList.add("circuitDialog");
        document.body.appendChild(this.dialogEl);
        this.dialogEl.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") this.enterPressed();
            if (e.key === "Escape") { e.preventDefault(); this.closeDialog(); }
        });
    }

    isShowing(): boolean { return this.dialogEl.open; }

    show(): void {
        this.dialogEl.showModal();
        CirSim.dialogShowing = this;
    }

    setVisible(visible: boolean): void {
        if (visible) this.show();
        else this.closeDialog();
    }

    closeDialog(): void {
        if (this.dialogEl.open)
            this.dialogEl.close();
        if (CirSim.dialogShowing === this)
            CirSim.dialogShowing = null;
        document.body.removeChild(this.dialogEl);
    }

    enterPressed(): void {
        if (this.closeOnEnter && this.apply())
            this.closeDialog();
    }

    apply(): boolean { return true; }
}
