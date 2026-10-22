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
import { CircuitElm } from "./CircuitElm";
import { ScrollValuePopup } from "./ScrollValuePopup";
import { Locale } from "./Locale";

// popup for toggling MOSFET/JFET/transistor type on scroll wheel, similar to
// ScrollValuePopup for R/C/L values
export class TypeScrollPopup {

    private myElm: any;
    private sim: CirSim;
    private originalPnp: number;
    private currentPnp: number;
    private typeLabel!: HTMLDivElement;
    private deltaY = 0;

    private panel: HTMLDivElement;
    private closed = false;

    private readonly onWheel = (e: WheelEvent) => {
        e.preventDefault();
        this.doDeltaY(ScrollValuePopup.normalizeWheelDelta(e));
    };
    private readonly onMouseOut = () => this.close(true);
    private readonly onMouseDown = (e: MouseEvent) => {
        if (e.button === 0 || e.button === 1)
            this.close(true);
        else
            this.close(false);
    };

    constructor(x: number, y: number, dy: number, elm: CircuitElm, sim: CirSim) {
        this.myElm = elm;
        this.sim = sim;
        this.sim.undoManager.pushUndo();

        this.originalPnp = this.myElm.pnp;
        this.currentPnp = this.originalPnp;

        this.panel = document.createElement("div");
        this.panel.className = "scrollValuePopup";

        const header = document.createElement("div");
        header.className = "scrollValuePopup-label off2";
        header.textContent = this.getHeaderText();
        this.panel.appendChild(header);

        this.typeLabel = document.createElement("div");
        this.typeLabel.className = "scrollValuePopup-label selected";
        this.panel.appendChild(this.typeLabel);
        this.updateLabel();

        this.panel.addEventListener("wheel", this.onWheel, { passive: false });
        this.panel.addEventListener("mouseout", this.onMouseOut);
        this.panel.addEventListener("mousedown", this.onMouseDown);

        this.doDeltaY(dy);

        // position off-screen first so we can measure it, then place it relative to (x, y)
        // and clamp to stay on-screen, matching the GWT PositionCallback behavior
        this.panel.style.visibility = "hidden";
        document.body.appendChild(this.panel);
        const w = this.panel.offsetWidth;
        const h = this.panel.offsetHeight;
        const left = Math.max(0, x - w / 4);
        const top = Math.max(0, y - h / 2);
        this.panel.style.left = left + "px";
        this.panel.style.top = top + "px";
        this.panel.style.visibility = "";
    }

    private getHeaderText(): string {
        if (this.myElm.isJfetElm())
            return Locale.LS("JFET Type");
        if (this.myElm.isMosfetElm())
            return Locale.LS("MOSFET Type");
        return Locale.LS("Transistor Type");
    }

    doDeltaY(dy: number): void {
        this.deltaY += dy;
        // toggle on every 30 units of scroll (same sensitivity as ScrollValuePopup)
        while (this.deltaY >= 30) {
            this.deltaY -= 30;
            this.toggle();
        }
        while (this.deltaY <= -30) {
            this.deltaY += 30;
            this.toggle();
        }
    }

    private toggle(): void {
        const e = this.myElm;
        if (e.isMosfetElm()) {
            e.pnp = -e.pnp;
            e.flags ^= e.FLAG_PNP;
            e.setPoints();
            this.currentPnp = e.pnp;
        } else if (e.isTransistorElm()) {
            e.pnp = -e.pnp;
            e.setPoints();
            this.currentPnp = e.pnp;
        }
        this.sim.needAnalyze();
        this.updateLabel();
    }

    private updateLabel(): void {
        let text: string;
        if (this.myElm.isMosfetElm()) {
            text = this.myElm.isJfetElm()
                ? (this.currentPnp === -1 ? Locale.LS("P-Channel JFET") : Locale.LS("N-Channel JFET"))
                : (this.currentPnp === -1 ? Locale.LS("P-Channel") : Locale.LS("N-Channel"));
        } else {
            text = this.currentPnp === -1 ? "PNP" : "NPN";
        }
        this.typeLabel.textContent = text;
    }

    close(keepChanges: boolean): void {
        if (this.closed)
            return;
        this.closed = true;
        if (!keepChanges) {
            // revert to original state
            while (this.currentPnp !== this.originalPnp)
                this.toggle();
        }
        this.panel.remove();
        CirSim.typeScrollPopup = null;
    }

    isShowing(): boolean {
        return !this.closed;
    }
}
