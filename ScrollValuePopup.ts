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
import { EditInfo } from "./EditInfo";

// popup shown when the mouse wheel is scrolled over a resistor/capacitor/inductor: scrolling
// steps the value through the E12 preferred-value series, previewing a few neighboring values
export class ScrollValuePopup {

    static readonly e12: number[] = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
    static readonly labMax = 5;
    static readonly scale = 6;

    private values: number[] = [];
    private minpow = 0;
    private maxpow = 1;
    private nvalues = 0;
    private currentidx = 0;
    private lastidx = 0;
    private myElm: CircuitElm;
    private labels: HTMLDivElement[] = [];
    private deltaY = 0;
    private name = "";
    private inf!: EditInfo;
    private sim: CirSim;

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
        this.setupValues();

        this.panel = document.createElement("div");
        this.panel.className = "scrollValuePopup";

        const nameLabel = document.createElement("div");
        nameLabel.className = "scrollValuePopup-name";
        nameLabel.textContent = this.name;
        this.panel.appendChild(nameLabel);

        for (let i = 0; i < ScrollValuePopup.labMax; i++) {
            const label = document.createElement("div");
            label.textContent = "---";
            label.className = "scrollValuePopup-label" +
                (i === 2 ? " selected" : (i === 1 || i === 3) ? " off1" : " off2");
            this.panel.appendChild(label);
            this.labels.push(label);
        }

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
        const top = Math.max(0, y - 7 * h / 12);
        this.panel.style.left = left + "px";
        this.panel.style.top = top + "px";
        this.panel.style.visibility = "";
    }

    private setupValues(): void {
        if (this.myElm.isResistorElm()) {
            this.minpow = -1;
            this.maxpow = 7;
        }
        if (this.myElm.isCapacitorElm()) {
            this.minpow = -11;
            this.maxpow = -3;
        }
        if (this.myElm.isInductorElm()) {
            this.minpow = -6;
            this.maxpow = 0;
        }
        this.values = new Array(2 + (this.maxpow - this.minpow) * 12);
        let ptr = 0;
        for (let i = this.minpow; i <= this.maxpow; i++) {
            const jmax = (i !== this.maxpow) ? 12 : 1;
            for (let j = 0; j < jmax; j++, ptr++)
                this.values[ptr] = Math.pow(10.0, i) * ScrollValuePopup.e12[j];
        }
        this.nvalues = ptr;
        this.values[this.nvalues] = 1e99;
        this.inf = this.myElm.getEditInfo(0)!;
        const currentvalue = this.inf.value;
        for (let i = 0; i < this.nvalues + 1; i++) {
            if (CircuitElm.getShortUnitText(currentvalue, "") === CircuitElm.getShortUnitText(this.values[i], "")) {
                // match to an existing value
                this.values[i] = currentvalue; // just in case it isn't 100% identical
                this.currentidx = i;
                break;
            }
            if (currentvalue < this.values[i]) {
                // overshot - need to insert value
                this.currentidx = i;
                for (let j = this.nvalues - 1; j >= i; j--)
                    this.values[j + 1] = this.values[j];
                this.values[i] = currentvalue;
                this.nvalues++;
                break;
            }
        }
        this.name = this.inf.name;
        this.lastidx = this.currentidx;
    }

    private setupLabels(): void {
        const thissel = this.getSelIdx();
        for (let i = 0; i < ScrollValuePopup.labMax; i++) {
            const label = this.labels[i];
            label.classList.remove("current");
            const idx = thissel + i - 2;
            if (idx < 0 || idx >= this.nvalues)
                label.textContent = "---";
            else {
                label.textContent = CircuitElm.getShortUnitText(this.values[idx], "");
                if (idx === this.currentidx)
                    label.classList.add("current");
            }
        }
    }

    close(keepChanges: boolean): void {
        if (this.closed)
            return;
        this.closed = true;
        if (!keepChanges)
            this.setElmValue(this.currentidx);
        else
            this.setElmValue();
        this.panel.remove();
    }

    isShowing(): boolean {
        return !this.closed;
    }

    doDeltaY(dy: number): void {
        this.deltaY += dy / (window.devicePixelRatio || 1);
        this.setElmValue();
        this.setupLabels();
    }

    private setElmValue(i: number = this.getSelIdx()): void {
        if (i !== this.lastidx) {
            this.lastidx = i;
            this.inf.value = this.values[i];
            this.myElm.setEditValue(0, this.inf);
            this.sim.needAnalyze();
        }
    }

    // GWT's MouseWheelEvent.getDeltaY() (which the constants below, like scale, were tuned
    // against) came out much smaller than the raw pixel deltaY a native 'wheel' event gives
    // us - GWT computed it from the legacy, non-standard wheelDelta property, whose ratio to
    // deltaY turned out not to be the fixed cross-browser constant it's classically assumed
    // to be. 0.12 is an empirically-chosen scale-down factor, not a derived conversion.
    static normalizeWheelDelta(e: WheelEvent): number {
        return Math.round(e.deltaY * 0.12) || 0;
    }

    getSelIdx(): number {
        let r = this.currentidx + Math.round(this.sim.mouse.wheelSensitivity * this.deltaY / ScrollValuePopup.scale);
        if (r < 0)
            r = 0;
        if (r >= this.nvalues)
            r = this.nvalues - 1;
        return r;
    }
}
