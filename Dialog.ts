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
        this.setupDragging();
    }

    // Dialogs were draggable in the GWT version (DialogBox dragged by its caption).
    // Native <dialog> elements aren't, so implement dragging here: pressing anywhere
    // on the dialog that isn't an interactive control starts a drag.
    private dlgDragging: boolean = false;
    private dlgDragStartX: number = 0;
    private dlgDragStartY: number = 0;
    private dragOrigLeft: number = 0;
    private dragOrigTop: number = 0;
    private dragPointerId: number = -1;

    private static readonly NO_DRAG_SELECTOR =
        "input, button, select, textarea, a, option, canvas, [contenteditable]";

    private setupDragging(): void {
        this.dialogEl.addEventListener("pointerdown", (e: PointerEvent) => {
            if (e.button !== 0)
                return;
            const target = e.target as HTMLElement | null;
            if (!target || target.closest(Dialog.NO_DRAG_SELECTOR))
                return;
            // don't start a drag on the backdrop (clicks outside the dialog box
            // are still reported with the dialog as target)
            const r = this.dialogEl.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right ||
                e.clientY < r.top || e.clientY > r.bottom)
                return;
            this.dlgDragStartX = e.clientX;
            this.dlgDragStartY = e.clientY;
            this.dragOrigLeft = r.left;
            this.dragOrigTop = r.top;
            this.dragPointerId = e.pointerId;
            this.dlgDragging = false;
            this.dialogEl.setPointerCapture(e.pointerId);
        });

        this.dialogEl.addEventListener("pointermove", (e: PointerEvent) => {
            if (this.dragPointerId !== e.pointerId)
                return;
            const dx = e.clientX - this.dlgDragStartX;
            const dy = e.clientY - this.dlgDragStartY;
            if (!this.dlgDragging) {
                // small threshold so that clicks and text selection still work
                if (Math.abs(dx) < 3 && Math.abs(dy) < 3)
                    return;
                this.dlgDragging = true;
                // switch from the browser's automatic centering to explicit
                // positioning, keeping the dialog where it currently is
                const r = this.dialogEl.getBoundingClientRect();
                this.dialogEl.style.margin = "0";
                this.dialogEl.style.position = "fixed";
                this.dialogEl.style.left = r.left + "px";
                this.dialogEl.style.top = r.top + "px";
                this.dragOrigLeft = r.left;
                this.dragOrigTop = r.top;
                const sel = window.getSelection();
                if (sel) sel.removeAllRanges();
            }
            e.preventDefault();
            this.moveTo(this.dragOrigLeft + dx, this.dragOrigTop + dy);
        });

        const endDrag = (e: PointerEvent) => {
            if (this.dragPointerId !== e.pointerId)
                return;
            if (this.dialogEl.hasPointerCapture(e.pointerId))
                this.dialogEl.releasePointerCapture(e.pointerId);
            this.dragPointerId = -1;
            this.dlgDragging = false;
        };
        this.dialogEl.addEventListener("pointerup", endDrag);
        this.dialogEl.addEventListener("pointercancel", endDrag);
    }

    // move the dialog to the given viewport position, keeping it on screen
    private moveTo(x: number, y: number): void {
        const w = this.dialogEl.offsetWidth;
        const margin = 20;
        x = Math.max(margin - w, Math.min(x, window.innerWidth - margin));
        y = Math.max(0, Math.min(y, window.innerHeight - margin));
        this.dialogEl.style.left = x + "px";
        this.dialogEl.style.top = y + "px";
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
